import React from 'react';
import { Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { semantic } from '../theme.js';
import type { ManagerStatus } from '../state/types.js';

interface GlyphSpec {
  glyph: string;
  color: string;
  /** Render an animated spinner instead of a static glyph. */
  spinner?: boolean;
}

// SINGLE SOURCE OF TRUTH: every manager status → one glyph + colour.
// This is what makes "is it working vs done vs failed" unambiguous.
const SPECS: Record<ManagerStatus, GlyphSpec> = {
  pending: { glyph: '○', color: semantic.muted },
  scanning: { glyph: '⟳', color: semantic.action, spinner: true },
  outdated: { glyph: '›', color: semantic.warning },
  uptodate: { glyph: '✓', color: semantic.muted },
  queued: { glyph: '·', color: semantic.muted },
  running: { glyph: '⟳', color: semantic.action, spinner: true },
  done: { glyph: '✓', color: semantic.success },
  failed: { glyph: '✗', color: semantic.error },
  skipped: { glyph: '⊘', color: semantic.warning },
};

export function statusColor(status: ManagerStatus): string {
  return SPECS[status].color;
}

export function StatusGlyph({ status }: { status: ManagerStatus }) {
  const spec = SPECS[status];
  // @inkjs/ui Spinner renders a <Box>, so it must NOT be wrapped in <Text>.
  if (spec.spinner) return <Spinner />;
  return <Text color={spec.color}>{spec.glyph}</Text>;
}
