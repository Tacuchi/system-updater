import type { PackageManager, ManagerDetection } from './types.js';
import type { ManagerDescriptor } from './descriptor.js';
import { fromDescriptor } from './engine.js';
import { ALL_DESCRIPTORS } from './descriptors/index.js';
import type { EngineTask } from '../lib/exec/engine.js';
import type { UserConfig } from '../lib/config.js';
import { isManagerEnabled } from '../lib/config.js';

export interface DetectedManager {
  manager: PackageManager;
  detection: ManagerDetection;
}

/** Build live PackageManagers from the descriptors compatible with this OS. */
export function buildManagers(config: UserConfig): PackageManager[] {
  const platform = process.platform;
  return ALL_DESCRIPTORS.filter(d => d.platforms.includes(platform)).map(d => fromDescriptor(d, config));
}

export function getDescriptors(): ManagerDescriptor[] {
  const platform = process.platform;
  return ALL_DESCRIPTORS.filter(d => d.platforms.includes(platform));
}

/** Detect which managers are actually installed (in parallel). */
export async function detectManagers(config: UserConfig): Promise<DetectedManager[]> {
  const managers = buildManagers(config);

  const results = await Promise.allSettled(
    managers.map(async m => ({ manager: m, detection: await m.detect() })),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<DetectedManager> =>
        r.status === 'fulfilled' && r.value.detection.available,
    )
    .map(r => r.value);
}

/** Build the engine task list for the enabled subset of detected managers. */
export function buildTasks(
  detected: DetectedManager[],
  config: UserConfig,
  packagesByManager?: Map<string, string[]>,
): EngineTask[] {
  return detected
    .filter(dm => isManagerEnabled(config, dm.manager.id))
    .map(dm => ({
      manager: dm.manager,
      op: 'upgrade' as const,
      packages: packagesByManager?.get(dm.manager.id),
    }));
}
