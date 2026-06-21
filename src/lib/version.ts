import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let cached: string | null = null;

/**
 * The package version, read from package.json at runtime (so it never goes stale
 * like the old hardcoded '1.0.0'). Tries the bundled layout (dist/cli.js →
 * ../package.json) and the source/dev layout (src/lib/version.ts →
 * ../../package.json). npm always publishes package.json, so it's present under npx.
 */
export function getVersion(): string {
  if (cached !== null) return cached;
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(here, rel), 'utf-8')) as { version?: string };
      if (pkg.version) {
        cached = pkg.version;
        return cached;
      }
    } catch {
      /* try the next candidate */
    }
  }
  cached = '0.0.0';
  return cached;
}
