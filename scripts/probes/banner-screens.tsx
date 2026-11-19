// Visual check of the header banner: the real header over simulated screens, no
// package manager and no app state machine. Run it in a visible terminal:
//   npx tsx scripts/probes/banner-screens.tsx [--piece oscuro|claro|icono] [--lang es|en] [--step-ms 1500]
// It asks the terminal like the app does, then walks the screens with bodies of
// different heights, quits like the app (line header as the last frame) and
// deletes the image. Ctrl+C takes the same path. --lang defaults to the
// configured language.
import React from 'react';
import type { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { Box, Text, render } from 'ink';
import { StepHeader } from '../../src/components/step-header.js';
import { MachineProvider } from '../../src/hooks/use-app-machine.js';
import { configureBanner, retireBanner } from '../../src/lib/banner.js';
import { loadConfig } from '../../src/lib/config.js';
import { ASCII } from '../../src/lib/glyphs.js';
import { setLanguage, type Language } from '../../src/i18n/index.js';
import { bannerBlocker, deleteImage, pickImageId, pickPiece, transmitImage, type BannerPiece } from '../../src/lib/terminal-image.js';
import { probeTerminal } from '../../src/lib/terminal-theme.js';
import { setTerminalTheme } from '../../src/theme.js';
import type { Phase } from '../../src/state/types.js';

type Input = Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode?: (raw: boolean) => unknown };
type Output = Writable & { isTTY?: boolean; columns?: number; rows?: number };

export const screens: Array<{ phase: Phase; order: number; body: number; newer: boolean }> = [
  { phase: 'detecting', order: 0, body: 3, newer: false },
  { phase: 'scanning', order: 7, body: 8, newer: false },
  { phase: 'select', order: 7, body: 12, newer: true },
  { phase: 'settings', order: 7, body: 6, newer: true },
  { phase: 'confirm', order: 7, body: 4, newer: true },
  { phase: 'updating', order: 7, body: 9, newer: true },
  { phase: 'summary', order: 7, body: 7, newer: true },
  { phase: 'detail', order: 7, body: 10, newer: true },
];

function Harness({ index, width }: { index: number; width: number }) {
  const screen = screens[index]!;
  const value = {
    state: { phase: screen.phase, order: Array.from({ length: screen.order }, (_, i) => `m${i}`), error: null },
    selfUpdate: screen.newer ? { version: '3.1.0', howTo: '' } : null,
  } as unknown as React.ComponentProps<typeof MachineProvider>['value'];
  return <MachineProvider value={value}>
    <Box flexDirection="column" paddingX={1} width={width}>
      <StepHeader />
      {Array.from({ length: screen.body }, (_, line) => <Text key={line} dimColor>{line === 0 ? `simulated screen: ${screen.phase} (${screen.body} lines)` : '·'}</Text>)}
    </Box>
  </MachineProvider>;
}

export interface BannerScreensOptions {
  input?: Input;
  output?: Output;
  env?: NodeJS.ProcessEnv;
  stepMs?: number;
  piece?: string;
  lang?: Language;
  /** Called with each screen index as it is shown. */
  onScreen?: (index: number) => void;
  /** Gives the caller a way to quit early, as Ctrl+C does. */
  onReady?: (quit: (code: number) => void) => void;
}

/** Walks every screen, then quits; resolves with the exit code and the line that sums it up. */
export async function runBannerScreens({
  input = process.stdin, output = process.stdout, env = process.env, stepMs = 1500, piece: forced, lang, onScreen, onReady,
}: BannerScreensOptions = {}): Promise<{ code: number; summary: string }> {
  setLanguage(lang ?? loadConfig().language);
  const blocker = bannerBlocker({
    env, stdoutTTY: output.isTTY === true, ascii: ASCII,
    columns: Math.min(output.columns ?? 0, 100), rows: output.rows ?? 0,
  });
  const probe = await probeTerminal({ input, output, env, interactive: input.isTTY === true, images: blocker === null });
  setTerminalTheme(probe.theme);
  let piece: BannerPiece | null = null;
  let id = 0;
  if (probe.images) {
    piece = forced === 'claro' ? pickPiece('light', true) : forced === 'oscuro' ? pickPiece('dark', true) : forced === 'icono' ? pickPiece('dark', false) : pickPiece(probe.theme, probe.themeKnown);
    id = pickImageId();
    output.write(transmitImage(id, piece));
    configureBanner({ id, columns: piece.columns, rows: piece.rows });
  }
  const width = Math.min(output.columns ?? 100, 100);
  let index = 0;
  const instance = render(<Harness index={index} width={width} />, { stdout: output as NodeJS.WriteStream, stdin: input as NodeJS.ReadStream, exitOnCtrlC: false, patchConsole: false });
  onScreen?.(index);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (code: number, error?: unknown) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      let failure = error;
      try {
        // index always names a shown screen, so the retire frame re-renders one that exists.
        if (retireBanner()) instance.rerender(<Harness index={index} width={width} />);
        instance.unmount();
      } catch (cleanupError) {
        failure ??= cleanupError;
      } finally {
        if (piece) output.write(deleteImage(id));
        configureBanner(null);
      }
      const summary = piece
        ? `banner: ${piece.name} (${piece.columns}x${piece.rows} cells), theme ${probe.theme}${probe.themeKnown ? '' : ' (unknown)'}; image deleted on exit`
        : `banner not shown: ${blocker ?? 'no kitty graphics answer before DA1'}; line header used`;
      // A render error never throws from rerender: Ink's error boundary unmounts
      // and rejects waitUntilExit with it, so that is where it is read.
      void instance.waitUntilExit().then(
        () => failure === undefined ? resolve({ code, summary }) : reject(failure),
        renderError => reject(failure ?? renderError),
      );
    };
    const timer = setInterval(() => {
      try {
        if (index === screens.length - 1) { finish(0); return; }
        index++;
        instance.rerender(<Harness index={index} width={width} />);
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
  try {
    const { code, summary } = await runBannerScreens({
      stepMs: Number(argument('--step-ms') ?? 1500), piece: argument('--piece'), lang,
      onReady: quit => { process.on('SIGINT', () => quit(130)); },
    });
    console.log(summary);
    process.exit(code);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
