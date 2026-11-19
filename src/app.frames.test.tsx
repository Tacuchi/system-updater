import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const fixture = vi.hoisted(() => ({ language: 'es' as 'es' | 'en', scenario: 'full', newer: true, hold: false, aborted: false, release: () => {} }));
vi.mock('execa', () => ({ execa: () => { throw new Error('System commands are forbidden in frame tests'); } }));
vi.mock('./lib/logger.js', () => ({
  initLogger: () => '', getLogFilePath: () => '~/.tacuchi-updater/logs/example.log',
  closeLogger: vi.fn(), logRunClosure: vi.fn(), logSelection: vi.fn(), error: vi.fn(), debug: vi.fn(),
}));
vi.mock('./lib/self-update.js', () => ({ checkForNewerSelf: async () => fixture.newer ? ({ newer: '3.1.0', howTo: 'npm install -g @tacuchi/updater@latest' }) : ({}) }));
vi.mock('./lib/config.js', async importOriginal => {
  const original = await importOriginal<typeof import('./lib/config.js')>();
  return { ...original, loadConfig: () => original.normalizeConfig({ language: fixture.language, selfCheck: false }), saveConfig: vi.fn() };
});
vi.mock('./managers/registry.js', () => ({
  detectManagers: async () => {
    if (fixture.scenario === 'failure') throw new Error('EACCES: permission denied');
    return [{ manager: {
      id: fixture.scenario === 'brew' ? 'brew' : 'npm', group: 'language', platforms: ['darwin', 'linux', 'win32'], requiresAdmin: false,
      listOutdated: async () => fixture.scenario === 'empty' ? [] : fixture.scenario === 'many'
        ? Array.from({ length: 40 }, (_, i) => ({ name: `package-${i}`, currentVersion: '1.0.0', newVersion: '5.7.2' })) : [
        { name: 'typescript', currentVersion: '5.6.3', newVersion: '5.7.2' },
        ...(fixture.scenario === 'partial' ? [{ name: 'prettier', currentVersion: '3.3.0', newVersion: '3.4.0' }] : []),
      ],
      async *upgrade() { throw new Error('Engine must be simulated'); },
    }, detection: { available: true, version: '10.0' } }];
  },
}));
vi.mock('./lib/exec/engine.js', () => ({
  runEngine: async (_tasks: unknown, options: import('./lib/exec/engine.js').EngineOptions) => {
    const managerId = fixture.scenario === 'brew' ? 'brew' : 'npm';
    options.onEvent?.({ managerId, phase: 'upgrading' });
    options.onEvent?.({ managerId, phase: 'upgrading', event: { type: 'progress', message: 'synthetic', package: 'typescript' } });
    if (fixture.hold) await new Promise<void>(resolve => {
      fixture.release = resolve;
      options.signal.addEventListener('abort', () => { fixture.aborted = true; }, { once: true });
    });
    else await new Promise(resolve => setTimeout(resolve, 150));
    options.onEvent?.({ managerId, phase: 'done', result: {
      success: fixture.scenario !== 'partial', status: fixture.scenario === 'partial' ? 'partial' : 'success', managerId: 'npm', upgraded: 1, failed: fixture.scenario === 'partial' ? 1 : 0, errors: [],
      packages: [
        { name: 'typescript', outcome: 'upgraded', fromVersion: '5.6.3', toVersion: '5.7.2' },
        ...(fixture.scenario === 'partial' ? [{ name: 'prettier', outcome: 'failed' as const, failureKind: 'COMMAND_FAILED' as const }] : []),
      ],
    } });
  },
}));
import stringWidth from 'string-width';
import App from './app.js';
import { setLanguage } from './i18n/index.js';
import { ASCII, g } from './lib/glyphs.js';
import { configureBanner } from './lib/banner.js';
import { placeholderRows } from './lib/terminal-image.js';

