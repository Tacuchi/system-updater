import type { ManagerGroup, RebootState } from '../managers/types.js';
import type { UserConfig } from '../lib/config.js';
import type { Language } from '../i18n/index.js';

/** The single linear flow: Detect → Scan → Select → Confirm → Update → Summary. */
export type Phase =
  | 'boot'
  | 'detecting'
  | 'scanning'
  | 'select'
  | 'confirm'
  | 'updating'
  | 'summary'
  | 'settings';

export type ManagerStatus =
  | 'pending' // detected, not yet scanned
  | 'scanning' // listing outdated
  | 'outdated' // has updates available
  | 'uptodate' // nothing to update
  | 'queued' // selected, waiting to run
  | 'running' // upgrading now
  | 'done' // upgraded successfully
  | 'failed' // upgrade failed
  | 'skipped'; // readonly / no-sudo → manual command

export interface PackageItem {
  name: string;
  currentVersion: string;
  newVersion: string;
  size?: string;
}

export interface UiFailure {
  package?: string;
  message: string;
  kind?: string;
  logRef?: string;
}

export interface ManagerResult {
  status: 'success' | 'partial' | 'failed' | 'cancelled' | 'noop';
  upgraded: number;
  failed: number;
  skipped: number;
  failures: UiFailure[];
  manualCommand?: string;
  reboot?: RebootState;
}

export interface ManagerEntry {
  id: string;
  group: ManagerGroup;
  requiresAdmin: boolean;
  version?: string;
  status: ManagerStatus;
  outdated: PackageItem[];
  percent: number;
  currentPackage?: string;
  startedAt?: number;
  finishedAt?: number;
  result?: ManagerResult;
  manualCommand?: string;
}

export interface RunState {
  queue: string[];
  doneCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface AppState {
  phase: Phase;
  prevPhase: Phase;
  managers: Record<string, ManagerEntry>;
  order: string[];
  /** Selected package keys, see selectionKey(). */
  selection: Set<string>;
  run: RunState;
  config: UserConfig;
  sudoMode: boolean;
  error?: string;
}

const SELECTION_SEP = "\u0000";

export function selectionKey(managerId: string, pkg: string): string {
  return `${managerId}${SELECTION_SEP}${pkg}`;
}

/** Inverse of selectionKey -> [managerId, packageName]. */
export function parseSelectionKey(key: string): [string, string] {
  const i = key.indexOf(SELECTION_SEP);
  return i < 0 ? [key, ""] : [key.slice(0, i), key.slice(i + 1)];
}
