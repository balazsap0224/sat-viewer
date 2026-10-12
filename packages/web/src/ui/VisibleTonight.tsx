// With a location set and nothing selected, the passes panel lists what can be seen from there
// (SPEC.md 7.2 "My location"). It follows the filters (state/filters.ts):
//
// - No filters: the satellites most likely to be seen in the next dark-sky window. Candidates
//   are the heaviest low-orbit satellites ([PROPOSED] 150 by GCAT mass): big and close is what
//   makes a satellite bright.
// - Filters set: the same search over the satellites that pass them, heaviest first, at most
//   [PROPOSED] 300. Filters describe the orbit or the object, not where it is, so a
//   satellite that passes them now also passes them during its pass.
// - "Show only these" list: every pass of each chosen satellite in the next 24 hours, visible
//   or not, as one timetable ([PROPOSED] at most 50 satellites).
//
// Visible passes are ranked by core/skywatch.ts's relative brightness at their closest
// visible moment. The search runs on the main thread in small slices so the globe keeps
// moving (about half a second per 150 satellites).

import {
  degToRad,
  findPasses,
  lookAngles,
  MS_PER_DAY,
  nextDarkWindow,
  type Observer,
  type Pass,
  propagateAt,
  radToDeg,
  relativeMagnitude,
  type SatRec,
} from '@sat-viewer/core';
import { useEffect, useMemo, useState } from 'react';
import { satrecFromRow } from '../data/elements';
import type { SatData } from '../data/load';
import { type Filters, filterMask, isFiltering, useFilters } from '../state/filters';
import type { ObserverLocation } from '../state/observer';
import { selection } from '../state/selection';
import { simClock, timeWindow } from '../state/simClock';

/** Candidates searched without filters, with filters, and with a chosen list ([PROPOSED]) */
const CANDIDATES = 150;
const FILTERED_CANDIDATES = 300;
const CHOSEN_MAX = 50;
/** Rows listed in the "likeliest to see" modes */
const LISTED = 10;
/** Search at most this far ahead */
const LOOKAHEAD_MS = MS_PER_DAY;
/** Candidates searched per slice before yielding to the browser */
const SLICE = 10;
/**
 * Mass used to rank a satellite whose mass GCAT does not know. 1 kg puts it below every
 * satellite with a known mass, so it is only listed when too few of those pass.
 */
const UNKNOWN_MASS_KG = 1;

export interface Sighting {
  readonly norad: number;
  readonly name: string;
  readonly pass: Pass;
  readonly visible: { readonly from: number; readonly to: number } | null;
  /** Relative brightness [mag], smaller = brighter (core/skywatch.ts) */
  readonly mag: number;
}

type Mode = 'likeliest' | 'filtered' | 'chosen';

interface Plan {
  readonly mode: Mode;
  /** Row indices to search, in order of preference */
  readonly rows: readonly number[];
  /** How many objects qualified before the cap */
  readonly matching: number;
}

interface Result {
  readonly plan: Plan;
  /** The window searched: the dark sky (likeliest modes) or the next 24 h (chosen list) */
  readonly window: { readonly from: number; readonly to: number } | null;
  readonly sightings: readonly Sighting[];
}

const massOf = (data: SatData, i: number) => data.catalog[i]?.gcat?.massKg ?? null;

/** Which satellites to search, given the filters. */
function plan(data: SatData, f: Filters, mask: Uint8Array): Plan {
  if (f.only.length > 0) {
    const rows = f.only.map((n) => data.indexOf.get(n)).filter((i) => i !== undefined);
    return { mode: 'chosen', rows: rows.slice(0, CHOSEN_MAX), matching: rows.length };
  }
  const filtering = isFiltering(f);
  // Only low-orbit satellites are bright enough to see; heaviest first, unknown mass last.
  const leo: number[] = [];
  data.classes.forEach((c, i) => {
    // Debris fragments are far too small to see with the naked eye.
    if (c !== 'LEO' || !mask[i] || data.debris[i]) return;
    if (!filtering && massOf(data, i) === null) return;
    leo.push(i);
  });
  leo.sort((a, b) => (massOf(data, b) ?? 0) - (massOf(data, a) ?? 0));
  const cap = filtering ? FILTERED_CANDIDATES : CANDIDATES;
  return {
    mode: filtering ? 'filtered' : 'likeliest',
    rows: leo.slice(0, cap),
    matching: leo.length,
  };
}

/** The closest (so brightest) moment of a pass's visible part [ms]. */
function brightestMoment(p: Pass, v: { from: number; to: number }): number {
  return Math.min(Math.max(p.culmination.t, v.from), v.to);
}

