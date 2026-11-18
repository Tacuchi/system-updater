import { describe, expect, it } from 'vitest';
import { themeFor } from './theme.js';
function contrast(hex: string) {
  const values = hex.slice(1).match(/../g)!.map(value => {
    const c = parseInt(value, 16) / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return 1.05 / (values[0]! * .2126 + values[1]! * .7152 + values[2]! * .0722 + .05);
}
describe('terminal brand tokens', () => {
  it('uses brand text and accent while preserving state colors', () => {
    const dark = themeFor('dark');
    expect(dark.text).toBe('#e6e6e2');
    expect(dark.muted).toBe('#a3a39b');
    expect(dark.action).toBe('#bff278');
    expect(dark.success).toBe('#bff278');
    for (const mode of ['light', 'dark'] as const) {
      expect(themeFor(mode)).toMatchObject({ error: '#ffb4ab', warning: '#ffade0', unknown: '#f0b429' });
    }
  });
  it('keeps light text readable and uses lime only as fill', () => {
    const light = themeFor('light');
    expect(light.text).toBe('#111111');
    expect(light.muted).toBe('#5c5c56');
    expect(light.accentFill).toBe('#bce489');
    for (const role of ['text', 'muted', 'action', 'success'] as const) {
      expect(contrast(light[role])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
