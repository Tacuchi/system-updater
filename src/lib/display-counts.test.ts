import { describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { countText, selectionText, summaryText } from './display-counts.js';

describe('visible counts', () => {
  it('agrees with zero, one and multiple items in Spanish', () => {
    setLanguage('es');
    expect([0, 1, 2].map(n => countText(n, 'upgraded'))).toEqual(['0 actualizados', '1 actualizado', '2 actualizados']);
    expect([0, 1, 2].map(n => countText(n, 'failed'))).toEqual(['0 fallidos', '1 fallido', '2 fallidos']);
    expect([0, 1, 2].map(n => countText(n, 'manual'))).toEqual(['0 manuales', '1 manual', '2 manuales']);
    expect([0, 1, 2].map(n => selectionText(n, 2))).toEqual(['0 de 2 marcados', '1 de 2 marcado', '2 de 2 marcados']);
    expect(summaryText({ upgraded: 0, failed: 0, skipped: 0, unknown: 0 })).toBe('0 actualizados');
    expect(summaryText({ upgraded: 2, failed: 1, skipped: 2, unknown: 1 })).toMatch(/^2 actualizados . 1 fallido . 2 manuales . 1 sin determinar$/);
  });
  it('agrees with counts in English and hides empty summary categories', () => {
    setLanguage('en');
    expect([0, 1, 2].map(n => countText(n, 'upgraded'))).toEqual(['0 upgraded', '1 upgraded', '2 upgraded']);
    expect([0, 1, 2].map(n => countText(n, 'failed'))).toEqual(['0 failed', '1 failed', '2 failed']);
    expect([0, 1, 2].map(n => countText(n, 'manual'))).toEqual(['0 manual updates', '1 manual update', '2 manual updates']);
    expect(selectionText(1, 2)).toBe('1 of 2 marked');
    expect(summaryText({ upgraded: 1, failed: 0, skipped: 0, unknown: 0 })).toBe('1 upgraded');
    expect(summaryText({ upgraded: 2, failed: 1, skipped: 1, unknown: 2 })).toMatch(/^2 upgraded . 1 failed . 1 manual update . 2 undetermined$/);
  });
});
