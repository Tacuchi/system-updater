import { describe, it, expect } from 'vitest';
import {
  logCommand,
  logResult,
  getLogEntries,
  formatResultLines,
  formatRunSummary,
  formatRunClosure,
} from './logger.js';
import type { RunSummaryLog } from './logger.js';
import type { CommandRecord, UpgradeResult } from '../managers/types.js';
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pruneLogs, unremovableCommand } from './log-retention.js';
import type { RetentionDeps } from './log-retention.js';

describe('logCommand', () => {
  it('records the executed command in the in-memory buffer', () => {
    const before = getLogEntries().length;
    const rec: CommandRecord = {
      cmd: 'brew upgrade git',
      exitCode: 0,
      durationMs: 12,
      timedOut: false,
      stdoutTail: 'ok',
      stderrTail: '',
    };
    logCommand(rec);
    const entries = getLogEntries();
    expect(entries.length).toBe(before + 1);
    expect(entries[entries.length - 1]?.message).toContain('brew upgrade git');
  });
});

describe('logResult', () => {
  it('records a summary entry tagged with the manager id', () => {
    const r: UpgradeResult = {
      success: false,
      upgraded: 1,
      failed: 2,
      errors: ['numpy: no se pudo actualizar (COMMAND_FAILED)'],
      managerId: 'pip',
      status: 'partial',
      reason: 'PARTIAL',
    };
    logResult(r);
    const last = getLogEntries().at(-1);
    expect(last?.message).toContain('pip');
    expect(last?.level).toBe('warn');
  });
});

describe('formatResultLines', () => {
  it('emits the verdict, real duration, and a line per package with version delta', () => {
    const r: UpgradeResult = {
      success: true,
      upgraded: 1,
      failed: 0,
      errors: [],
      managerId: 'brew',
      status: 'success',
      startedAt: 1_000,
      finishedAt: 3_500,
      packages: [
        { name: 'git', outcome: 'upgraded', fromVersion: '2.40', toVersion: '2.44' },
        { name: 'node', outcome: 'unchanged' },
      ],
    };
    const lines = formatResultLines(r);
    expect(lines[0]).toContain('brew: status=success upgraded=1 failed=0');
    expect(lines).toContain('  brew: duration=2500ms');
    expect(lines).toContain('  brew: git 2.40->2.44 [upgraded]');
    expect(lines).toContain('  brew: node [unchanged]');
  });

  it('omits the duration line when timings are absent', () => {
    const r: UpgradeResult = { success: true, upgraded: 0, failed: 0, errors: [], managerId: 'npm', status: 'noop' };
    expect(formatResultLines(r).some(l => l.includes('duration='))).toBe(false);
  });
});

describe('formatRunSummary', () => {
  // One vocabulary: these are UpgradeStatus values, the same ones the
  // per-manager verdict uses. `done` and `skipped` are the UI's words and the
  // type no longer accepts them here.
  const summary: RunSummaryLog = {
    upgraded: 3,
    failed: 1,
    skipped: 1,
    unknown: 1,
    managers: [
      { id: 'brew', status: 'success', upgraded: 2, failed: 0, durationMs: 1_200 },
      { id: 'winget', status: 'failed', upgraded: 1, failed: 1 },
      { id: 'choco', status: 'noop', upgraded: 0, failed: 0 },
      { id: 'gem', status: 'unknown', upgraded: 0, failed: 0 },
    ],
  };

  it('formats a plain-text block with per-manager lines and totals (no JSON)', () => {
    const lines = formatRunSummary(summary);
    expect(lines[0]).toContain('Resumen del run');
    expect(lines).toContain('  brew: success (2 ok, 0 fail) 1200ms');
    expect(lines).toContain('  winget: failed (1 ok, 1 fail)');
    expect(lines).toContain('  gem: unknown (0 ok, 0 fail)');
    expect(lines.at(-1)).toBe('Total: 3 upgraded · 1 failed · 1 skipped · 1 unknown');
    expect(lines.join('\n')).not.toContain('{');
  });
});

describe('formatRunClosure', () => {
  const summary: RunSummaryLog = {
    upgraded: 2,
    failed: 0,
    skipped: 0,
    unknown: 0,
    managers: [{ id: 'brew', status: 'success', upgraded: 2, failed: 0, durationMs: 900 }],
  };

  it('cierra con el modo de término en la ÚLTIMA línea, después del resumen', () => {
    const lines = formatRunClosure('completa', summary);
    expect(lines[0]).toContain('Resumen del run');
    expect(lines).toContain('  brew: success (2 ok, 0 fail) 900ms');
    expect(lines.at(-1)).toBe('Cierre del run: modo=completa');
  });

  it('cierra igual cuando no hay resumen: una corrida que salió antes de correr nada', () => {
    expect(formatRunClosure('cancelada', null)).toEqual(['Cierre del run: modo=cancelada']);
  });

  it('conserva el detalle que distingue una salida de otra', () => {
    expect(formatRunClosure('interrumpida', null, 'señal SIGHUP').at(-1)).toBe(
      'Cierre del run: modo=interrumpida (señal SIGHUP)',
    );
  });
});

