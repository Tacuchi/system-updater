import { afterEach, describe, expect, it } from 'vitest';
import { bannerSnapshot, configureBanner, retireBanner, shownBanner, subscribeBanner } from './banner.js';
import { ASCII } from './glyphs.js';

const image = { id: 42, columns: 8, rows: 3, tier: 'placeholders' } as const;
afterEach(() => configureBanner(null));

describe('banner state', () => {
  it('retires once, notifies subscribers and never comes back by itself', () => {
    expect(retireBanner()).toBe(false);
    configureBanner(image);
    let calls = 0;
    const unsubscribe = subscribeBanner(() => { calls++; });
    expect(bannerSnapshot()).toEqual(image);
    expect(retireBanner()).toBe(true);
    expect(retireBanner()).toBe(false);
    expect(bannerSnapshot()).toBeNull();
    expect(calls).toBe(1);
    unsubscribe();
  });
  it('re-checks the terminal size on every render', () => {
    expect(shownBanner(image, { columns: 100, rows: 30 }, {}, false)).toEqual(image);
    expect(shownBanner(image, { columns: 59, rows: 30 }, {}, false)).toBeNull();
    expect(shownBanner(image, { columns: 100, rows: 18 }, {}, false)).toBeNull();
    expect(shownBanner(image, { columns: 100, rows: 30 }, { NO_COLOR: '1' }, false)).toBeNull();
    expect(shownBanner(null, { columns: 100, rows: 30 }, {}, false)).toBeNull();
  });
  it('never shows the banner in ASCII mode', () => {
    expect(shownBanner(image, { columns: 100, rows: 30 }, {}, true)).toBeNull();
    expect(shownBanner(image, { columns: 100, rows: 30 }, {}, false)).toEqual(image);
  });
  it('follows the process ASCII mode by default', () => {
    expect(shownBanner(image, { columns: 100, rows: 30 }, {})).toEqual(ASCII ? null : image);
  });
});
