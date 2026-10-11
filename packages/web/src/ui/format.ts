// Number and date formatting for the panels (degrees and km appear only here, at the UI
// boundary: CLAUDE.md rule 4).

export const fmtLat = (d: number): string => `${Math.abs(d).toFixed(2)}° ${d >= 0 ? 'N' : 'S'}`;
export const fmtLon = (d: number): string => `${Math.abs(d).toFixed(2)}° ${d >= 0 ? 'E' : 'W'}`;

export const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** "4.2 h" below two days, else "3.1 days". */
export function fmtAgeDays(days: number): string {
  const a = Math.abs(days);
  return a < 2 ? `${(a * 24).toFixed(1)} h` : `${a.toFixed(1)} days`;
}

/** Whole years between a "YYYY-MM-DD" date and time t (Unix ms), or null. */
export function yearsSince(date: string | null, t: number): number | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`);
  const now = new Date(t);
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const beforeAnniversary =
    now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate());
  if (beforeAnniversary) years--;
  return years;
}

/** "20 November 1998" from "1998-11-20". */
export function fmtDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** CelesTrak operational status codes (SATCAT documentation). */
export const OPS_STATUS: Record<string, string> = {
  '+': 'Operational',
  '-': 'Not operational',
  P: 'Partially operational',
  B: 'Backup',
  S: 'Spare',
  X: 'Extended mission',
  D: 'Decayed',
  '?': 'Unknown',
};
