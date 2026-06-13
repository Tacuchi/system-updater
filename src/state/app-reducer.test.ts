import { describe, it, expect } from 'vitest';
import { appReducer, initialState } from './app-reducer.js';
import { selectionKey } from './types.js';
import type { AppState } from './types.js';
import type { Action } from './actions.js';
import { normalizeConfig } from '../lib/config.js';

const cfg = normalizeConfig({});
const base = () => initialState(cfg, false);

function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(appReducer, state);
}

const detect: Action = {
  type: 'DETECT_DONE',
  managers: [
    { id: 'brew', group: 'system', requiresAdmin: false, version: '4.0' },
    { id: 'apt', group: 'system', requiresAdmin: true },
  ],
};

describe('appReducer', () => {
  it('boots into detecting', () => {
    expect(appReducer(base(), { type: 'BOOT_DONE' }).phase).toBe('detecting');
  });

  it('DETECT_DONE sets order, manager entries, and moves to scanning', () => {
    const s = apply(base(), detect);
    expect(s.phase).toBe('scanning');
    expect(s.order).toEqual(['brew', 'apt']);
    expect(s.managers['brew']?.status).toBe('scanning');
    expect(s.managers['apt']?.requiresAdmin).toBe(true);
  });

  it('marks a manager outdated or uptodate after scanning', () => {
    let s = apply(base(), detect);
    s = appReducer(s, {
      type: 'SCAN_MANAGER_DONE',
      id: 'brew',
      outdated: [{ name: 'git', currentVersion: '1', newVersion: '2' }],
    });
    s = appReducer(s, { type: 'SCAN_MANAGER_DONE', id: 'apt', outdated: [] });
    expect(s.managers['brew']?.status).toBe('outdated');
    expect(s.managers['brew']?.outdated).toHaveLength(1);
    expect(s.managers['apt']?.status).toBe('uptodate');
  });

  it('SCAN_ALL_DONE advances to select', () => {
    const s = apply(base(), detect, { type: 'SCAN_ALL_DONE' });
    expect(s.phase).toBe('select');
  });

  it('toggles selection on and off', () => {
    const key = selectionKey('brew', 'git');
    let s = apply(base(), detect, { type: 'TOGGLE_ITEM', key });
    expect(s.selection.has(key)).toBe(true);
    s = appReducer(s, { type: 'TOGGLE_ITEM', key });
    expect(s.selection.has(key)).toBe(false);
  });

  it('SELECT_ALL selects every outdated package; SELECT_NONE clears', () => {
    let s = apply(
      base(),
      detect,
      { type: 'SCAN_MANAGER_DONE', id: 'brew', outdated: [
        { name: 'git', currentVersion: '1', newVersion: '2' },
        { name: 'node', currentVersion: '1', newVersion: '2' },
      ] },
      { type: 'SCAN_ALL_DONE' },
      { type: 'SELECT_ALL' },
    );
    expect(s.selection.size).toBe(2);
    expect(s.selection.has(selectionKey('brew', 'git'))).toBe(true);
    s = appReducer(s, { type: 'SELECT_NONE' });
    expect(s.selection.size).toBe(0);
  });

  it('GOTO_CONFIRM requires a non-empty selection', () => {
    let s = apply(base(), detect, { type: 'SCAN_ALL_DONE' });
    expect(appReducer(s, { type: 'GOTO_CONFIRM' }).phase).toBe('select'); // empty → stays
    s = appReducer(s, { type: 'TOGGLE_ITEM', key: selectionKey('brew', 'git') });
    expect(appReducer(s, { type: 'GOTO_CONFIRM' }).phase).toBe('confirm');
  });

  it('runs managers through queued → running → done with live counts', () => {
    let s = apply(base(), detect, { type: 'SCAN_ALL_DONE' });
    s = appReducer(s, { type: 'RUN_START', queue: ['brew', 'apt'] });
    expect(s.phase).toBe('updating');
    expect(s.managers['brew']?.status).toBe('queued');

    s = appReducer(s, { type: 'MGR_RUNNING', id: 'brew' });
    expect(s.managers['brew']?.status).toBe('running');

    s = appReducer(s, { type: 'MGR_PROGRESS', id: 'brew', percent: 50, currentPackage: 'git' });
    expect(s.managers['brew']?.percent).toBe(50);
    expect(s.managers['brew']?.currentPackage).toBe('git');

    s = appReducer(s, {
      type: 'MGR_DONE',
      id: 'brew',
      result: { status: 'success', upgraded: 2, failed: 0, skipped: 0, failures: [] },
    });
    expect(s.managers['brew']?.status).toBe('done');
    expect(s.managers['brew']?.percent).toBe(100);
    expect(s.run.doneCount).toBe(1);

    s = appReducer(s, {
      type: 'MGR_FAILED',
      id: 'apt',
      result: { status: 'failed', upgraded: 0, failed: 1, skipped: 0, failures: [{ message: 'boom' }] },
    });
    expect(s.managers['apt']?.status).toBe('failed');
    expect(s.run.failedCount).toBe(1);

    s = appReducer(s, { type: 'RUN_DONE' });
    expect(s.phase).toBe('summary');
  });

  it('MGR_SKIPPED records a manual command', () => {
    let s = apply(base(), detect, { type: 'RUN_START', queue: ['apt'] });
    s = appReducer(s, { type: 'MGR_SKIPPED', id: 'apt', manualCommand: 'sudo apt upgrade' });
    expect(s.managers['apt']?.status).toBe('skipped');
    expect(s.managers['apt']?.manualCommand).toBe('sudo apt upgrade');
    expect(s.run.skippedCount).toBe(1);
  });

  it('settings overlay remembers and restores the previous phase', () => {
    let s = apply(base(), detect, { type: 'SCAN_ALL_DONE' });
    s = appReducer(s, { type: 'OPEN_SETTINGS' });
    expect(s.phase).toBe('settings');
    s = appReducer(s, { type: 'CLOSE_SETTINGS' });
    expect(s.phase).toBe('select');
  });

  it('BATCH applies actions in order as one transition', () => {
    const s = appReducer(base(), {
      type: 'BATCH',
      actions: [detect, { type: 'MGR_PROGRESS', id: 'brew', percent: 10 }],
    });
    expect(s.order).toEqual(['brew', 'apt']);
    expect(s.managers['brew']?.percent).toBe(10);
  });

  it('RESCAN clears state back to detecting', () => {
    let s = apply(base(), detect, { type: 'SCAN_ALL_DONE' }, { type: 'TOGGLE_ITEM', key: selectionKey('brew', 'git') });
    s = appReducer(s, { type: 'RESCAN' });
    expect(s.phase).toBe('detecting');
    expect(s.order).toEqual([]);
    expect(s.selection.size).toBe(0);
  });
});
