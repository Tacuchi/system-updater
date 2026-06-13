import { describe, it, expect } from 'vitest';
import { genericPercentParser, makeFractionParser } from './percent.js';

describe('genericPercentParser', () => {
  it('extracts a percentage from a line', () => {
    expect(genericPercentParser('Downloading...  45%')).toBe(45);
  });

  it('returns undefined when there is no percentage', () => {
    expect(genericPercentParser('Resolving dependencies')).toBeUndefined();
  });

  it('clamps values above 100', () => {
    expect(genericPercentParser('progress 150%')).toBe(100);
  });

  it('takes the last percentage on the line', () => {
    expect(genericPercentParser('0% ... 80%')).toBe(80);
  });
});

describe('makeFractionParser', () => {
  it('turns an "x/y" counter into a percentage', () => {
    const parse = makeFractionParser(/Upgrading (\d+)\/(\d+)/);
    expect(parse('==> Upgrading 3/10 formulae')).toBe(30);
  });

  it('returns undefined when the line does not match', () => {
    const parse = makeFractionParser(/Upgrading (\d+)\/(\d+)/);
    expect(parse('==> Pouring something')).toBeUndefined();
  });

  it('returns undefined on a zero denominator', () => {
    const parse = makeFractionParser(/(\d+)\/(\d+)/);
    expect(parse('0/0')).toBeUndefined();
  });
});
