import { afterEach, describe, expect, it } from 'vitest';
import { bannerSnapshot, configureBanner, retireBanner, shownBanner, subscribeBanner } from './banner.js';

const image = { id: 42, columns: 6, rows: 3, tier: 'placeholders' } as const;
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
    expect(shownBanner(image, { columns: 100, rows: 30 })).toEqual(image);
    expect(shownBanner(image, { columns: 59, rows: 30 })).toBeNull();
    expect(shownBanner(image, { columns: 100, rows: 18 })).toBeNull();
    expect(shownBanner(null, { columns: 100, rows: 30 })).toBeNull();
  });
  it('treats the text forms like the images: same size rules', () => {
    const blocks = { id: 0, columns: 6, rows: 3, tier: 'blocks' } as const;
    expect(shownBanner(blocks, { columns: 100, rows: 30 })).toEqual(blocks);
    expect(shownBanner(blocks, { columns: 59, rows: 30 })).toBeNull();
  });
});