describe('un paquete fallido deja UNA entrada', () => {
  it('la razón viaja en la línea del paquete, no en una segunda casi idéntica', () => {
    const r: UpgradeResult = {
      success: false,
      upgraded: 0,
      failed: 1,
      errors: ['numpy: no se pudo actualizar (COMMAND_FAILED)'],
      managerId: 'pip',
      status: 'failed',
      reason: 'COMMAND_FAILED',
      packages: [{ name: 'numpy', outcome: 'failed', failureKind: 'COMMAND_FAILED', fromVersion: '1.0', toVersion: '2.0' }],
    };
    const lines = formatResultLines(r);
    const aboutNumpy = lines.filter(l => l.includes('numpy'));
    expect(aboutNumpy).toHaveLength(1);
    expect(aboutNumpy[0]).toBe('  pip: numpy 1.0->2.0 [failed] (COMMAND_FAILED)');
  });

  it('un fallo sin paquetes al que atribuirlo sí deja su línea de error', () => {
    const r: UpgradeResult = {
      success: false,
      upgraded: 0,
      failed: 0,
      errors: ['no se pudo determinar la lista de pendientes (exit=2)'],
      managerId: 'gem',
      status: 'unknown',
    };
    // formatResultLines no inventa una línea de paquete cuando no hay paquetes;
    // logResult es el que agrega los errores sueltos en ese caso.
    expect(formatResultLines(r).some(l => l.includes('numpy'))).toBe(false);
    const before = getLogEntries().length;
    logResult(r);
    expect(getLogEntries().length).toBe(before + 1);
  });
});

describe('retención del depósito por cantidad de corridas', () => {
  // El depósito sembrado vive en fixtures/, por encima del límite y con archivos
  // que este proceso no puede retirar — la forma del depósito real: 121 archivos
  // desde marzo, 49 de ellos de root por las corridas elevadas.
  const fixture = JSON.parse(readFileSync(join('fixtures', 'log-deposit.json'), 'utf-8')) as {
    limit: number;
    entries: { name: string; ageMinutes: number; unremovable: boolean }[];
  };

  function deposit() {
    const now = Date.now();
    const files = fixture.entries.map(e => e.name);
    const blocked = new Set(fixture.entries.filter(e => e.unremovable).map(e => e.name));
    const removed: string[] = [];
    const deps: RetentionDeps = {
      listFiles: () => files,
      mtimeMs: file => {
        const name = basename(file);
        const entry = fixture.entries.find(e => e.name === name);
        return now - (entry?.ageMinutes ?? 0) * 60_000;
      },
      remove: file => {
        if (blocked.has(basename(file))) {
          const err = new Error('EACCES') as NodeJS.ErrnoException;
          err.code = 'EACCES';
          throw err;
        }
        removed.push(basename(file));
      },
    };
    return { deps, removed, blocked };
  }

  it('conserva las N corridas más recientes y retira las viejas', () => {
    const { deps, removed } = deposit();
    const report = pruneLogs('/dep', fixture.limit, deps);
    expect(fixture.entries.length).toBeGreaterThan(fixture.limit);
    expect(report.kept).toBe(fixture.limit);
    expect(report.removed).toBe(fixture.entries.length - fixture.limit - 2);
    // Las conservadas son las más nuevas: ninguna de ellas se intentó retirar.
    const newest = fixture.entries.slice(0, fixture.limit).map(e => e.name);
    expect(removed.some(r => newest.includes(r))).toBe(false);
  });

  it('informa los archivos que no puede retirar en vez de decir que los borró', () => {
    const { deps, blocked } = deposit();
    const report = pruneLogs('/dep', fixture.limit, deps);
    expect(report.unremovable).toHaveLength(blocked.size);
    expect(report.unremovable.every(u => u.reason === 'sin permiso')).toBe(true);
  });

  it('no borra nada cuando el depósito está por debajo del límite', () => {
    const { deps, removed } = deposit();
    const report = pruneLogs('/dep', 100, deps);
    expect(report.removed).toBe(0);
    expect(removed).toEqual([]);
    expect(report.kept).toBe(fixture.entries.length);
  });

  it('un límite absurdo se acota a una corrida, nunca a cero', () => {
    const { deps } = deposit();
    expect(pruneLogs('/dep', 0, deps).kept).toBe(1);
  });

  it('en unix el informe trae el comando que los retira; en Windows ese caso no existe', () => {
    expect(unremovableCommand(['/l/a.log'], 'darwin')).toBe("sudo rm -f '/l/a.log'");
    expect(unremovableCommand(['/l/a.log'], 'linux')).toContain('sudo rm -f');
    // Una consola elevada de Windows corre como el mismo usuario: el archivo que
    // dejó una corrida elevada lo puede retirar una corrida normal.
    expect(unremovableCommand(['C:/l/a.log'], 'win32')).toBeNull();
    expect(unremovableCommand([], 'darwin')).toBeNull();
  });
});
