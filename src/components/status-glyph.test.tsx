import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RunningGlyph, StatusGlyph } from './status-glyph.js';
import { g } from '../lib/glyphs.js';

describe('RunningGlyph', () => {
  it('mounts and renders a single-cell glyph without crashing', () => {
    // In the non-TTY test env NO_ANIM is true, so it renders the STATIC running
    // glyph (no timer mounted → no hanging handle). The animated path is the same
    // component with a 90ms cycler, exercised manually on a real TTY.
    const { lastFrame, unmount } = render(<RunningGlyph />);
    expect(lastFrame()).toContain(g.running);
    unmount();
  });
});

describe('StatusGlyph', () => {
  it('renders the static glyph for a terminal status', () => {
    expect(render(<StatusGlyph status="done" />).lastFrame()).toContain(g.done);
    expect(render(<StatusGlyph status="failed" />).lastFrame()).toContain(g.failed);
  });
});
