import type { OutdatedPackage, ManagerGroup, ProgressEvent, UpgradeResult } from './types.js';

export type ManagerKind = 'direct' | 'readonly';

export interface CommandSpec {
  cmd: string;
  args: string[];
  /** Override the descriptor's defaultTimeoutMs for this specific command. */
  timeout?: number;
  /** Run this command under sudo (admin managers). */
  sudo?: boolean;
}

export interface ManagerCtx {
  platform: NodeJS.Platform;
  sudoMode: boolean;
  version?: string;
  meta: Record<string, unknown>;
  /** Abort signal — wire into runStream so the user can cancel (Esc). */
  signal?: AbortSignal;
}

/**
 * Declarative description of a package manager. The generic engine
 * (`fromDescriptor`) turns this into a PackageManager. Descriptors supply data
 * and pure parsers ONLY — they never build an UpgradeResult, so they cannot
 * fabricate success. Special cases use `escapeHatch`.
 */
export interface ManagerDescriptor {
  id: string;
  group: ManagerGroup;
  platforms: NodeJS.Platform[];
  requiresAdmin: boolean;
  kind: ManagerKind;
  defaultTimeoutMs?: number;

  detectCmd: CommandSpec;
  parseVersion?: (stdout: string, stderr: string) => string | undefined;
  detectOkExitCodes?: number[];

  // Optional so escape-hatch-only managers (no machine-readable listing) and
  // pure-readonly managers can omit what they don't use.
  listOutdatedCmd?: (ctx: ManagerCtx) => CommandSpec;
  parseOutdated?: (stdout: string, stderr: string, ctx: ManagerCtx) => OutdatedPackage[];
  listOkExitCodes?: number[];

  /** Non-zero exit codes that still mean success for the UPGRADE command, e.g.
   *  choco's reboot codes {1641,3010}. Threaded into reconcile()'s classification. */
  successExitCodes?: number[];

  /** Build the single bulk upgrade command (no per-package loops). */
  upgradeCmd?: (packages: string[] | undefined, ctx: ManagerCtx) => CommandSpec;
  preUpgradeCmds?: (ctx: ManagerCtx) => CommandSpec[];
  postUpgradeCmds?: (ctx: ManagerCtx) => CommandSpec[];

  /** How to recompute "still outdated" after upgrading. Default = listOutdatedCmd. */
  verify?: {
    cmd: (ctx: ManagerCtx) => CommandSpec;
    parseStillOutdated: (stdout: string, stderr: string, ctx: ManagerCtx) => string[];
  };

  /** Manual command shown for readonly / no-sudo managers. */
  manualCommand?: (ctx: ManagerCtx) => string;
  percentParser?: (line: string, ctx: ManagerCtx) => number | undefined;

  /** Escape hatches for managers that cannot be expressed declaratively. */
  escapeHatch?: Partial<{
    detect(ctx: ManagerCtx): Promise<{ available: boolean; version?: string }>;
    listOutdated(ctx: ManagerCtx): Promise<OutdatedPackage[]>;
    upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult>;
  }>;
}
