// "Closest meetings" (SPEC.md 7.2): the closest approaches between satellites in the 24 hours
// after the shown time, from data/encounters.json (computed by the data job with
// core/encounters.ts). Opens and closes like the filters; follows the filters (a meeting is
// listed when either satellite passes them). Clicking one selects the pair, jumps to a minute
// before the closest moment and follows.

import { MS_PER_DAY } from '@sat-viewer/core';
import type { EncounterRow } from '@sat-viewer/shared';
import { useEffect, useMemo, useState } from 'react';
import { useEncounters } from '../data/encounters';
import type { SatData } from '../data/load';
import { selection, useSelection } from '../state/selection';
import { simClock } from '../state/simClock';

/** Rows listed ([PROPOSED]) */
const LISTED = 20;
/** Re-filter the list as the shown time moves on, at most this often [ms] */
const TICK_MS = 5_000;

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' });
const utcFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** Miss distance for display: the data is good to about 1 km, so no metres. */
export const fmtMiss = (km: number) => (km < 0.1 ? '< 0.1 km' : `${km.toFixed(1)} km`);

function useShownTime(): number {
  const [t, setT] = useState(() => simClock.now());
  useEffect(() => {
    const id = setInterval(() => setT(simClock.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return t;
}

export function MeetingsPanel({
  data,
  mask,
}: {
  readonly data: SatData;
  readonly mask: Uint8Array;
}) {
  const [open, setOpen] = useState(false);
  const [sameGroup, setSameGroup] = useState(false);
  const enc = useEncounters(open);
  const t = useShownTime();
  const { selected, companion } = useSelection();

  const nameOf = (norad: number) => {
    const i = data.indexOf.get(norad);
    return (i !== undefined ? data.catalog[i]?.name : undefined) ?? String(norad);
  };

  const rows = useMemo(() => {
    if (enc.status !== 'ready') return [];
    const group = (norad: number) => {
      const i = data.indexOf.get(norad);
      return i !== undefined ? (data.catalog[i]?.constellation ?? null) : null;
    };
    const shown = (norad: number) => {
      const i = data.indexOf.get(norad);
      return i !== undefined && mask[i] === 1;
    };
    // Debris hidden by the filters keeps its meetings hidden too.
    const hiddenDebris = (norad: number) => {
      const i = data.indexOf.get(norad);
      return i !== undefined && data.debris[i] === 1 && mask[i] !== 1;
    };
    const out: EncounterRow[] = [];
    for (const r of enc.file.rows) {
      const [a, b, when] = r;
      if (when < t || when > t + MS_PER_DAY) continue;
      if (!shown(a) && !shown(b)) continue;
      if (hiddenDebris(a) || hiddenDebris(b)) continue;
      if (!sameGroup && group(a) !== null && group(a) === group(b)) continue;
      out.push(r);
      if (out.length >= LISTED) break;
    }
    return out;
  }, [enc, t, data, mask, sameGroup]);

  const span =
    enc.status === 'ready'
      ? { from: Date.parse(enc.file.from), to: Date.parse(enc.file.to) }
      : undefined;
  const outside = span && (t < span.from || t + MS_PER_DAY > span.to);

  return (
    <section className="pane meetings" aria-label="Closest meetings">
      <div className="pane-head">
        <button
          className="btn-ghost filters-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'} Closest meetings
        </button>
        <span className="small muted">next 24 h</span>
      </div>
      {open && (
        <div className="pane-section scroll meetings-body">
          {enc.status === 'loading' || enc.status === 'idle' ? (
            <p className="small muted">Loading…</p>
          ) : enc.status !== 'ready' ? (
            <p className="small muted">
              No close-approach data ({'message' in enc ? enc.message : ''}). Run{' '}
              <code>pnpm encounters</code> or <code>pnpm data</code>.
            </p>
          ) : (
            <>
              <label className="small meetings-toggle">
                <input
                  type="checkbox"
                  checked={sameGroup}
                  onChange={(e) => setSameGroup(e.target.checked)}
                />{' '}
                Include meetings within one constellation (e.g. Starlink with Starlink)
              </label>
              {outside && (
                <p className="small muted">
                  Close approaches are computed for {utcFmt.format(span.from)} –{' '}
                  {utcFmt.format(span.to)} UTC; part of the next 24 hours from the shown time is
                  outside that.
                </p>
              )}
              {rows.length === 0 ? (
                <p className="small muted">
                  No meetings under {enc.file.thresholdKm} km in this window
                  {sameGroup ? '' : ' between different constellations'}.
                </p>
              ) : (
                <ul className="pass-list">
                  {rows.map(([a, b, when, miss, rel]) => {
                    const active =
                      (selected === a && companion === b) || (selected === b && companion === a);
                    return (
                      <li key={`${a}-${b}-${when}`}>
                        <button
                          className={`pass-row clickable ${active ? 'btn-active' : ''}`}
                          title="Watch it: show both, jump to a minute before and follow"
                          onClick={() => {
                            selection.selectPair(a, b);
                            simClock.setTime(when - 60_000, 1);
                            selection.setFocused(true);
                          }}
                        >
                          <span className="meeting-names">
                            <span>{nameOf(a)}</span>
                            <span className="faint"> ↔ </span>
                            <span>{nameOf(b)}</span>
                          </span>
                          <span className="num small muted">
                            {dayFmt.format(when)} {timeFmt.format(when)} · {fmtMiss(miss)} ·{' '}
                            {rel.toFixed(1)} km/s
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="faint small">
                Closest first, with how fast they pass each other. Approximate: public orbit data is
                good to about 1 km, so every distance here means &quot;very close&quot;, not a
                collision warning. Pairs that fly together (docked modules, formations) are left
                out.{' '}
                {sameGroup
                  ? ''
                  : 'Meetings within one constellation are hidden by default: their operators keep their own satellites apart.'}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
