import type {
  CommandRecord,
  FailureKind,
  OutdatedPackage,
  PackageResult,
  RebootState,
  UpgradeResult,
  VerifySnapshot,
} from '../../managers/types.js';
import { classifyCommand } from './classify.js';

// Most-specific-first ordering when several commands failed in different ways.
const KIND_PRIORITY: FailureKind[] = ['NO_PASSWORDLESS_SUDO', 'TIMEOUT', 'NETWORK', 'COMMAND_FAILED'];

/** Detect a pending reboot from command exit codes (Windows/choco semantics). */
function rebootFrom(commands: CommandRecord[]): RebootState | undefined {
  const codes = new Set(commands.map(c => c.exitCode));
  if (codes.has(1641)) return 'initiated';
  if (codes.has(3010)) return 'required';
  if (codes.has(350) || codes.has(1604)) return 'deferred';
  return undefined;
}

function dominantFailureKind(commands: CommandRecord[], successExitCodes?: number[]): FailureKind | null {
  const kinds = commands.map(c => classifyCommand(c, successExitCodes)).filter((k): k is FailureKind => k !== null);
  for (const k of KIND_PRIORITY) {
    if (kinds.includes(k)) return k;
  }
  return kinds[0] ?? null;
}

/**
 * The generalized "re-list outdated and diff" verification — formerly bespoke to
 * gem.ts, now applied uniformly. This is the ONLY honest source of an
 * UpgradeResult: a package is `upgraded` iff it is no longer outdated. Managers
 * cannot fabricate success because they do not author this object.
 */
export function reconcile(
  requested: string[] | undefined,
  before: OutdatedPackage[],
  after: VerifySnapshot,
  commands: CommandRecord[],
  successExitCodes?: number[],
): UpgradeResult {
  const beforeByName = new Map(before.map(p => [p.name, p]));
  const targetNames = requested ?? before.map(p => p.name);
  const targets = [...new Set(targetNames)];
  const stillOutdated = new Set(after.stillOutdated.map(p => p.name));
  const cmdKind = dominantFailureKind(commands, successExitCodes);

  const packages: PackageResult[] = targets.map(name => {
    const b = beforeByName.get(name);
    if (stillOutdated.has(name)) {
      return {
        name,
        outcome: 'failed',
        fromVersion: b?.currentVersion,
        toVersion: b?.newVersion,
        failureKind: cmdKind ?? 'COMMAND_FAILED',
      };
    }
    return {
      name,
      outcome: 'upgraded',
      fromVersion: b?.currentVersion,
      toVersion: b?.newVersion,
    };
  });

  const upgraded = packages.filter(p => p.outcome === 'upgraded').length;
  const failed = packages.filter(p => p.outcome === 'failed').length;

  let status: NonNullable<UpgradeResult['status']>;
  let reason: FailureKind | undefined;
  if (targets.length === 0) {
    status = 'noop';
  } else if (failed === 0) {
    status = 'success';
  } else if (upgraded === 0) {
    status = 'failed';
    reason = cmdKind ?? 'UNKNOWN';
  } else {
    status = 'partial';
    reason = 'PARTIAL';
  }

  const errors = packages
    .filter(p => p.outcome === 'failed')
    .map(p => `${p.name}: no se pudo actualizar (${p.failureKind})`);

  return {
    success: status === 'success' || status === 'noop',
    upgraded,
    failed,
    errors,
    status,
    skipped: 0,
    reason,
    reboot: rebootFrom(commands),
    packages,
    commands,
  };
}
