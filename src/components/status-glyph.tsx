import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { semantic } from '../theme.js';
import { g, NO_ANIM, spinnerFrames } from '../lib/glyphs.js';
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

/**
 * Animated spinner for the running manager's glyph slot. It self-ticks via a
 * timer because run state changes fire only once (anti-flicker), so it cannot
 * animate from the reducer. Frames are 1 cell wide, so the row height/column
 * width stay constant — preserving the Update screen's no-stacking invariant.
 * Degrades to the static `running` glyph when animation is unsafe (ASCII/legacy
 * console or a non-TTY pipe), keeping hooks unconditional.
 */
export function RunningGlyph() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (NO_ANIM) return;
    const t = setInterval(() => setI(n => (n + 1) % spinnerFrames.length), 90);
    return () => clearInterval(t);
  }, []);
  const frame = NO_ANIM ? g.running : spinnerFrames[i] ?? g.running;
  return <Text color={SPECS.running.color}>{frame}</Text>;
}
