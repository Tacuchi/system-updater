import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { useApp } from 'ink';
import { appReducer, initialState } from '../state/app-reducer.js';
import type { AppState, ManagerResult, ManagerPackageResult, UiFailure, PackageItem } from '../state/types.js';
import { parseSelectionKey } from '../state/types.js';
import type { Action } from '../state/actions.js';
import { detectManagers } from '../managers/registry.js';
import type { DetectedManager } from '../managers/registry.js';
import { runEngine } from '../lib/exec/engine.js';
import type { EngineProgress, EngineTask } from '../lib/exec/engine.js';
import type { UpgradeResult } from '../managers/types.js';
import type { UserConfig } from '../lib/config.js';
import { loadConfig, saveConfig, isManagerEnabled } from '../lib/config.js';
import { initLogger, getLogFilePath } from '../lib/logger.js';
import * as logger from '../lib/logger.js';
import { setLanguage } from '../i18n/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { relaunchElevated, elevatedSummaryPath } from '../lib/elevation.js';
import { onProcessCancel } from '../lib/cancellation.js';

/** Pure: project an engine UpgradeResult onto the UI ManagerResult shape. */
export function toManagerResult(r: UpgradeResult, logRef?: string): ManagerResult {
  const failures: UiFailure[] = (r.packages ?? [])
    .filter(p => p.outcome === 'failed')
    .map(p => ({ package: p.name, message: p.detail ?? p.failureKind ?? 'failed', kind: p.failureKind, logRef }));
  if (failures.length === 0 && (r.status === 'failed' || (!r.success && r.status !== 'noop'))) {
    failures.push({ message: r.errors[0] ?? 'failed', kind: r.reason, logRef });
  }
  return {
    status: r.status ?? (r.success ? 'success' : 'failed'),
    upgraded: r.upgraded,
    failed: r.failed,
    skipped: r.skipped ?? 0,
    failures,
    manualCommand: r.manualCommand,
    reboot: r.reboot,
    // Keep the per-package detail + engine timings the Summary needs (previously discarded).
    packages: r.packages?.map(p => ({
      name: p.name,
      outcome: p.outcome,
      fromVersion: p.fromVersion,
      toVersion: p.toVersion,
    })),
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

export interface RunSummaryManager {
  id: string;
  status: string;
  upgraded: number;
  failed: number;
  /** Real per-manager duration (ms), from the engine-authored result timings. */
  durationMs?: number;
  /** Per-package detail (name + version delta) for the Summary table. */
  packages?: ManagerPackageResult[];
}

export interface RunSummary {
  upgraded: number;
  failed: number;
  skipped: number;
  managers: RunSummaryManager[];
}

/**
 * Pure: aggregate a finished run into a serializable summary. Feeds both the
 * Summary screen (per-manager rows) and the run-summary log block. Duration
 * comes from the engine result timings (the reducer stays pure).
 */
export function summarizeRun(state: AppState): RunSummary {
  let upgraded = 0;
  let failed = 0;
  let skipped = 0;
  const managers: RunSummaryManager[] = [];
  for (const id of state.run.queue) {
    const e = state.managers[id];
    if (!e) continue;
    if (e.status === 'skipped') {
      skipped++;
      managers.push({ id, status: 'skipped', upgraded: 0, failed: 0 });
      continue;
    }
    const r = e.result;
    const u = r?.upgraded ?? 0;
    const f = r?.failed ?? 0;
    upgraded += u;
    failed += f;
    const durationMs =
      r?.startedAt !== undefined && r?.finishedAt !== undefined ? r.finishedAt - r.startedAt : undefined;
    managers.push({ id, status: e.status, upgraded: u, failed: f, durationMs, packages: r?.packages });
  }
  return { upgraded, failed, skipped, managers };
}

export interface MachineValue {
  state: AppState;
  sudoMode: boolean;
  toggleItem: (key: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  goConfirm: () => void;
  goSelect: () => void;
  startRun: () => void;
  cancelRun: () => void;
  relaunch: () => void;
  rescan: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setLang: (lang: 'es' | 'en') => void;
  toggleEnabled: (id: string) => void;
}

const MachineContext = createContext<MachineValue | null>(null);

export function useMachine(): MachineValue {
  const ctx = useContext(MachineContext);
  if (!ctx) throw new Error('useMachine must be used inside <MachineProvider>');
  return ctx;
}

export function useAppMachine(sudoMode: boolean, nonInteractive = false): MachineValue {
  const configRef = useRef<UserConfig>(loadConfig());
  const [state, dispatch] = useReducer(appReducer, undefined, () =>
    initialState(configRef.current, sudoMode),
  );
  const detectedRef = useRef<DetectedManager[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // ---- detect + scan ----
  const boot = useCallback(async () => {
    const config = configRef.current;
    dispatch({ type: 'BOOT_DONE' });
    try {
      const detected = await detectManagers(config);
      detectedRef.current = detected;
      dispatch({
        type: 'DETECT_DONE',
        managers: detected.map(d => ({
          id: d.manager.id,
          group: d.manager.group ?? 'language',
          requiresAdmin: d.manager.requiresAdmin,
          version: d.detection.version,
        })),
      });
      await Promise.allSettled(
        detected.map(async dm => {
          if (!isManagerEnabled(config, dm.manager.id)) {
            dispatch({ type: 'SCAN_MANAGER_DONE', id: dm.manager.id, outdated: [] });
            return;
          }
          dispatch({ type: 'SCAN_MANAGER_START', id: dm.manager.id });
          try {
            const outdated = await dm.manager.listOutdated();
            dispatch({ type: 'SCAN_MANAGER_DONE', id: dm.manager.id, outdated: outdated as PackageItem[] });
          } catch (err) {
            logger.error(`Error escaneando ${dm.manager.id}: ${String(err)}`);
            dispatch({ type: 'SCAN_MANAGER_FAILED', id: dm.manager.id });
          }
        }),
      );
      dispatch({ type: 'SCAN_ALL_DONE' });
    } catch (err) {
      dispatch({ type: 'DETECT_FAILED', error: String(err) });
    }
  }, []);

  useEffect(() => {
    initLogger();
    setLanguage(configRef.current.language);
    void boot();
  }, [boot]);

  // Bridge OS signals (SIGINT/SIGBREAK, fired from cli.tsx) to the engine's
  // AbortController so Ctrl+C / Ctrl+Break cancel the run (→ tree-kill children),
  // not just unmount Ink. Works regardless of raw-mode (non-interactive too).
  useEffect(() => onProcessCancel(() => abortRef.current?.abort()), []);

  // ---- run upgrades through the engine ----
  const startRun = useCallback(() => {
    const config = configRef.current;
    const packagesByManager = new Map<string, string[]>();
    for (const key of state.selection) {
      const [id, pkg] = parseSelectionKey(key);
      const list = packagesByManager.get(id) ?? [];
      list.push(pkg);
      packagesByManager.set(id, list);
    }
    const tasks: EngineTask[] = detectedRef.current
      .filter(dm => packagesByManager.has(dm.manager.id))
      .map(dm => ({ manager: dm.manager, op: 'upgrade', packages: packagesByManager.get(dm.manager.id) }));
    if (tasks.length === 0) return;

    dispatch({ type: 'RUN_START', queue: tasks.map(t => t.manager.id) });
    const ac = new AbortController();
    abortRef.current = ac;
    const logRef = getLogFilePath() ?? undefined;

    // Coalesce engine events into ONE batched dispatch per frame (~30fps) so a
    // multi-manager run renders a handful of times per second, not once per
    // streamed line. The reducer applies a BATCH as a single transition.
    let pending: Action[] = [];
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      if (pending.length === 0) return;
      const actions = pending;
      pending = [];
      dispatch(actions.length === 1 ? actions[0]! : { type: 'BATCH', actions });
    };
    const enqueue = (a: Action) => {
      pending.push(a);
      if (!scheduled) {
        scheduled = true;
        setTimeout(flush, 33);
      }
    };

    const onEvent = (e: EngineProgress) => {
      const { managerId: id } = e;
      if (e.phase === 'queued') {
        enqueue({ type: 'MGR_QUEUED', id });
      } else if (e.phase === 'upgrading') {
        // ONLY redraw on a real percent change — never on every output line. A
        // per-line redraw storm collides with subprocess writes to the TTY
        // (e.g. a brew cask's nested `sudo` "Password:" prompt, which has no
        // newline and shifts the cursor), corrupting Ink and stacking frames.
        // While a manager just runs, the screen stays still and any prompt shows
        // cleanly below it.
        if (e.event?.percent !== undefined) {
          enqueue({ type: 'MGR_PROGRESS', id, percent: e.event.percent });
        } else if (!e.event) {
          enqueue({ type: 'MGR_RUNNING', id });
        }
      } else if (e.phase === 'done' && e.result) {
        const r = e.result;
        if (r.status === 'noop' && r.manualCommand) {
          enqueue({ type: 'MGR_SKIPPED', id, manualCommand: r.manualCommand });
        } else if (r.success || r.status === 'success' || r.status === 'partial') {
          enqueue({ type: 'MGR_DONE', id, result: toManagerResult(r, logRef) });
        } else {
          enqueue({ type: 'MGR_FAILED', id, result: toManagerResult(r, logRef) });
        }
      }
    };

    void runEngine(tasks, {
      concurrency: config.concurrency,
      signal: ac.signal,
      sudoMode,
      timeoutsMs: config.timeoutsMs,
      onEvent,
    }).finally(() => {
      flush(); // drain any buffered events before settling
      dispatch({ type: 'RUN_DONE' });
      abortRef.current = null;
    });
  }, [state.selection, sudoMode]);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const rescan = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'RESCAN' });
    void boot();
  }, [boot]);

  // ---- non-interactive driver (no TTY / --yes / --all) ----
  // Drive the linear flow to completion without keypresses, then exit with a
  // meaningful code. This is also what keeps a piped/Git-Bash run (where raw mode
  // is unsupported and useSafeInput is inert) from hanging on the select screen.
  const { exit } = useApp();
  const exitedRef = useRef(false);
  const finishNonInteractive = useCallback(
    (code: number) => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      process.exitCode = code;
      exit(); // unmount Ink, restoring the terminal
      // Backstop hard-exit in case a stray handle keeps the loop alive. Skipped
      // under vitest so the test runner is never killed.
      if (!process.env['VITEST']) {
        const t = setTimeout(() => process.exit(code), 100);
        t.unref?.();
      }
    },
    [exit],
  );

  useEffect(() => {
    if (!nonInteractive) return;
    if (state.phase === 'select') {
      const hasOutdated = state.order.some(id => (state.managers[id]?.outdated.length ?? 0) > 0);
      if (!hasOutdated) finishNonInteractive(0);
      else if (state.selection.size === 0) dispatch({ type: 'SELECT_ALL' });
      else dispatch({ type: 'GOTO_CONFIRM' });
    } else if (state.phase === 'confirm') {
      startRun();
    } else if (state.phase === 'summary') {
      finishNonInteractive(state.run.failedCount > 0 ? 1 : 0);
    }
  }, [
    nonInteractive,
    state.phase,
    state.selection.size,
    state.run.failedCount,
    state.order,
    state.managers,
    startRun,
    finishNonInteractive,
  ]);

  // Best-effort hand-off: persist the finished run's summary to %LOCALAPPDATA% so a
  // non-elevated parent can (optionally) read what an elevated child did. win32-only.
  // GATED (#5): validate the round-trip on real Windows.
  useEffect(() => {
    if (state.phase !== 'summary' || process.platform !== 'win32') return;
    try {
      const p = elevatedSummaryPath();
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify({ ...summarizeRun(state), at: Date.now() }, null, 2), 'utf-8');
    } catch {
      /* hand-off is best-effort */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // On run completion, append a plain-text run-summary block to the log file so
  // the end-of-execution detail (per-manager status + duration + totals) is
  // reconstructable from the log alone. Best-effort; fires once per summary.
  useEffect(() => {
    if (state.phase !== 'summary') return;
    logger.logRunSummary(summarizeRun(state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Relaunch the whole TUI elevated (one UAC) and cede control. Offered in Confirm
  // when admin managers would be skipped for lack of elevation (win32).
  const relaunch = useCallback(() => {
    void (async () => {
      const ok = await relaunchElevated();
      if (ok) {
        process.exitCode = 0;
        exit(); // cede control to the elevated console
        if (!process.env['VITEST']) {
          const t = setTimeout(() => process.exit(0), 100);
          t.unref?.();
        }
      }
    })();
  }, [exit]);

  // persist config whenever it changes via the reducer
  const persist = useCallback((next: Action) => {
    dispatch(next);
  }, []);

  const setLang = useCallback((lang: 'es' | 'en') => {
    configRef.current = { ...configRef.current, language: lang };
    saveConfig(configRef.current);
    setLanguage(lang);
    dispatch({ type: 'SET_LANGUAGE', lang });
  }, []);

  const toggleEnabled = useCallback((id: string) => {
    const enabled = { ...configRef.current.enabledManagers };
    enabled[id] = !(enabled[id] ?? true);
    configRef.current = { ...configRef.current, enabledManagers: enabled };
    saveConfig(configRef.current);
    dispatch({ type: 'TOGGLE_ENABLED', id });
  }, []);

  return {
    state,
    sudoMode,
    toggleItem: useCallback((key: string) => persist({ type: 'TOGGLE_ITEM', key }), [persist]),
    selectAll: useCallback(() => persist({ type: 'SELECT_ALL' }), [persist]),
    selectNone: useCallback(() => persist({ type: 'SELECT_NONE' }), [persist]),
    goConfirm: useCallback(() => persist({ type: 'GOTO_CONFIRM' }), [persist]),
    goSelect: useCallback(() => persist({ type: 'GOTO_SELECT' }), [persist]),
    startRun,
    cancelRun,
    relaunch,
    rescan,
    openSettings: useCallback(() => persist({ type: 'OPEN_SETTINGS' }), [persist]),
    closeSettings: useCallback(() => persist({ type: 'CLOSE_SETTINGS' }), [persist]),
    setLang,
    toggleEnabled,
  };
}

export function MachineProvider({ value, children }: { value: MachineValue; children: React.ReactNode }) {
  return <MachineContext.Provider value={value}>{children}</MachineContext.Provider>;
}
