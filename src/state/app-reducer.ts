import type { AppState, ManagerEntry, Phase } from './types.js';
import { selectionKey } from './types.js';
import type { Action, DetectedManagerInfo } from './actions.js';
import type { UserConfig } from '../lib/config.js';

export function initialState(config: UserConfig, sudoMode: boolean): AppState {
  return {
    phase: 'boot',
    prevPhase: 'boot',
    managers: {},
    order: [],
    selection: new Set(),
    run: { queue: [], doneCount: 0, failedCount: 0, skippedCount: 0, unknownCount: 0 },
    config,
    sudoMode,
  };
}

function newEntry(info: DetectedManagerInfo): ManagerEntry {
  return {
    id: info.id,
    group: info.group,
    requiresAdmin: info.requiresAdmin,
    version: info.version,
    // A manager whose probe could not answer is never scanned, so it enters
    // indeterminate and stays there instead of being presented as pending work.
    status: info.undetermined ? 'unknown' : 'scanning',
    outdated: [],
    percent: 0,
  };
}

function patch(state: AppState, id: string, fn: (e: ManagerEntry) => ManagerEntry): AppState {
  const entry = state.managers[id];
  if (!entry) return state;
  return { ...state, managers: { ...state.managers, [id]: fn(entry) } };
}

function allOutdatedKeys(state: AppState): string[] {
  const keys: string[] = [];
  for (const id of state.order) {
    for (const pkg of state.managers[id]?.outdated ?? []) keys.push(selectionKey(id, pkg.name));
  }
  return keys;
}

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'BOOT_DONE':
      return { ...state, phase: 'detecting' };

    case 'DETECT_DONE': {
      const managers: Record<string, ManagerEntry> = {};
      for (const info of action.managers) managers[info.id] = newEntry(info);
      return { ...state, phase: 'scanning', order: action.managers.map(m => m.id), managers };
    }

    case 'DETECT_FAILED':
      return { ...state, phase: 'detecting', error: action.error };

    case 'SCAN_MANAGER_START':
      return patch(state, action.id, e => ({ ...e, status: 'scanning' }));

    case 'SCAN_MANAGER_DONE':
      return patch(state, action.id, e => ({
        ...e,
        outdated: action.outdated,
        status: action.outdated.length > 0 ? 'outdated' : 'uptodate',
      }));

    // A listing that failed used to land here as `uptodate`: the single line that
    // turned "I could not ask" into "nothing to update".
    case 'SCAN_MANAGER_FAILED':
      return patch(state, action.id, e => ({ ...e, status: 'unknown', outdated: [] }));

    case 'SCAN_ALL_DONE':
      return { ...state, phase: 'select' };

    case 'TOGGLE_ITEM': {
      const selection = new Set(state.selection);
      if (selection.has(action.key)) selection.delete(action.key);
      else selection.add(action.key);
      return { ...state, selection };
    }

    case 'SELECT_ALL':
      return { ...state, selection: new Set(allOutdatedKeys(state)) };

    case 'SELECT_NONE':
      return { ...state, selection: new Set() };

    case 'GOTO_CONFIRM':
      return state.selection.size > 0 ? { ...state, phase: 'confirm' } : state;

    case 'GOTO_SELECT':
      return { ...state, phase: 'select' };

    // Same shape as the settings overlay: a screen SWAP grows no region, which
    // is what keeps a long package list from having to be capped by hand.
    //
    // Abrir lo que YA está abierto no vuelve a guardar el origen. Si lo
    // guardara, `prevPhase` pasaría a valer `'detail'` y el cierre devolvería a
    // la misma pantalla: el detalle quedaría SIN SALIDA para siempre, y no hace
    // falta nada raro para caer ahí —dos `d` seguidas alcanzan, y la repetición
    // del teclado las produce sola—. Así se colgó CI, 74 pulsaciones seguidas
    // sin mover un pixel.
    case 'OPEN_DETAIL':
      if (state.phase === 'detail') return state;
      return { ...state, prevPhase: state.phase, phase: 'detail' };

    case 'CLOSE_DETAIL':
      return { ...state, phase: state.prevPhase };

    case 'OPEN_SETTINGS':
      if (state.phase === 'settings') return state;
      return { ...state, prevPhase: state.phase, phase: 'settings' };

    case 'CLOSE_SETTINGS':
      return { ...state, phase: state.prevPhase };

    case 'RESCAN':
      return {
        ...initialState(state.config, state.sudoMode),
        phase: 'detecting',
      };

    case 'RUN_START': {
      const managers = { ...state.managers };
      for (const id of action.queue) {
        const e = managers[id];
        if (e) managers[id] = { ...e, status: 'queued', percent: 0 };
      }
      return {
        ...state,
        phase: 'updating',
        managers,
        run: { queue: action.queue, doneCount: 0, failedCount: 0, skippedCount: 0, unknownCount: 0 },
      };
    }

    case 'MGR_QUEUED':
      return patch(state, action.id, e => ({ ...e, status: 'queued' }));

    // `at` comes in the action, not from Date.now(): the reducer stays pure, and
    // it used to store 0 — which is why no row could show how long it had been
    // running.
    case 'MGR_RUNNING':
      return patch(state, action.id, e => ({
        ...e,
        status: 'running',
        startedAt: e.startedAt !== undefined && e.startedAt > 0 ? e.startedAt : action.at,
      }));

    case 'MGR_PROGRESS':
      return patch(state, action.id, e => ({
        ...e,
        percent: action.percent ?? e.percent,
        currentPackage: action.currentPackage ?? e.currentPackage,
      }));

    case 'MGR_DONE':
      return {
        ...patch(state, action.id, e => ({ ...e, status: 'done', percent: 100, result: action.result })),
        run: { ...state.run, doneCount: state.run.doneCount + 1 },
      };

    case 'MGR_FAILED':
      return {
        ...patch(state, action.id, e => ({ ...e, status: 'failed', percent: 100, result: action.result })),
        run: { ...state.run, failedCount: state.run.failedCount + 1 },
      };

    case 'MGR_SKIPPED':
      return {
        ...patch(state, action.id, e => ({ ...e, status: 'skipped', manualCommand: action.manualCommand })),
        run: { ...state.run, skippedCount: state.run.skippedCount + 1 },
      };

    // Its own counter on purpose: an upgrade whose result could not be verified
    // is neither done nor failed, and folding it into either is the lie.
    case 'MGR_UNKNOWN':
      return {
        ...patch(state, action.id, e => ({ ...e, status: 'unknown', percent: 100, result: action.result })),
        run: { ...state.run, unknownCount: state.run.unknownCount + 1 },
      };

    case 'RUN_DONE':
      return { ...state, phase: 'summary' };

    case 'SET_LANGUAGE':
      return { ...state, config: { ...state.config, language: action.lang } };

    case 'TOGGLE_ENABLED': {
      const enabled = { ...state.config.enabledManagers };
      enabled[action.id] = !(enabled[action.id] ?? true);
      return { ...state, config: { ...state.config, enabledManagers: enabled } };
    }

    case 'BATCH':
      return action.actions.reduce(appReducer, state);

    default:
      return state;
  }
}
