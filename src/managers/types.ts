export interface ManagerDetection {
  available: boolean;
  version?: string;
  path?: string;
}

export interface OutdatedPackage {
  name: string;
  currentVersion: string;
  newVersion: string;
  size?: string;
}

export type ProgressEventType = 'start' | 'progress' | 'log' | 'complete' | 'error';

export interface ProgressEvent {
  type: ProgressEventType;
  package?: string;
  percent?: number;
  message: string;
}

export interface UpgradeResult {
  success: boolean;
  upgraded: number;
  failed: number;
  errors: string[];
  manualCommand?: string;
}

export interface PackageManager {
  id: string;
  platforms: NodeJS.Platform[];
  requiresAdmin: boolean;

  detect(): Promise<ManagerDetection>;
  listOutdated(): Promise<OutdatedPackage[]>;
  upgrade(packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult>;
}
