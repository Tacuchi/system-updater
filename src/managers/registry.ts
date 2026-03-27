import type { PackageManager, ManagerDetection } from './types.js';
import { brew } from './brew.js';
import { pip } from './pip.js';
import { npmMgr } from './npm-mgr.js';
import { conda } from './conda.js';
import { gem } from './gem.js';
import { softwareupdate } from './softwareupdate.js';
import { winget } from './winget.js';
import { apt } from './apt.js';
import { dnf } from './dnf.js';
import { pacman } from './pacman.js';
import { flatpak } from './flatpak.js';
import { snap } from './snap.js';
import { flutter } from './flutter.js';
import { angular } from './angular.js';
import { cargo } from './cargo.js';
import { goLang } from './go-lang.js';
import { composer } from './composer.js';
import { choco } from './choco.js';

export interface DetectedManager {
  manager: PackageManager;
  detection: ManagerDetection;
}

const ALL_MANAGERS: PackageManager[] = [
  brew,
  pip,
  npmMgr,
  conda,
  gem,
  softwareupdate,
  winget,
  apt,
  dnf,
  pacman,
  flatpak,
  snap,
  flutter,
  angular,
  cargo,
  goLang,
  composer,
  choco,
];

export async function detectManagers(): Promise<DetectedManager[]> {
  const platform = process.platform;
  const compatible = ALL_MANAGERS.filter(m => m.platforms.includes(platform));

  const results = await Promise.allSettled(
    compatible.map(async m => ({
      manager: m,
      detection: await m.detect(),
    }))
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<DetectedManager> =>
        r.status === 'fulfilled' && r.value.detection.available
    )
    .map(r => r.value);
}
