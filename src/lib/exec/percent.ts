export type PercentParser = (line: string) => number | undefined;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Matches a trailing-most "NN%" token and returns it clamped to 0..100. */
export const genericPercentParser: PercentParser = line => {
  const matches = line.match(/(\d{1,3})\s*%/g);
  if (!matches || matches.length === 0) return undefined;
  const last = matches[matches.length - 1]!;
  const n = parseInt(last, 10);
  return Number.isNaN(n) ? undefined : clamp(n);
};

/**
 * Build a parser that reads an "x/y" progress counter (e.g. brew's
 * "==> Upgrading 3/10") and converts it to a percentage. The regex must expose
 * the numerator and denominator as the first two capture groups.
 */
export function makeFractionParser(re: RegExp): PercentParser {
  return line => {
    const m = line.match(re);
    if (!m) return undefined;
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (!den || Number.isNaN(num) || Number.isNaN(den)) return undefined;
    return clamp(Math.round((num / den) * 100));
  };
}
