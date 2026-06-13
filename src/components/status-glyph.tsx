import React from 'react';
import { Text } from 'ink';
import { semantic } from '../theme.js';
import type { ManagerStatus } from '../state/types.js';

interface GlyphSpec {
  glyph: string;
  color: string;
}

// SINGLE SOURCE OF TRUTH: every manager status → one static glyph + colour.
// Static (no spinner timers) on purpose: animation comes from real state changes,
// which keeps Ink's frame height stable and avoids redraw drift/stacking.
const SPECS: Record<ManagerStatus, GlyphSpec> = {
  pending: { glyph: '·', color: semantic.muted },
  scanning: { glyph: '◌', color: semantic.action },
  outdated: { glyph: '›', color: semantic.warning },
  uptodate: { glyph: '✓', color: semantic.muted },
  queued: { glyph: '·', color: semantic.muted },
  running: { glyph: '▸', color: semantic.action },
  done: { glyph: '✓', color: semantic.success },
  failed: { glyph: '✗', color: semantic.error },
  skipped: { glyph: '⊘', color: semantic.warning },
};

export function statusColor(status: ManagerStatus): string {
  return SPECS[status].color;
}

export function StatusGlyph({ status }: { status: ManagerStatus }) {
  const spec = SPECS[status];
  return <Text color={spec.color}>{spec.glyph}</Text>;
}
