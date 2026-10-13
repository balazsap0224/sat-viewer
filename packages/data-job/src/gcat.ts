// Reading GCAT (Jonathan McDowell, planet4589.org/space/gcat, CC-BY 4.0) tab-separated files.
//
// Format (docs/data-notes.md): the first line is the header, starting with '#'; further lines
// starting with '#' are comments (e.g. "# Updated 2026 Oct  9"). Fields are padded with
// spaces; '-' means "no value". A '?' in the flag column after a number marks an estimate.
// Dates are "vague dates" ("1957 Oct  4", "2024 Sep", "1958 Jan  4?"); only their year is
// used here, and every form starts with it.
//
// Two files share this format: satcat.tsv (catalog numbers up to 69999) and satcat100k.tsv
// (6-digit numbers, objects launched since July 2026).

export interface GcatObject {
  /** GCAT's own id, e.g. "S25544" */
  readonly jcat: string;
  /** US catalog number, or undefined when GCAT has none ("NNA", "NSO", …) */
  readonly satcat: number | undefined;
  /** International designator of the piece, e.g. "1998-067A" */
  readonly piece: string;
  readonly name: string;
  readonly plName: string | undefined;
  /** Owner/operator org code (orgs.tsv) */
  readonly owner: string | undefined;
  readonly manufacturer: string | undefined;
  readonly bus: string | undefined;
  readonly massKg: number | undefined;
  readonly massEstimated: boolean;

  // For the statistics (SPEC.md 4.5)
  /** First letter of GCAT's SatType: P payload, R rocket stage, C component, D debris, Z spurious */
  readonly kind: string;
  /** COSPAR designation of the launch, e.g. "1957 ALP" or "2026-160" */
  readonly launchTag: string;
  /** Year of launch (GCAT's own launch date, right also for objects released from the ISS) */
  readonly launchYear: number;
  /**
   * Year it separated from its parent (SDate): for a fragment, when the breakup happened,
   * which can be decades after the parent's launch
   */
  readonly separationYear: number | undefined;
  /**
   * Year the object stopped being a separate object in Earth orbit (`gcatEndYear`);
   * undefined while it is still in orbit
   */
  readonly endYear: number | undefined;
  /** Country code of the owner (GCAT State), without a trailing '?' */
  readonly state: string | undefined;
}

export class GcatFormatError extends Error {
  override readonly name = 'GcatFormatError';
}

const value = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t === undefined || t === '' || t === '-' ? undefined : t;
};

/** The year of a vague date, or undefined for none ('-'). Any other form is a format error. */
function yearOf(date: string | undefined, what: string): number | undefined {
  const d = value(date);
  if (d === undefined) return undefined;
  const m = /^(\d{4})/.exec(d);
  if (!m?.[1]) throw new GcatFormatError(`GCAT ${what} "${d}" does not start with a year`);
  return Number(m[1]);
}

/**
 * Phase statuses after which the object is still a separate object in Earth orbit, although
 * GCAT gives an end date: renamed or sold (N), broken up (E: it goes on as a fragment),
 * released from what held it (REL), lost but probably still in orbit (OX). Every other status
 * with an end date means it left: reentered, landed, deorbited, went into deep space, or
 * docked, was grappled or attached to another object and is part of that from then on.
 */
const STILL_IN_ORBIT_AFTER = new Set(['N', 'E', 'REL', 'OX']);

/**
 * The year an object stopped being a separate object in Earth orbit, from the phase end date
 * (DDate) and status of its GCAT row; undefined while it is still in orbit.
 */
export function gcatEndYear(
  dDate: string | undefined,
  status: string | undefined,
): number | undefined {
  const year = yearOf(dDate, 'end date (DDate)');
  if (year === undefined) return undefined;
  return STILL_IN_ORBIT_AFTER.has(value(status) ?? '') ? undefined : year;
}

