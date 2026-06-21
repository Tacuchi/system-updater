import React from 'react';
import { Text } from 'ink';
import { semantic } from '../theme.js';
import { g } from '../lib/glyphs.js';
import type { ManagerStatus } from '../state/types.js';

interface GlyphSpec {
  glyph: string;
  color: string;
}

// SINGLE SOURCE OF TRUTH: every manager status → one static glyph + colour.
// Static (no spinner timers) on purpose: animation comes from real state changes,
// which keeps Ink's frame height stable and avoids redraw drift/stacking. Glyphs
// come from the shared set so they degrade to ASCII on legacy Windows consoles.
const SPECS: Record<ManagerStatus, GlyphSpec> = {
  pending: { glyph: g.pending, color: semantic.muted },
  scanning: { glyph: g.scanning, color: semantic.action },
  outdated: { glyph: g.outdated, color: semantic.warning },
  uptodate: { glyph: g.uptodate, color: semantic.muted },
  queued: { glyph: g.pending, color: semantic.muted },
  running: { glyph: g.running, color: semantic.action },
  done: { glyph: g.done, color: semantic.success },
  failed: { glyph: g.failed, color: semantic.error },
  skipped: { glyph: g.skipped, color: semantic.warning },
};

export function statusColor(status: ManagerStatus): string {
  return SPECS[status].color;
}

export function StatusGlyph({ status }: { status: ManagerStatus }) {
  const spec = SPECS[status];
  return <Text color={spec.color}>{spec.glyph}</Text>;
}