/** The best visible pass of one satellite in the window, or undefined. */
function bestSighting(
  satrec: SatRec,
  observer: Observer,
  window: { from: number; to: number },
  mass: number,
): { pass: Pass; visible: { from: number; to: number }; mag: number } | undefined {
  let best: ReturnType<typeof bestSighting>;
  for (const pass of findPasses(satrec, observer, window.from, window.to, { maxPasses: 30 })) {
    const v = pass.visible;
    if (!v) continue;
    const t = brightestMoment(pass, v);
    const s = propagateAt(satrec, t);
    if (!s.ok) continue;
    const mag = relativeMagnitude(mass, lookAngles(observer, s.r, t).rangeKm);
    if (!best || mag < best.mag) best = { pass, visible: v, mag };
  }
  return best;
}

/**
 * Several catalog objects can be one spacecraft (the ISS modules each have a catalog number
 * and the same orbit). Their passes coincide; keep the lowest catalog number (the first
 * module, which carries the station's name) with the brightest value of the group.
 */
function mergeCoincident(list: Sighting[]): Sighting[] {
  const out: Sighting[] = [];
  for (const s of [...list].sort((a, b) => a.norad - b.norad)) {
    const twin = out.findIndex(
      (o) =>
        Math.abs(o.pass.rise.t - s.pass.rise.t) < 10_000 &&
        Math.abs(o.pass.set.t - s.pass.set.t) < 10_000,
    );
    if (twin < 0) out.push(s);
    else if (s.mag < out[twin]!.mag) out[twin] = { ...out[twin]!, mag: s.mag };
  }
  return out;
}

function useSightings(data: SatData, location: ObserverLocation) {
  const filters = useFilters();
  const mask = useMemo(
    () => filterMask(filters, data.catalog, data.classes, data.elements.rows),
    [data, filters],
  );
  const todo = useMemo(() => plan(data, filters, mask), [data, filters, mask]);
  const [anchor, setAnchor] = useState(() => simClock.now());
  const [state, setState] = useState<{ result?: Result; done: number; total: number }>({
    done: 0,
    total: 0,
  });

  useEffect(() => {
    const observer: Observer = {
      latRad: degToRad(location.latDeg),
      lonRad: degToRad(location.lonDeg),
      altKm: location.altKm,
    };
    const end = Math.min(anchor + LOOKAHEAD_MS, timeWindow().max);
    const window =
      todo.mode === 'chosen' ? { from: anchor, to: end } : nextDarkWindow(observer, anchor, end);
    if (!window || todo.rows.length === 0) {
      setState({ result: { plan: todo, window, sightings: [] }, done: 0, total: 0 });
      return;
    }
    const found: Sighting[] = [];
    let k = 0;
    let timer: ReturnType<typeof setTimeout>;
    setState({ done: 0, total: todo.rows.length });

    const slice = () => {
      for (const stop = Math.min(k + SLICE, todo.rows.length); k < stop; k++) {
        const i = todo.rows[k]!;
        const row = data.elements.rows[i]!;
        const name = data.catalog[i]?.name ?? String(row[0]);
        let satrec: SatRec;
        try {
          satrec = satrecFromRow(row);
        } catch {
          continue; // SGP4 cannot initialise it: hidden everywhere
        }
        if (todo.mode === 'chosen') {
          for (const pass of findPasses(satrec, observer, window.from, window.to, {
            maxPasses: 30,
          }))
            found.push({ norad: row[0], name, pass, visible: pass.visible, mag: 0 });
        } else {
          const mass = massOf(data, i) ?? UNKNOWN_MASS_KG;
          const b = bestSighting(satrec, observer, window, mass);
          if (b) found.push({ norad: row[0], name, ...b });
        }
      }
      if (k < todo.rows.length) {
        setState({ done: k, total: todo.rows.length });
        timer = setTimeout(slice, 0);
        return;
      }
      const sightings =
        todo.mode === 'chosen'
          ? found.sort((a, b) => a.pass.rise.t - b.pass.rise.t)
          : mergeCoincident(found)
              .sort((a, b) => a.mag - b.mag)
              .slice(0, LISTED)
              .sort((a, b) => a.visible!.from - b.visible!.from);
      setState({ result: { plan: todo, window, sightings }, done: k, total: k });
    };
    timer = setTimeout(slice, 0);
    return () => clearTimeout(timer);
  }, [data, location, anchor, todo]);

  // Search again when the shown time leaves the searched window (or jumps back before it).
  const searched = state.result?.window;
  useEffect(() => {
    const id = setInterval(() => {
      const t = simClock.now();
      if (!state.result) return;
      const end = searched ? searched.to : anchor + LOOKAHEAD_MS;
      if (t < anchor - 60_000 || t > end) setAnchor(t);
    }, 1000);
    return () => clearInterval(id);
  }, [state.result, searched, anchor]);

  return state;
}

