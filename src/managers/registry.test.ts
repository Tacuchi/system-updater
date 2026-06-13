import { describe, it, expect } from 'vitest';
import { ALL_DESCRIPTORS } from './descriptors/index.js';
import { buildManagers } from './registry.js';
import { normalizeConfig } from '../lib/config.js';

const VALID_PLATFORMS = new Set(['darwin', 'linux', 'win32']);
const VALID_GROUPS = new Set(['system', 'language', 'apps', 'sdk']);

describe('descriptor registry', () => {
  it('registers all 27 managers', () => {
    expect(ALL_DESCRIPTORS).toHaveLength(27);
  });

  it('has unique manager ids', () => {
    const ids = ALL_DESCRIPTORS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every descriptor declares a group and at least one valid platform', () => {
    for (const d of ALL_DESCRIPTORS) {
      expect(VALID_GROUPS.has(d.group), `${d.id} group`).toBe(true);
      expect(d.platforms.length, `${d.id} platforms`).toBeGreaterThan(0);
      for (const p of d.platforms) expect(VALID_PLATFORMS.has(p), `${d.id} platform ${p}`).toBe(true);
    }
  });

  it('every descriptor can upgrade somehow (declarative upgradeCmd, escape hatch, or readonly)', () => {
    for (const d of ALL_DESCRIPTORS) {
      const canUpgrade = !!d.upgradeCmd || !!d.escapeHatch?.upgrade || d.kind === 'readonly';
      expect(canUpgrade, `${d.id} has no upgrade path`).toBe(true);
    }
  });

  it('buildManagers returns live PackageManagers for the current platform only', () => {
    const managers = buildManagers(normalizeConfig({}));
    expect(managers.length).toBeGreaterThan(0);
    for (const m of managers) {
      expect(m.platforms).toContain(process.platform);
      expect(typeof m.detect).toBe('function');
      expect(typeof m.listOutdated).toBe('function');
      expect(typeof m.upgrade).toBe('function');
    }
  });
});
