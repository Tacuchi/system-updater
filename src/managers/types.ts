export interface ManagerDetection {
  available: boolean;
  version?: string;
  path?: string;
  /**
   * The probe could not answer: it timed out, or the binary ran and replied
   * something the descriptor does not accept. NOT the same as absent — an absent
   * manager is one whose binary is not there at all.
   */
  undetermined?: boolean;
}

export interface OutdatedPackage {
  name: string;
  currentVersion: string;
  newVersion: string;
  size?: string;
}

/** Logical grouping used to order/cluster managers in the UI. */
export type ManagerGroup = 'system' | 'language' | 'apps' | 'sdk';

/**
 * Classified reason a command/upgrade failed. The engine derives this from
 * exit codes (authoritative) plus stderr patterns (refinement) — never from
 * naive substring matching of "error" in arbitrary output.
 */
export type FailureKind =
  | 'TIMEOUT'
  | 'NO_PASSWORDLESS_SUDO'
  | 'COMMAND_FAILED'
  | 'PARTIAL'
  | 'NETWORK'
  | 'CANCELLED'
  | 'UNKNOWN';

/**
 * A Windows upgrade can SUCCEED yet leave the system needing a reboot. Derived
 * from exit codes (choco 3010 = required, 1641 = initiated, 350/1604 = deferred),
 * so it must not be reported as a failure.
 */
export type RebootState = 'required' | 'initiated' | 'deferred';

/** Lifecycle phase of a single manager's upgrade, surfaced to the UI. */
export type ManagerPhase = 'queued' | 'updating-index' | 'upgrading' | 'verifying' | 'done';

// Legacy values ('start' | 'progress' | 'log' | 'complete' | 'error') are kept
// so existing managers keep compiling during the migration; 'phase' is new.
export type ProgressEventType = 'start' | 'progress' | 'log' | 'complete' | 'error' | 'phase';

export interface ProgressEvent {
  type: ProgressEventType;
  message: string;
  package?: string;
  /** 0..100 when known. undefined + indeterminate=true → UI shows a spinner. */
  percent?: number;
  indeterminate?: boolean;
  phase?: ManagerPhase;
  /** Display hint ONLY (e.g. colour a log line). Never the verdict. */
  severity?: 'info' | 'warn';
}

export type PackageOutcome = 'upgraded' | 'failed' | 'skipped' | 'unchanged' | 'unknown';

export interface PackageResult {
  name: string;
  outcome: PackageOutcome;
  fromVersion?: string;
  toVersion?: string;
  failureKind?: FailureKind;
  detail?: string;
}

/** Record of one shell command the engine ran, for diagnosis + the Summary. */
export interface CommandRecord {
  cmd: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  stdoutTail: string;
  stderrTail: string;
}

/**
 * The ONE vocabulary of a manager's verdict.
 *
 * It is a named type so the per-manager verdict in the log and the run's closing
 * block cannot drift apart: they used to say `success` and `done` for the same
 * fact, and `noop` and `skipped` for another. `unknown` is the state that had no
 * name at all — a probe or a listing that could not answer.
 */
export type UpgradeStatus = 'success' | 'partial' | 'failed' | 'cancelled' | 'noop' | 'unknown';

export interface UpgradeResult {
  // --- legacy fields (kept so old UI + managers compile during migration) ---
  success: boolean;
  upgraded: number;
  failed: number;
  errors: string[];
  manualCommand?: string;
  // --- new fields (authored only by the engine via reconcile()) ---
  managerId?: string;
  status?: UpgradeStatus;
  skipped?: number;
  reason?: FailureKind;
  /** Set when the upgrade succeeded but a reboot is pending (Windows). */
  reboot?: RebootState;
  packages?: PackageResult[];
  commands?: CommandRecord[];
  startedAt?: number;
  finishedAt?: number;
}

/** Snapshot used by the engine to verify which packages are still outdated. */
export interface VerifySnapshot {
  stillOutdated: { name: string; currentVersion?: string; newVersion?: string }[];
}

export interface PackageManager {
  id: string;
  platforms: NodeJS.Platform[];
  requiresAdmin: boolean;
  // --- new optional fields (additive; existing managers omit them) ---
  group?: ManagerGroup;
  defaultTimeoutMs?: number;
  /** Exit codes that mean "ok" beyond 0 (e.g. `npm outdated` exits 1 with results). */
  successExitCodes?: number[];

  detect(): Promise<ManagerDetection>;
  listOutdated(): Promise<OutdatedPackage[]>;
  upgrade(packages?: string[], sudoMode?: boolean, signal?: AbortSignal): AsyncGenerator<ProgressEvent, UpgradeResult>;
  uninstall?(packages: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult>;
  /** Engine calls this after upgrade to compute real success. Default = listOutdated(). */
  verify?(requested: string[] | undefined): Promise<VerifySnapshot>;
}