const pause = () => new Promise(resolve => setTimeout(resolve, 35));
type Handle = ReturnType<typeof render>;
async function waitFor(handle: Handle, text: string) {
  const deadline = Date.now() + 5000;
  while (!(handle.lastFrame() ?? '').includes(text)) {
    if (Date.now() > deadline) throw new Error(`Missing ${text}: ${handle.lastFrame()}`);
    await pause();
  }
  await pause();
}
const output = process.env['UPDATER_FRAME_DIR'] ?? join(tmpdir(), 'updater-frames');
const outputDirectory = () => { mkdirSync(output, { recursive: true }); return output; };
function capture(handle: Handle, name: string) {
  const frame = handle.lastFrame() ?? '';
  expect(frame.trim().length).toBeGreaterThan(0);
  const otherLanguage = fixture.language === 'en'
    ? /\b(?:Detectando|Buscando|seleccionados|paquetes|actualizados|fallidos|ajustes|volver|ninguno|salir|Idioma|Reinicio|COMPLETADO|Actualizando)\b/i
    : /\b(?:Detecting|Checking|selected|packages|upgraded|failed|settings|quit|Language|DONE|Updating|Usage)\b/i;
  expect(frame).not.toMatch(otherLanguage);
  if (ASCII) expect(frame).not.toMatch(/[✓✗⊘❯▸▆▁ⓘ▲▼→…◌›⟳]/);
  const width = process.stdout.columns ?? 100;
  for (const line of frame.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(width);
  expect(frame.split('\n')[0]).toContain('tacuchi');
  if (ASCII || process.env['NO_COLOR'] !== undefined) expect(frame.split('\n')[0]!.trimStart()).toMatch(/^tacuchi_/);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, `${name}.txt`), frame + '\n');
  return frame;
}
const columns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
const rows = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
const noColor = process.env['NO_COLOR'];
afterEach(() => {
  if (columns) Object.defineProperty(process.stdout, 'columns', columns);
  else Reflect.deleteProperty(process.stdout, 'columns');
  if (rows) Object.defineProperty(process.stdout, 'rows', rows);
  else Reflect.deleteProperty(process.stdout, 'rows');
  configureBanner(null);
  if (noColor === undefined) delete process.env['NO_COLOR'];
  else process.env['NO_COLOR'] = noColor;
});
const size = (width: number, height: number) => {
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: width });
  Object.defineProperty(process.stdout, 'rows', { configurable: true, value: height });
};
const image = { id: 42, columns: 8, rows: 3 };
const PLACEHOLDER = '\u{10EEEE}';
// The banner is drawn only when glyphs and colour are on; the suite also runs with TACUCHI_ASCII=1 and NO_COLOR=1.
const bannerAllowed = !ASCII && process.env['NO_COLOR'] === undefined;
function expectBanner(frame: string, third: string) {
  const lines = frame.split('\n');
  const placeholders = placeholderRows(image.id, image.columns, image.rows);
  for (let row = 0; row < 3; row++) expect(lines[row]!.startsWith('  ' + placeholders[row] + '  ')).toBe(true);
  expect(lines[0]).toMatch(/tacuchi updater 3\.\d+\.\d+/);
  expect(lines[1]).toMatch(/(?:macOS|Linux|Windows) · /);
  expect(lines[2]).toContain(third);
  expect(lines[3]!.trim()).toBe('');
}
/** The header this process must show: the banner, or the line header under ASCII or NO_COLOR. */
function expectHeader(frame: string, third: string) {
  if (bannerAllowed) expectBanner(frame, third);
  else expectLineHeader(frame);
}
function expectLineHeader(frame: string) {
  expect(frame).not.toContain(PLACEHOLDER);
  expect(frame.split('\n')[0]!.trimStart()).toMatch(/^tacuchi/);
}