/** Splits a GCAT TSV into header-keyed rows, checking that the columns we use exist. */
function readTsv(text: string, required: readonly string[]): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  const header = lines[0];
  if (!header?.startsWith('#')) throw new GcatFormatError('GCAT file has no "#" header line');
  const columns = header
    .slice(1)
    .split('\t')
    .map((c) => c.trim());
  for (const name of required) {
    if (!columns.includes(name)) throw new GcatFormatError(`GCAT file has no column "${name}"`);
  }
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    if (line === '' || line.startsWith('#')) continue;
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    columns.forEach((c, i) => (row[c] = cells[i] ?? ''));
    rows.push(row);
  }
  return rows;
}

/** Parses satcat.tsv (GCAT's main catalog). */
export function parseGcatSatcat(text: string): GcatObject[] {
  const rows = readTsv(text, [
    'JCAT',
    'Satcat',
    'Launch_Tag',
    'Piece',
    'Type',
    'Name',
    'PLName',
    'LDate',
    'SDate',
    'DDate',
    'Status',
    'Owner',
    'State',
    'Manufacturer',
    'Bus',
    'Mass',
    'MassFlag',
  ]);
  return rows.map((r) => {
    const satcat = value(r.Satcat);
    const mass = value(r.Mass);
    const launchYear = yearOf(r.LDate, 'launch date (LDate)');
    if (launchYear === undefined) {
      throw new GcatFormatError(`GCAT object ${value(r.JCAT) ?? '?'} has no launch date`);
    }
    return {
      jcat: value(r.JCAT) ?? '',
      satcat: satcat !== undefined && /^\d+$/.test(satcat) ? Number(satcat) : undefined,
      piece: value(r.Piece) ?? '',
      name: value(r.Name) ?? '',
      plName: value(r.PLName),
      owner: value(r.Owner),
      manufacturer: value(r.Manufacturer),
      bus: value(r.Bus),
      massKg: mass !== undefined && Number.isFinite(Number(mass)) ? Number(mass) : undefined,
      massEstimated: value(r.MassFlag) === '?',
      kind: (value(r.Type) ?? '').charAt(0),
      launchTag: value(r.Launch_Tag) ?? '',
      launchYear,
      separationYear: yearOf(r.SDate, 'separation date (SDate)'),
      endYear: gcatEndYear(r.DDate, r.Status),
      state: value(r.State)?.replace(/\?$/, ''),
    };
  });
}

/** Parses orgs.tsv into org code → readable name (the "Name" column, else "ShortName"). */
export function parseGcatOrgs(text: string): Map<string, string> {
  const rows = readTsv(text, ['Code', 'ShortName', 'Name']);
  const orgs = new Map<string, string>();
  for (const r of rows) {
    const code = value(r.Code);
    const name = value(r.Name) ?? value(r.ShortName);
    // An org can have several rows over time (renamed companies); the last one is current.
    if (code && name) orgs.set(code, name);
  }
  return orgs;
}

/**
 * Parses orgs.tsv into org code → the country it belongs to (the "StateCode" column):
 * HK → CN, ESIB (Balearic Islands) → E, CSSR → CZ. Countries map to themselves.
 */
export function parseGcatStateCodes(text: string): Map<string, string> {
  const rows = readTsv(text, ['Code', 'StateCode']);
  const states = new Map<string, string>();
  for (const r of rows) {
    const code = value(r.Code);
    const state = value(r.StateCode);
    if (code && state) states.set(code, state);
  }
  return states;
}

/**
 * Index for finding an object's GCAT row. Tried in order: the US catalog number; GCAT's own
 * id "S" + 5 digits (GCAT keeps the number in JCAT even where it disputes the identification
 * and writes "NNA" in the Satcat column); the international designator.
 */
export function gcatIndex(objects: readonly GcatObject[]) {
  const bySatcat = new Map<number, GcatObject>();
  const byJcat = new Map<string, GcatObject>();
  const byPiece = new Map<string, GcatObject>();
  for (const o of objects) {
    if (o.satcat !== undefined) bySatcat.set(o.satcat, o);
    byJcat.set(o.jcat, o);
    if (o.piece) byPiece.set(o.piece, o);
  }
  return (norad: number, cosparId: string): GcatObject | undefined =>
    bySatcat.get(norad) ??
    (norad < 100000 ? byJcat.get(`S${String(norad).padStart(5, '0')}`) : undefined) ??
    byPiece.get(cosparId);
}
