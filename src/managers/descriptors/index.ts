import type { ManagerDescriptor } from '../descriptor.js';
import { brew } from './brew.js';
import { pip } from './pip.js';
import { npm } from './npm.js';
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

/** Every package manager known to the app, as declarative descriptors. */
export const ALL_DESCRIPTORS: ManagerDescriptor[] = [
  // system
  brew,
  softwareupdate,
  apt,
  dnf,
  pacman,
  // language / runtime
  npm,
  pip,
  conda,
  gem,
  composer,
  angular,
  // apps
  winget,
  choco,
  flatpak,
  snap,
  // sdk / toolchains
  cargo,
  flutter,
  goLang,
];
