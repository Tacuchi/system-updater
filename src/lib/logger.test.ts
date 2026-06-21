import { describe, it, expect } from 'vitest';
import {
  logCommand,
  logResult,
  getLogEntries,
  formatResultLines,
  formatRunSummary,
  logRunSummary,
} from './logger.js';
import type { CommandRecord, UpgradeResult } from '../managers/types.js';

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

describe('formatRunSummary / logRunSummary', () => {
  const summary = {
    upgraded: 3,
    failed: 1,
    skipped: 1,
    managers: [
      { id: 'brew', status: 'done', upgraded: 2, failed: 0, durationMs: 1_200 },
      { id: 'winget', status: 'failed', upgraded: 1, failed: 1 },
      { id: 'choco', status: 'skipped', upgraded: 0, failed: 0 },
    ],
  };

  it('formats a plain-text block with per-manager lines and totals (no JSON)', () => {
    const lines = formatRunSummary(summary);
    expect(lines[0]).toContain('Resumen del run');
    expect(lines).toContain('  brew: done (2 ok, 0 fail) 1200ms');
    expect(lines).toContain('  winget: failed (1 ok, 1 fail)');
    expect(lines.at(-1)).toBe('Total: 3 upgraded · 1 failed · 1 skipped');
    expect(lines.join('\n')).not.toContain('{');
  });

  it('records a concise summary entry in the in-memory buffer', () => {
    const before = getLogEntries().length;
    logRunSummary(summary);
    const last = getLogEntries().at(-1);
    expect(getLogEntries().length).toBe(before + 1);
    expect(last?.message).toContain('3 ok');
  });
});
