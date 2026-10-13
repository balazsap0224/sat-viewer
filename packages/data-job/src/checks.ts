// Sanity checks before publishing (SPEC.md 4.3). Any failure stops the job and keeps the
// previous files: better slightly old data than wrong data.

export class SanityError extends Error {
  override readonly name = 'SanityError';
}

/** Largest allowed change in the object count from one run to the next (SPEC.md 4.3) */
export const MAX_COUNT_CHANGE = 0.1;

/**
 * How far an element epoch may lie in the future [ms]. SPEC.md 4.3 says "no epoch in the
 * future", but the 18th SDS fits some high orbits with an epoch ahead of the fit time: the
 * first live run (2026-10-11) had two, Chandra (CXO) 30 h and XMM-Newton 13 h ahead. Such
 * elements are valid; an epoch days ahead would point to a broken file. 3 days allows the
 * former and catches the latter (docs/decisions.md).
 */
export const MAX_EPOCH_AHEAD_MS = 3 * 86_400_000;

/** Parses a CelesTrak OMM epoch ("2026-10-11T04:13:59.875680", UTC, no suffix) to Unix ms. */
export const epochMs = (epoch: string): number => Date.parse(`${epoch}Z`);

export function checkCount(
  count: number,
  previous: number | undefined,
  what = 'object count',
): void {
  if (count === 0) throw new SanityError(`${what}: none at all`);
  if (previous === undefined || previous === 0) return;
  const change = Math.abs(count - previous) / previous;
  if (change > MAX_COUNT_CHANGE) {
    throw new SanityError(
      `${what} changed by ${(change * 100).toFixed(1)} % (${previous} → ${count}); ` +
        `more than ${MAX_COUNT_CHANGE * 100} % looks like a broken download. ` +
        'If the change is real, delete packages/web/public/data/meta.json and run again.',
    );
  }
}

export function checkEpochs(epochs: readonly string[], now: Date): void {
  for (const e of epochs) {
    const t = epochMs(e);
    if (!Number.isFinite(t)) throw new SanityError(`unreadable epoch "${e}"`);
    if (t - now.getTime() > MAX_EPOCH_AHEAD_MS) {
      throw new SanityError(`epoch ${e} is more than 3 days in the future`);
    }
  }
}
