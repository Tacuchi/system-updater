// Visual check of the header banner: the real header over simulated screens, no
// package manager and no app state machine. Run it in a visible terminal:
//   npx tsx scripts/probes/banner-screens.tsx [--mode placeholders|cursor|sixel] [--piece oscuro|claro|icono] [--lang es|en] [--step-ms 1500]
// It asks the terminal like the app does, then walks the screens with bodies of
// different heights, one taller than the terminal (Ink clears the screen after
// it) and one that asks for a resize, quits like the app (line header as the
// last frame) and deletes the image. Ctrl+C takes the same path. --mode forces
// a tier like TACUCHI_BANNER; --lang defaults to the configured language.
import React from 'react';
import type { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { Box, Text, render } from 'ink';
import { StepHeader } from '../../src/components/step-header.js';
import { MachineProvider } from '../../src/hooks/use-app-machine.js';
import { configureBanner, retireBanner } from '../../src/lib/banner.js';
import { mountBanner, type StartedBanner } from '../../src/lib/banner-output.js';
import { loadConfig } from '../../src/lib/config.js';
import { ASCII } from '../../src/lib/glyphs.js';
import { setLanguage, type Language } from '../../src/i18n/index.js';
import { bannerBlocker, bannerWanted, forcedTier, pickPiece, pickTier, sixelPossible, type BannerPiece, type BannerTier } from '../../src/lib/terminal-image.js';
import { probeTerminal } from '../../src/lib/terminal-theme.js';
import { setTerminalTheme } from '../../src/theme.js';
import type { Phase } from '../../src/state/types.js';

type Input = Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode?: (raw: boolean) => unknown };
type Output = Writable & { isTTY?: boolean; columns?: number; rows?: number };

/** body 'taller' is the terminal height plus four: Ink clears the whole screen on the frame after it. */
export const screens: Array<{ phase: Phase; order: number; body: number | 'taller'; newer: boolean; note?: string; steps?: number }> = [
  { phase: 'detecting', order: 0, body: 3, newer: false },
  { phase: 'scanning', order: 7, body: 8, newer: false },
  { phase: 'select', order: 7, body: 12, newer: true },
  { phase: 'settings', order: 7, body: 6, newer: true },
  { phase: 'confirm', order: 7, body: 4, newer: true },
  { phase: 'updating', order: 7, body: 9, newer: true },
  { phase: 'summary', order: 7, body: 7, newer: true },
  { phase: 'detail', order: 7, body: 'taller', newer: true, note: 'taller than the terminal: the next screen comes after a full clear' },
  { phase: 'summary', order: 7, body: 7, newer: true, note: 'after the clear: the image must be back beside the header' },
  { phase: 'select', order: 7, body: 9, newer: true, note: 'resize the window now: the image must follow the header, no copy left behind', steps: 4 },
];

const bodyLines = (body: number | 'taller', rows: number) => body === 'taller' ? rows + 4 : body;

function Harness({ index, width, rows }: { index: number; width: number; rows: number }) {
  const screen = screens[index]!;
  const lines = bodyLines(screen.body, rows);
  const value = {
    state: { phase: screen.phase, order: Array.from({ length: screen.order }, (_, i) => `m${i}`), error: null },
    selfUpdate: screen.newer ? { version: '3.1.0', howTo: '' } : null,
  } as unknown as React.ComponentProps<typeof MachineProvider>['value'];
  return <MachineProvider value={value}>
    <Box flexDirection="column" paddingX={1} width={width}>
      <StepHeader />
      {Array.from({ length: lines }, (_, line) => <Text key={line} dimColor>{line === 0 ? `simulated screen: ${screen.phase} (${lines} lines)${screen.note ? ` · ${screen.note}` : ''}` : '·'}</Text>)}
    </Box>
  </MachineProvider>;
}

export interface BannerScreensOptions {
  input?: Input;
  output?: Output;
  env?: NodeJS.ProcessEnv;
  stepMs?: number;
  /** Forces a tier, like TACUCHI_BANNER. */
  mode?: Exclude<BannerTier, 'none'> | 'off';
  piece?: string;
  lang?: Language;
  /** Called with each screen index as it is shown. */
  onScreen?: (index: number) => void;
  /** Gives the caller a way to quit early, as Ctrl+C does. */
  onReady?: (quit: (code: number) => void) => void;
}

