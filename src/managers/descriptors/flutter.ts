import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { once } from '../../lib/exec/capabilities.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

const PACKAGE_NAME = 'flutter-sdk';

interface FlutterRelease {
  version: string;
  channel: string;
}

interface FlutterReleasesResponse {
  releases: FlutterRelease[];
}

/**
 * Parse `flutter --version --machine` JSON (preferred) or fall back to the
 * human-readable `Flutter X.Y.Z` banner. Pure + testable.
 */
export function parseFlutterVersion(stdout: string): string | undefined {
  try {
    const data = JSON.parse(stdout) as { frameworkVersion?: string };
    if (data.frameworkVersion) return data.frameworkVersion;
  } catch {
    // not JSON — fall through to the text banner
  }
  return stdout.match(/Flutter (\S+)/)?.[1];
}

/** Pick the latest `stable` channel version from the Flutter releases API JSON. */
export function findLatestStable(json: string): string | undefined {
  try {
    const data = JSON.parse(json) as FlutterReleasesResponse;
    return data.releases?.find(r => r.channel === 'stable')?.version;
  } catch {
    return undefined;
  }
}

/** OS → Flutter releases-API platform key. */
function platformKey(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux';
}

function releasesUrl(platform: NodeJS.Platform): string {
  return `https://storage.googleapis.com/flutter_infra_release/releases/releases_${platformKey(platform)}.json`;
}

/** Read the installed Flutter framework version via `flutter --version --machine`. */
async function currentVersion(): Promise<string | undefined> {
  const res = await execCommand('flutter', ['--version', '--machine'], 10_000);
  if (res.exitCode !== 0) return undefined;
  return parseFlutterVersion(res.stdout);
}

/**
 * Fetch + cache the latest stable release for this run. The releases manifest
 * is large and rarely changes within a session, so probe it at most once.
 */
async function latestStable(platform: NodeJS.Platform): Promise<string | undefined> {
  return once(`flutter:latest:${platformKey(platform)}`, async () => {
    try {
      const resp = await fetch(releasesUrl(platform));
      if (!resp.ok) return undefined;
      return findLatestStable(await resp.text());
    } catch {
      return undefined;
    }
  });
}

async function listOutdated(ctx: ManagerCtx): Promise<OutdatedPackage[]> {
  const current = await currentVersion();
  if (!current) return [];

  const latest = await latestStable(ctx.platform);
  if (latest) {
    if (latest === current) return [];
    return [{ name: PACKAGE_NAME, currentVersion: current, newVersion: latest }];
  }

  // Fallback: the API was unreachable — fall back to flutter's own banner hint.
  const textRes = await execCommand('flutter', ['--version'], 10_000);
  const output = textRes.stdout + textRes.stderr;
  if (output.includes('A new version of Flutter is available')) {
    return [{ name: PACKAGE_NAME, currentVersion: current, newVersion: 'disponible' }];
  }
  return [];
}

export const flutter: ManagerDescriptor = {
  id: 'flutter',
  group: 'sdk',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  defaultTimeoutMs: 600_000,
  detectCmd: { cmd: 'flutter', args: ['--version', '--machine'], timeout: 5000 },
  parseVersion: stdout => parseFlutterVersion(stdout),
  // Escape hatch: flutter has no machine-readable "outdated" listing. We derive
  // it by comparing the installed framework version against the latest stable
  // release fetched from the Flutter releases API (native fetch, not curl).
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando flutter...' };

      const before = await listOutdated(ctx);
      const commands: CommandRecord[] = [];

      if (before.length) {
        // --force: upgrade even if the checkout has local changes.
        const args = ['upgrade', '--force'];
        yield { type: 'log', message: `flutter ${args.join(' ')}` };
        const rec = yield* runStream('flutter', args, { timeoutMs: 600_000, sudo: false, signal: ctx.signal });
        commands.push(rec);
        logger.logCommand(rec);
      }

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      // Re-read the installed version directly; the cached releases probe gives
      // us the target without re-hitting the API.
      const after = await currentVersion();
      const latest = await latestStable(ctx.platform);
      const stillOutdated =
        after && latest && after !== latest ? [{ name: PACKAGE_NAME }] : [];

      const result = reconcile(packages, before, { stillOutdated }, commands);
      return result;
    },
  },
};
