/**
 * The one way a listing says "I could not answer".
 *
 * It lives in its own module because BOTH the declarative engine path and the
 * descriptors' escape hatches have to raise the same thing: twelve managers list
 * through a hatch, and every one of them used to answer a failed command with an
 * empty array — which is a valid, meaningful answer ("nothing pending"). That is
 * how pip reported «todo al día» on every run while failing 100% of the time.
 */

export class ListingUnavailableError extends Error {
  constructor(
    readonly managerId: string,
    readonly detail: string,
  ) {
    super(`${managerId}: no se pudo determinar la lista de pendientes (${detail})`);
    this.name = 'ListingUnavailableError';
  }
}

/**
 * Raise unless the listing command actually answered.
 *
 * `okExitCodes` exists because some listings exit non-zero ON SUCCESS —
 * `npm outdated` and `pnpm outdated` do it when they find something.
 */
export function requireListing(
  managerId: string,
  res: { exitCode: number; timedOut: boolean },
  okExitCodes: number[] = [0],
): void {
  if (okExitCodes.includes(res.exitCode)) return;
  throw new ListingUnavailableError(
    managerId,
    res.timedOut ? 'expiró la espera' : `exit=${res.exitCode}`,
  );
}
