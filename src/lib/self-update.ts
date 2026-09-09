import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';
import * as logger from './logger.js';

/**
 * "Is there a newer me?" — asked at most once a day, never blocking, and
 * silent about its own failures except in the log.
 *
 * A tool whose whole job is keeping other things current never asked that about
 * itself, so a user could run a version with a fixed bug for months. The check
 * is deliberately the least intrusive thing that answers it: one HTTP GET, its
 * answer cached on disk, and a failure that the flow never notices.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const PACKAGE = '@tacuchi/updater';

export interface SelfCheckState {
  /** Epoch ms of the last COMPLETED query — a failure does not start the clock. */
  lastCheckedAt: number;
  /** The newest version seen, so the notice survives inside the 24 h window. */
  latest?: string;
}

export interface SelfCheckOutcome {
  /** The newer version to tell the user about, or null when there is nothing to say. */
  newer: string | null;
  /** Whether this call actually went to the network. */
  queried: boolean;
  /** How to get it. Shown with the notice, never guessed by the reader. */
  howTo?: string;
}

export interface SelfCheckDeps {
  now(): number;
  /** Injected so the cadence and the failure path are testable without a network. */
  fetchLatest(): Promise<string>;
  readState(): SelfCheckState | null;
  writeState(state: SelfCheckState): void;
}

/** Pure: is `candidate` a higher semver than `current`? Pre-release tags lose. */
export function isNewer(current: string, candidate: string): boolean {
  const parse = (v: string): number[] =>
    (v.split('-')[0] ?? '').split('.').map(n => Number.parseInt(n, 10) || 0);
  const a = parse(current);
  const b = parse(candidate);
  for (let i = 0; i < 3; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (right > left) return true;
    if (right < left) return false;
  }
  return false;
}

export function selfCheckStatePath(): string {
  return path.join(getConfigDir(), 'self-check.json');
}

function readStateFromDisk(): SelfCheckState | null {
  try {
    const raw = readFileSync(selfCheckStatePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SelfCheckState>;
    if (typeof parsed.lastCheckedAt !== 'number') return null;
    return { lastCheckedAt: parsed.lastCheckedAt, latest: parsed.latest };
  } catch {
    return null;
  }
}

function writeStateToDisk(state: SelfCheckState): void {
  try {
    const dir = getConfigDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(selfCheckStatePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    /* the cache is a convenience; losing it only costs one extra query */
  }
}

/** The real network query: the npm registry's `latest` dist-tag. */
async function fetchLatestFromRegistry(): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${PACKAGE}/latest`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`registro respondió ${res.status}`);
  const body = (await res.json()) as { version?: string };
  if (!body.version) throw new Error('el registro no devolvió version');
  return body.version;
}

export const defaultSelfCheckDeps: SelfCheckDeps = {
  now: () => Date.now(),
  fetchLatest: fetchLatestFromRegistry,
  readState: readStateFromDisk,
  writeState: writeStateToDisk,
};

/**
 * Ask whether a newer version exists.
 *
 * Disabled → says nothing and does not query. Inside the 24 h window → answers
 * from the cache without touching the network. A failed query → returns nothing
 * to say, records the reason in the log, and does NOT start the clock, so the
 * next run tries again instead of staying quiet for a day over one flaky answer.
 */
export async function checkForNewerSelf(
  current: string,
  enabled: boolean,
  deps: SelfCheckDeps = defaultSelfCheckDeps,
): Promise<SelfCheckOutcome> {
  if (!enabled) return { newer: null, queried: false };

  const state = deps.readState();
  const fresh = state !== null && deps.now() - state.lastCheckedAt < DAY_MS;
  if (fresh) {
    const cached = state.latest;
    const newer = cached && isNewer(current, cached) ? cached : null;
    return newer ? { newer, queried: false, howTo: howToUpgrade(newer) } : { newer: null, queried: false };
  }

  try {
    const latest = await deps.fetchLatest();
    deps.writeState({ lastCheckedAt: deps.now(), latest });
    if (!isNewer(current, latest)) {
      logger.debug(`Auto-chequeo: ${current} está al día (latest=${latest})`);
      return { newer: null, queried: true };
    }
    logger.log(`Auto-chequeo: hay una versión más nueva del updater (${current} → ${latest})`);
    return { newer: latest, queried: true, howTo: howToUpgrade(latest) };
  } catch (err) {
    // Invisible to the flow, explicit here: the run must not stop, slow down or
    // show anything because the registry was unreachable.
    logger.warn(`Auto-chequeo: no se pudo consultar la versión más nueva (${String(err)})`);
    return { newer: null, queried: true };
  }
}

/** How to get it — printed with the notice so nobody has to guess. */
export function howToUpgrade(version: string): string {
  return `npm i -g ${PACKAGE}@${version}`;
}