describe('hermetic screen frames', () => {
  for (const language of ['es', 'en'] as const) for (const width of [100, 80, 60]) for (const newer of [false, true]) {
    it(`captures the full simulated flow in ${language} at ${width} columns, newer=${newer}`, async () => {
      fixture.language = language;
      fixture.scenario = 'full';
      fixture.newer = newer;
      setLanguage(language === 'es' ? 'en' : 'es');
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: width });
      const handle = render(<App />);
      const prefix = `${language}-${width}-${newer ? 'newer' : 'current'}`;
      try {
        const first = capture(handle, `${prefix}-detect`);
        expect(first).toContain(language === 'es' ? 'Detectando' : 'Detecting');
        expect(first.split('\n')[0]).toContain('1/4');
        expect(first).not.toMatch(/[▆▁]/);
        await waitFor(handle, '5.7.2');
        const select = capture(handle, `${prefix}-select`);
        expect(select).toContain(language === 'es' ? '0 de 1 marcados' : '0 of 1 marked');
        handle.stdin.write('s');
        await pause(); await pause();
        capture(handle, `${prefix}-settings`);
        handle.stdin.write('\u001b');
        await waitFor(handle, '5.7.2');
        handle.stdin.write('a');
        await pause(); await pause();
        expect(handle.lastFrame()).toContain(language === 'es' ? '1 de 1 marcado' : '1 of 1 marked');
        handle.stdin.write('\r');
        await pause(); await pause();
        capture(handle, `${prefix}-confirm`);
        handle.stdin.write('\r');
        await pause(); await pause();
        capture(handle, `${prefix}-update`);
        await waitFor(handle, language === 'es' ? 'COMPLETADO' : 'DONE');
        const summary = capture(handle, `${prefix}-summary`);
        expect(summary).toMatch(language === 'es' ? /\b1 actualizado\b/ : /\b1 upgraded\b/);
        expect(summary).not.toMatch(/\b0 (?:fallidos|manual|failed|undetermined)\b|0 \?/);
        expect(summary.includes('npm install -g @tacuchi/updater@latest')).toBe(newer);
        handle.stdin.write('d');
        await pause(); await pause();
        capture(handle, `${prefix}-detail`);
        handle.stdin.write('\u001b');
        await waitFor(handle, language === 'es' ? 'COMPLETADO' : 'DONE');
        expect(handle.lastFrame()).not.toContain(language === 'es' ? 'Detalle por paquete' : 'Per-package detail');
      } finally { handle.unmount(); }
    });
  }
  for (const scenario of ['empty', 'failure']) {
    it(`captures ${scenario} without executing commands`, async () => {
      fixture.scenario = scenario;
      fixture.language = 'es';
      setLanguage('es');
      const handle = render(<App />);
      try {
        await pause(); await pause(); await pause();
        capture(handle, scenario);
        expect(handle.lastFrame()).not.toContain('typescript');
      } finally { handle.unmount(); }
    });
  }
  it('shows detection failure and retries with R', async () => {
    fixture.scenario = 'failure'; fixture.language = 'es';
    const handle = render(<App />);
    try {
      await waitFor(handle, 'EACCES');
      expect(handle.lastFrame()).toContain('No se pudieron detectar');
      expect(handle.lastFrame()).toContain('R volver a buscar');
      expect(handle.lastFrame()).toContain('Q salir');
      fixture.scenario = 'full';
      handle.stdin.write('r');
      await waitFor(handle, '5.7.2');
      expect(handle.lastFrame()).not.toContain('EACCES');
    } finally { handle.unmount(); }
  });
  it('rescans from up to date and warns before continuing without selections', async () => {
    fixture.scenario = 'empty'; fixture.language = 'es';
    const handle = render(<App />);
    try {
      await waitFor(handle, 'Todo está al día');
      fixture.scenario = 'full'; handle.stdin.write('r');
      await waitFor(handle, '5.7.2');
      handle.stdin.write('\r');
      await waitFor(handle, 'Marca al menos');
      expect(handle.lastFrame()).toContain('Espacio marcar');
    } finally { handle.unmount(); }
  });
  for (const language of ['es', 'en'] as const) it(`never marks a partially failed manager as successful on screen in ${language}`, async () => {
    fixture.scenario = 'partial'; fixture.language = language;
    const handle = render(<App />);
    try {
      await waitFor(handle, '5.7.2');
      handle.stdin.write('a');
      await waitFor(handle, language === 'es' ? '2 de 2 marcados' : '2 of 2 marked');
      handle.stdin.write('\r');
      await waitFor(handle, language === 'es' ? 'Se ejecutará' : 'Will run');
      handle.stdin.write('\r');
      await waitFor(handle, language === 'es' ? 'CON ERRORES' : 'WITH ERRORS');
      const row = handle.lastFrame()!.split('\n').find(line => line.includes('Node NPM'));
      expect(row).toBeDefined();
      expect(row!.trimStart().startsWith(g.partial)).toBe(true);
    } finally { handle.unmount(); }
  });
  for (const language of ['es', 'en'] as const) it(`reports partial failures in redirected output in ${language}`, async () => {
    fixture.scenario = 'partial'; fixture.language = language;
    const exitCode = process.exitCode;
    let output = '';
    const handle = render(<App nonInteractive lineOutput={line => { output += line; }} />);
    try {
      const deadline = Date.now() + 5000;
      const summary = language === 'es' ? 'Resumen:' : 'Summary:';
      while (!output.includes(summary) && Date.now() < deadline) await pause();
      const resultLines = output.split('\n').filter(line => /^Node NPM: (?:PARCIAL|PARTIAL)\b/.test(line));
      expect(resultLines).toEqual([language === 'es' ? 'Node NPM: PARCIAL 1 actualizado, 1 fallido' : 'Node NPM: PARTIAL 1 upgraded, 1 failed']);
      expect(output.split('\n').find(line => line.startsWith(summary))).toBe(language === 'es' ? 'Resumen: 1 actualizado · 1 fallido'.replace('·', g.separator) : 'Summary: 1 upgraded · 1 failed'.replace('·', g.separator));
      expect(output).not.toMatch(/Node NPM: OK|\x1b|Q salir|Q quit/);
      expect(process.exitCode).toBe(1);
    } finally { handle.unmount(); process.exitCode = exitCode; }
  });
  it('writes plain redirected results without cursor controls or key hints', async () => {
    fixture.scenario = 'full';
    fixture.language = 'es';
    let output = '';
    const handle = render(<App nonInteractive lineOutput={line => { output += line; }} />);
    try {
      const deadline = Date.now() + 5000;
      while (!output.includes('Resumen:') && Date.now() < deadline) await pause();
      expect(output).toContain('Resumen:');
      expect(output).toContain('Node NPM: OK 1 actualizado, 0 fallidos');
      expect(output.split('\n').find(line => line.startsWith('Resumen:'))).toBe('Resumen: 1 actualizado');
      expect(output.split('\n').filter(line => line.startsWith('Node NPM: OK'))).toHaveLength(1);
      expect(output).not.toMatch(/\x1b|Q salir|Ctrl\+C|Espacio/);
      writeFileSync(join(outputDirectory(), 'non-tty.txt'), output);
    } finally { handle.unmount(); }
  });
  it('keeps running while Q/Esc asks, returns with N, then confirms cancellation', async () => {
    fixture.hold = true; fixture.aborted = false; fixture.language = 'es'; fixture.scenario = 'full';
    const handle = render(<App />);
    try {
      await waitFor(handle, '5.7.2'); handle.stdin.write('a'); await pause(); await pause();
      handle.stdin.write('\r'); await pause(); await pause(); handle.stdin.write('\r');
      await waitFor(handle, 'ACTUALIZANDO');
      const height = handle.lastFrame()!.split('\n').length;
      handle.stdin.write('q'); await waitFor(handle, '¿Cancelar');
      expect(handle.lastFrame()).toContain('Node NPM');
      expect(fixture.aborted).toBe(false);
      handle.stdin.write('n'); await pause(); await pause();
      expect(handle.lastFrame()).not.toContain('¿Cancelar');
      expect(handle.lastFrame()!.split('\n').length).toBe(height);
      handle.stdin.write('\u001b'); await waitFor(handle, '¿Cancelar');
      handle.stdin.write('\r'); await pause(); expect(fixture.aborted).toBe(false);
      handle.stdin.write('s'); await waitFor(handle, 'CANCELANDO');
      expect(fixture.aborted).toBe(true);
      expect(handle.lastFrame()!.split('\n').length).toBe(height);
      fixture.release(); await waitFor(handle, 'COMPLETADO');
    } finally { fixture.release(); fixture.hold = false; handle.unmount(); }
  });
  it('cancels immediately with Ctrl+C without a question', async () => {
    fixture.hold = true; fixture.aborted = false; fixture.language = 'es'; fixture.scenario = 'full';
    const exitCode = process.exitCode;
    const handle = render(<App />);
    try {
      await waitFor(handle, '5.7.2'); handle.stdin.write('a'); await pause(); await pause();
      handle.stdin.write('\r'); await pause(); await pause(); handle.stdin.write('\r');
      await waitFor(handle, 'ACTUALIZANDO');
      handle.stdin.write('\u0003'); await pause();
      expect(fixture.aborted).toBe(true);
      expect(process.exitCode).toBe(130);
      expect(handle.lastFrame()).not.toContain('¿Cancelar');
    } finally { fixture.release(); fixture.hold = false; handle.unmount(); process.exitCode = exitCode; }
  });
  for (const scenario of ['full', 'brew']) it(`shows package progress and conditionally prompts for password with ${scenario}`, async () => {
    fixture.hold = true; fixture.language = 'es'; fixture.scenario = scenario;
    let offset = 0;
    const originalNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => originalNow() + offset);
    const handle = render(<App />);
    try {
      await waitFor(handle, '5.7.2'); handle.stdin.write('a'); await pause(); await pause();
      handle.stdin.write('\r'); await pause(); await pause(); handle.stdin.write('\r');
      await waitFor(handle, 'ACTUALIZANDO');
      const before = handle.lastFrame()!;
      expect(before).toContain('0 de 1 paquete');
      expect(before).toContain('typescript');
      expect(before.includes('Password:')).toBe(scenario === 'brew' && process.platform !== 'win32');
      offset = 3000;
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(handle.lastFrame()).toMatch(/[34]s/);
      expect(handle.lastFrame()!.split('\n').length).toBe(before.split('\n').length);
    } finally { clock.mockRestore(); fixture.release(); fixture.hold = false; handle.unmount(); }
  });
  it('draws the image banner on every screen, or the line header where glyphs or colour are off', async () => {
    fixture.scenario = 'full'; fixture.language = 'es'; fixture.newer = true;
    size(100, 30);
    configureBanner(image);
    const handle = render(<App />);
    try {
      expectHeader(capture(handle, 'banner-detect'), 'Paso 1/4 · Detectando gestores');
      if (bannerAllowed) expect(handle.lastFrame()!.split('\n')[1]).toContain('buscando gestores');
      await waitFor(handle, '5.7.2');
      const select = capture(handle, 'banner-select');
      expectHeader(select, 'Paso 2/4 · Seleccionar');
      expect(select.split('\n')[0]).toContain(`${g.arrow} 3.1.0`);
      if (bannerAllowed) expect(select.split('\n')[1]).toContain('1 gestor detectado');
      handle.stdin.write('s'); await pause(); await pause();
      expectHeader(capture(handle, 'banner-settings'), 'Ajustes');
      handle.stdin.write('\u001b'); await waitFor(handle, '5.7.2');
      handle.stdin.write('a'); await pause(); await pause();
      handle.stdin.write('\r'); await pause(); await pause();
      expectHeader(capture(handle, 'banner-confirm'), 'Paso 3/4 · Confirmar');
      handle.stdin.write('\r'); await pause(); await pause();
      expectHeader(capture(handle, 'banner-update'), 'Paso 4/4 · Actualizando');
      await waitFor(handle, 'COMPLETADO');
      const summary = capture(handle, 'banner-summary');
      expectHeader(summary, 'Resumen');
      expect(summary.split(PLACEHOLDER).length - 1).toBe(bannerAllowed ? 24 : 0);
      handle.stdin.write('d'); await pause(); await pause();
      expectHeader(capture(handle, 'banner-detail'), 'Detalle por paquete');
    } finally { handle.unmount(); }
  });
  it('uses the six-cell icon width when the theme was unknown', async () => {
    fixture.scenario = 'full'; fixture.language = 'en'; fixture.newer = false;
    size(80, 24);
    configureBanner({ id: 200, columns: 6, rows: 3 });
    const handle = render(<App />);
    try {
      const frame = capture(handle, 'banner-icon');
      if (!bannerAllowed) { expectLineHeader(frame); return; }
      const lines = frame.split('\n');
      expect(lines[0]!.startsWith('  ' + placeholderRows(200, 6, 3)[0] + '  tacuchi updater')).toBe(true);
      expect(lines[1]).toContain('looking for managers');
      expect(lines[2]).toContain('Step 1/4 · Detecting managers');
    } finally { handle.unmount(); }
  });
  for (const [name, width, height] of [['narrow', 59, 30], ['short', 100, 18]] as const) it(`keeps the one-line header in a ${name} terminal`, async () => {
    fixture.scenario = 'full'; fixture.language = 'es';
    size(width, height);
    configureBanner(image);
    const handle = render(<App />);
    try { expectLineHeader(capture(handle, `banner-${name}`)); } finally { handle.unmount(); }
  });
  it('keeps the one-line header without colour', async () => {
    fixture.scenario = 'full'; fixture.language = 'es';
    size(100, 30);
    process.env['NO_COLOR'] = '1';
    configureBanner(image);
    const handle = render(<App />);
    try {
      const frame = capture(handle, 'banner-no-color');
      expectLineHeader(frame);
      expect(frame.split('\n')[0]!.trimStart()).toMatch(/^tacuchi_/);
    } finally { handle.unmount(); }
  });
  it('switches between banner and line header on resize', async () => {
    fixture.scenario = 'full'; fixture.language = 'es';
    size(100, 30);
    configureBanner(image);
    const handle = render(<App />);
    try {
      await waitFor(handle, '5.7.2');
      expect(handle.lastFrame()!.includes(PLACEHOLDER)).toBe(bannerAllowed);
      size(59, 30); process.stdout.emit('resize'); await pause();
      expectLineHeader(handle.lastFrame()!);
      size(100, 30); process.stdout.emit('resize'); await pause();
      expect(handle.lastFrame()!.includes(PLACEHOLDER)).toBe(bannerAllowed);
    } finally { handle.unmount(); }
  });
  it('leaves the line header as the last frame when the app quits', async () => {
    fixture.scenario = 'full'; fixture.language = 'es';
    size(100, 30);
    configureBanner(image);
    const exitCode = process.exitCode;
    const handle = render(<App />);
    try {
      await waitFor(handle, '5.7.2');
      expect(handle.lastFrame()!.includes(PLACEHOLDER)).toBe(bannerAllowed);
      handle.stdin.write('q'); await pause(); await pause();
      // Under CI, Ink's unmount writes only a newline; the frame before it is the one left on screen.
      expectLineHeader(handle.frames.filter(frame => frame.trim() !== '').at(-1)!);
    } finally { handle.unmount(); process.exitCode = exitCode; }
  });
  it('writes no image byte to redirected output even with the banner configured', async () => {
    fixture.scenario = 'full'; fixture.language = 'es';
    size(100, 30);
    configureBanner(image);
    let output = '';
    const handle = render(<App nonInteractive lineOutput={line => { output += line; }} />);
    try {
      const deadline = Date.now() + 5000;
      while (!output.includes('Resumen:') && Date.now() < deadline) await pause();
      expect(output).toContain('Resumen:');
      expect(output).not.toMatch(/\x1b_G|\u{10EEEE}|\x1b\[38;5;/u);
    } finally { handle.unmount(); }
  });
  for (const [banner, height] of [[false, 17], [true, 19]] as const) it(`fits a long selection list in ${height} rows ${banner ? 'under the banner' : 'under the line header'}`, async () => {
    fixture.scenario = 'many'; fixture.language = 'es';
    size(100, height);
    if (banner) configureBanner(image);
    const handle = render(<App />);
    try {
      await waitFor(handle, 'package-0');
      const frame = capture(handle, `banner-${banner}-fit`);
      expect(frame.includes(PLACEHOLDER)).toBe(banner && bannerAllowed);
      expect(frame.split('\n').length).toBeLessThan(height);
    } finally { handle.unmount(); }
  });
});
