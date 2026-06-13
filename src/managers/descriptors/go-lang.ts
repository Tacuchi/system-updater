import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { once } from '../../lib/exec/capabilities.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

const GO_DL_URL = 'https://go.dev/dl/';
const GO_VERSION_URL = 'https://go.dev/VERSION?m=text';

/** Parse the installed version out of `go version` (e.g. "go version go1.21.5 darwin/arm64"). Pure + testable. */
export function parseGoVersion(stdout: string): string | undefined {
  return stdout.match(/go(\d+\.\d+\.\d+)/)?.[1];
}

/** Parse the latest stable version from `https://go.dev/VERSION?m=text` body (first line "go1.22.0"). Pure + testable. */
export function parseLatestGoVersion(body: string): string | undefined {
  const first = body.split('\n')[0]?.replace('go', '').trim();
  return first || undefined;
}

/** Fetch the latest stable Go version once per process run, via native fetch (no curl spawn). */
async function latestVersion(): Promise<string | undefined> {
  return once('go-lang:latest', async () => {
    try {
      const res = await fetch(GO_VERSION_URL);
      if (!res.ok) return undefined;
      return parseLatestGoVersion(await res.text());
    } catch {
      return undefined;
    }
  });
}

async function installedVersion(): Promise<string | undefined> {
  const res = await execCommand('go', ['version'], 3000);
  if (res.exitCode !== 0) return undefined;
  return parseGoVersion(res.stdout);
}

/**
 * The Go SDK has no machine-readable "outdated" listing. We introspect the
 * installed `go version` and compare it against the latest stable release
 * published at go.dev. Returns a single synthetic `go-sdk` entry when behind.
 */
async function listOutdated(): Promise<OutdatedPackage[]> {
  const current = await installedVersion();
  if (!current) return [];
  const latest = await latestVersion();
  if (!latest || current === latest) return [];
  return [{ name: 'go-sdk', currentVersion: current, newVersion: latest }];
}

export const goLang: ManagerDescriptor = {
  id: 'go-lang',
  group: 'sdk',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: true,
  kind: 'direct',
  detectCmd: { cmd: 'go', args: ['version'], timeout: 3000 },
  parseVersion: stdout => parseGoVersion(stdout),
  manualCommand: () => GO_DL_URL,
  // Escape hatch: the Go SDK cannot be expressed declaratively.
  //  - listOutdated needs an HTTP probe (cached) against go.dev + version-branching.
  //  - upgrade only auto-updates on macOS via Homebrew (`brew upgrade go`). On any
  //    other platform there is no auto-update, so it returns a manual noop pointing
  //    at the official download page — exactly the legacy behavior.
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      // Only macOS can auto-update via Homebrew. Everything else (and Windows/Linux)
      // is a manual download — emit a noop with the manual command, no fabricated success.
      if (ctx.platform !== 'darwin') {
        yield { type: 'log', message: `Go no tiene auto-update en esta plataforma. Descarga manual: ${GO_DL_URL}` };
        return {
          success: false,
          upgraded: 0,
          failed: 0,
          errors: [],
          skipped: 1,
          status: 'noop',
          manualCommand: GO_DL_URL,
          managerId: 'go-lang',
        };
      }

      // macOS: delegate to Homebrew with a single bulk command, then reconcile
      // against a real before/after listing — never hand-build success.
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando Go via Homebrew...' };
      const before = await listOutdated();
      const commands: CommandRecord[] = [];

      const args = ['upgrade', 'go'];
      yield { type: 'log', message: `brew ${args.join(' ')}` };
      const rec = yield* runStream('brew', args, { timeoutMs: 300_000, sudo: false, signal: ctx.signal });
      commands.push(rec);
      logger.logCommand(rec);

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      const after = await listOutdated();
      const result = reconcile(packages, before, { stillOutdated: after.map(p => ({ name: p.name })) }, commands);
      return result;
    },
  },
};
