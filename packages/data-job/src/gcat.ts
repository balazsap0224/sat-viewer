// Reading GCAT (Jonathan McDowell, planet4589.org/space/gcat, CC-BY 4.0) tab-separated files.
//
// Format (docs/data-notes.md): the first line is the header, starting with '#'; further lines
// starting with '#' are comments (e.g. "# Updated 2026 Oct  9"). Fields are padded with
// spaces; '-' means "no value". A '?' in the flag column after a number marks an estimate.

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
}

export class GcatFormatError extends Error {
  override readonly name = 'GcatFormatError';
}

const value = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t === undefined || t === '' || t === '-' ? undefined : t;
};

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
    'Piece',
    'Name',
    'PLName',
    'Owner',
    'Manufacturer',
    'Bus',
    'Mass',
    'MassFlag',
  ]);
  return rows.map((r) => {
    const satcat = value(r.Satcat);
    const mass = value(r.Mass);
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