/** Walks every screen, then quits; resolves with the exit code and the line that sums it up. */
export async function runBannerScreens({
  input = process.stdin, output = process.stdout, env = process.env, stepMs = 1500, mode, piece: forced, lang, onScreen, onReady,
}: BannerScreensOptions = {}): Promise<{ code: number; summary: string }> {
  setLanguage(lang ?? loadConfig().language);
  const tierEnv = mode ? { ...env, TACUCHI_BANNER: mode } : env;
  const size = { stdoutTTY: output.isTTY === true, ascii: ASCII, columns: Math.min(output.columns ?? 0, 100), rows: output.rows ?? 0 };
  const blocker = bannerBlocker({ env, ...size });
  const wanted = bannerWanted({ env: tierEnv, interactive: input.isTTY === true, ...size });
  const probe = await probeTerminal({ input, output, env, interactive: input.isTTY === true, images: wanted, cell: sixelPossible(tierEnv) });
  setTerminalTheme(probe.theme);
  const tier = wanted ? pickTier({ env: tierEnv, images: probe.images, sixel: probe.sixel }) : 'none';
  let piece: BannerPiece | null = null;
  let banner: StartedBanner | null = null;
  let inkOutput: Output = output;
  if (tier !== 'none') {
    piece = forced === 'claro' ? pickPiece('light', true) : forced === 'oscuro' ? pickPiece('dark', true) : forced === 'icono' ? pickPiece('dark', false) : pickPiece(probe.theme, probe.themeKnown);
    ({ stdout: inkOutput, banner } = mountBanner({ tier, piece, cell: probe.cell, stdout: output as NodeJS.WriteStream }));
  }
  const width = Math.min(output.columns ?? 100, 100);
  let index = 0;
  const harness = () => <Harness index={index} width={width} rows={output.rows ?? 24} />;
  const instance = render(harness(), { stdout: inkOutput as NodeJS.WriteStream, stdin: input as NodeJS.ReadStream, exitOnCtrlC: false, patchConsole: false });
  // Like the app's shell: a resize renders the header again, which re-checks the size.
  const resized = () => { try { instance.rerender(harness()); } catch { /* the step timer reports render errors */ } };
  output.on('resize', resized);
  onScreen?.(index);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (code: number, error?: unknown) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      output.off('resize', resized);
      let failure = error;
      try {
        // index always names a shown screen, so the retire frame re-renders one that exists.
        if (retireBanner()) instance.rerender(harness());
        instance.unmount();
      } catch (cleanupError) {
        failure ??= cleanupError;
      } finally {
        if (banner?.exit) output.write(banner.exit);
        configureBanner(null);
      }
      const reason = blocker ?? (forcedTier(tierEnv) === 'none' ? 'turned off' : 'no kitty graphics answer before DA1');
      const summary = piece && banner
        ? `banner: ${piece.name} (${piece.columns}x${piece.rows} cells) by ${tier}, theme ${probe.theme}${probe.themeKnown ? '' : ' (unknown)'}; ${banner.exit ? 'image deleted on exit' : 'line header as the last frame'}`
        : `banner not shown: ${reason}; line header used`;
      // A render error never throws from rerender: Ink's error boundary unmounts
      // and rejects waitUntilExit with it, so that is where it is read.
      void instance.waitUntilExit().then(
        () => failure === undefined ? resolve({ code, summary }) : reject(failure),
        renderError => reject(failure ?? renderError),
      );
    };
    let wait = screens[index]!.steps ?? 1;
    const timer = setInterval(() => {
      try {
        if (--wait > 0) return;
        if (index === screens.length - 1) { finish(0); return; }
        index++;
        wait = screens[index]!.steps ?? 1;
        instance.rerender(harness());
        onScreen?.(index);
      } catch (error) {
        finish(1, error);
      }
    }, stepMs);
    instance.waitUntilExit().catch(error => finish(1, error));
    onReady?.(code => finish(code));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = (name: string) => { const at = process.argv.indexOf(name); return at === -1 ? undefined : process.argv[at + 1]; };
  const lang = argument('--lang');
  if (lang !== undefined && lang !== 'es' && lang !== 'en') {
    console.error(`--lang expects es or en, got ${JSON.stringify(lang)}`);
    process.exit(2);
  }
  const mode = argument('--mode');
  if (mode !== undefined && mode !== 'placeholders' && mode !== 'cursor' && mode !== 'sixel' && mode !== 'off') {
    console.error(`--mode expects placeholders, cursor, sixel or off, got ${JSON.stringify(mode)}`);
    process.exit(2);
  }
  try {
    const { code, summary } = await runBannerScreens({
      stepMs: Number(argument('--step-ms') ?? 1500), mode, piece: argument('--piece'), lang,
      onReady: quit => { process.on('SIGINT', () => quit(130)); },
    });
    console.log(summary);
    process.exit(code);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
