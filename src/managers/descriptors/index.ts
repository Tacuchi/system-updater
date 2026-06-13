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
import { rustup } from './rustup.js';
import { pnpm } from './pnpm.js';
import { yarn } from './yarn.js';
import { bun } from './bun.js';
import { mise } from './mise.js';
import { asdf } from './asdf.js';
import { mas } from './mas.js';
import { scoop } from './scoop.js';
import { pipx } from './pipx.js';

/** Every package manager known to the app, as declarative descriptors (27 total). */
export const ALL_DESCRIPTORS: ManagerDescriptor[] = [
  // system package managers
  brew,
  softwareupdate,
  apt,
  dnf,
  pacman,
  // language / runtime package managers
  npm,
  pnpm,
  yarn,
  bun,
  pip,
  pipx,
  conda,
  gem,
  composer,
  angular,
  // apps / app stores
  winget,
  choco,
  flatpak,
  snap,
  mas,
  scoop,
  // sdk / toolchains
  rustup,
  cargo,
  mise,
  asdf,
  flutter,
  goLang,
];
