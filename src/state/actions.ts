import type { ManagerGroup } from '../managers/types.js';
import type { Language } from '../i18n/index.js';
import type { ManagerResult, PackageItem } from './types.js';

export interface DetectedManagerInfo {
  id: string;
  group: ManagerGroup;
  requiresAdmin: boolean;
  version?: string;
}

export type Action =
  | { type: 'BOOT_DONE' }
  | { type: 'DETECT_DONE'; managers: DetectedManagerInfo[] }
  | { type: 'DETECT_FAILED'; error: string }
  | { type: 'SCAN_MANAGER_START'; id: string }
  | { type: 'SCAN_MANAGER_DONE'; id: string; outdated: PackageItem[] }
  | { type: 'SCAN_MANAGER_FAILED'; id: string }
  | { type: 'SCAN_ALL_DONE' }
  | { type: 'TOGGLE_ITEM'; key: string }
  | { type: 'SELECT_ALL' }
  | { type: 'SELECT_NONE' }
  | { type: 'GOTO_CONFIRM' }
  | { type: 'GOTO_SELECT' }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'RESCAN' }
  | { type: 'RUN_START'; queue: string[] }
  | { type: 'MGR_QUEUED'; id: string }
  | { type: 'MGR_RUNNING'; id: string }
  | { type: 'MGR_PROGRESS'; id: string; percent?: number; currentPackage?: string }
  | { type: 'MGR_DONE'; id: string; result: ManagerResult }
  | { type: 'MGR_FAILED'; id: string; result: ManagerResult }
  | { type: 'MGR_SKIPPED'; id: string; manualCommand: string }
  | { type: 'RUN_DONE' }
  | { type: 'SET_LANGUAGE'; lang: Language }
  | { type: 'TOGGLE_ENABLED'; id: string }
  | { type: 'BATCH'; actions: Action[] };