export function VisibleTonight({
  data,
  location,
  timeFmt,
  dayFmt,
  compass,
}: {
  readonly data: SatData;
  readonly location: ObserverLocation;
  readonly timeFmt: Intl.DateTimeFormat;
  readonly dayFmt: Intl.DateTimeFormat;
  readonly compass: (azRad: number) => string;
}) {
  const { result, done, total } = useSightings(data, location);

  if (!result)
    return (
      <p className="small muted" aria-live="polite">
        Searching… {total > 0 && `${done} of ${total}`}
      </p>
    );

  const { plan: p, window, sightings } = result;
  const chosen = p.mode === 'chosen';
  const watch = (s: Sighting) => {
    selection.select(s.norad);
    simClock.setTime((s.visible?.from ?? s.pass.rise.t) - 30_000, 1);
    selection.setFocused(true);
  };

  if (p.rows.length === 0)
    return (
      <p className="small muted">
        {chosen
          ? 'None of the chosen satellites is in the data.'
          : 'No low-orbit satellite passes the filters. Only low-orbit satellites are bright enough to see with the naked eye.'}
      </p>
    );
  if (!window)
    return (
      <p className="small muted">
        The sky does not get dark here in the next 24 hours (the Sun stays above −6°), so no
        satellites can be seen. Select one to see its passes.
      </p>
    );

  return (
    <>
      <p className="small">
        <span className="muted">{chosen ? 'Next 24 h ' : 'Dark sky '}</span>
        <span className="num">
          {dayFmt.format(window.from)} {timeFmt.format(window.from)} –{' '}
          {chosen ? `${dayFmt.format(window.to)} ` : ''}
          {timeFmt.format(window.to)}
        </span>
      </p>
      {sightings.length === 0 ? (
        <p className="small muted">
          {chosen
            ? 'None of the chosen satellites rises above 10° here in the next 24 hours.'
            : p.mode === 'filtered'
              ? 'None of the matching satellites passes in sunlight tonight.'
              : 'None of the big satellites passes in sunlight tonight.'}
        </p>
      ) : (
        <ul className="pass-list">
          {sightings.map((s) => {
            const always = s.pass.startsBeforeWindow && s.pass.endsAfterWindow;
            return (
              <li key={`${s.norad}-${s.pass.rise.t}`}>
                <button
                  className="pass-row clickable"
                  title="Watch it: select it, jump to the start and follow it"
                  onClick={() => watch(s)}
                >
                  <span className="sighting-head">
                    <span className="sighting-name">{s.name}</span>
                    {chosen ? (
                      <span className="num small">
                        {always
                          ? 'always up'
                          : `${s.pass.startsBeforeWindow ? 'now' : timeFmt.format(s.pass.rise.t)}–${s.pass.endsAfterWindow ? '…' : timeFmt.format(s.pass.set.t)}`}
                      </span>
                    ) : (
                      <span className="badge badge-good pass-visible num">
                        {timeFmt.format(s.visible!.from)}–{timeFmt.format(s.visible!.to)}
                      </span>
                    )}
                  </span>
                  <span className="num small muted">
                    {always
                      ? `${compass(s.pass.culmination.azRad)}, about ${radToDeg(s.pass.culmination.elRad).toFixed(0)}° high`
                      : `${compass(s.pass.rise.azRad)} → ${compass(s.pass.set.azRad)}, highest ${radToDeg(s.pass.culmination.elRad).toFixed(0)}°`}
                    {chosen && s.visible && !always && (
                      <span
                        className="badge badge-good pass-visible"
                        title="Satellite in sunlight while your sky is dark"
                      >
                        Visible {timeFmt.format(s.visible.from)}–{timeFmt.format(s.visible.to)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="faint small">
        {chosen
          ? `Every pass above 10° of your chosen satellites${p.matching > p.rows.length ? ` (the first ${p.rows.length} of ${p.matching})` : ''}. `
          : p.mode === 'filtered'
            ? `The ${LISTED} likeliest to see among the satellites matching your filters (searched the ${p.rows.length} heaviest of ${p.matching} in low orbit), ranked by size and distance. `
            : `The ${LISTED} likeliest to see among the ${CANDIDATES} heaviest low-orbit satellites, ranked by size and distance. `}
        {chosen
          ? '"Visible" means sunlit in a dark sky; no brightness model. Click one to watch it.'
          : 'No true brightness model. Times are when each is sunlit in a dark sky above 10°. Click one to watch it.'}
      </p>
    </>
  );
}
