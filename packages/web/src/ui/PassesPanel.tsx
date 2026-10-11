// "My location" and the next passes of the selected satellite (SPEC.md 7.2, 6.4).
// The search itself is packages/core/src/passes.ts.

import {
  degToRad,
  findPasses,
  MS_PER_DAY,
  type Pass,
  radToDeg,
  type SatRec,
} from '@sat-viewer/core';
import { useEffect, useMemo, useState } from 'react';
import {
  type ObserverLocation,
  observerStore,
  parseLocation,
  useObserver,
} from '../state/observer';
import { selection } from '../state/selection';
import { simClock, timeWindow } from '../state/simClock';
import { fmtLat, fmtLon } from './format';

/** How far ahead of the shown time to look [days], and how many passes to list */
const LOOKAHEAD_DAYS = 3;
const MAX_PASSES = 8;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
/** Azimuth [rad] → compass point (N, NE, …), each 45° wide. */
export const compass = (azRad: number): string => COMPASS[Math.round(radToDeg(azRad) / 45) % 8]!;

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The window searched: from the shown time, LOOKAHEAD_DAYS ahead, within the slider's range. */
function searchWindow(t: number) {
  return { from: t, to: Math.min(t + LOOKAHEAD_DAYS * MS_PER_DAY, timeWindow().max) };
}

function usePasses(satrec: SatRec | undefined, observer: ObserverLocation | null) {
  // Recompute when the shown time leaves the searched window or jumps back before it.
  const [anchor, setAnchor] = useState(() => simClock.now());
  const result = useMemo(() => {
    if (!satrec || !observer) return undefined;
    const w = searchWindow(anchor);
    const o = {
      latRad: degToRad(observer.latDeg),
      lonRad: degToRad(observer.lonDeg),
      altKm: observer.altKm,
    };
    return { window: w, passes: findPasses(satrec, o, w.from, w.to, { maxPasses: MAX_PASSES }) };
  }, [satrec, observer, anchor]);

  useEffect(() => {
    const id = setInterval(() => {
      const t = simClock.now();
      if (!result) return;
      const first = result.passes[0];
      // Moved on past the first pass, or jumped outside the window: search again.
      const stale =
        t < result.window.from - 60_000 ||
        t > result.window.to ||
        (first !== undefined && t > first.set.t);
      if (stale) setAnchor(t);
    }, 1000);
    return () => clearInterval(id);
  }, [result]);

  return result;
}

function LocationEditor({ onDone }: { readonly onDone: () => void }) {
  const o = observerStore.get();
  const [lat, setLat] = useState(o ? String(o.latDeg) : '');
  const [lon, setLon] = useState(o ? String(o.lonDeg) : '');
  const parsed = parseLocation(lat, lon);
  return (
    <form
      className="location-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!parsed) return;
        observerStore.set(parsed);
        onDone();
      }}
    >
      <label>
        <span className="faint small">Latitude (° N, negative for S)</span>
        <input
          className="field num"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          inputMode="decimal"
        />
      </label>
      <label>
        <span className="faint small">Longitude (° E, negative for W)</span>
        <input
          className="field num"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
          inputMode="decimal"
        />
      </label>
      <div className="location-actions">
        <button className="btn btn-small btn-primary" type="submit" disabled={!parsed}>
          Save
        </button>
        <button className="btn btn-small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function useMyLocation() {
  const [status, setStatus] = useState<string | null>(null);
  const locate = () => {
    if (!('geolocation' in navigator)) {
      setStatus('This browser cannot share its location; type it in instead.');
      return;
    }
    setStatus('Asking the browser…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        observerStore.set({
          latDeg: Number(p.coords.latitude.toFixed(4)),
          lonDeg: Number(p.coords.longitude.toFixed(4)),
          altKm: (p.coords.altitude ?? 0) / 1000,
        });
        setStatus(null);
      },
      (err) => setStatus(`No location (${err.message || 'denied'}); type it in instead.`),
      { maximumAge: 600_000, timeout: 15_000 },
    );
  };
  return { status, locate };
}

function PassRow({ p }: { readonly p: Pass }) {
  // Up for the whole window (geostationary and similar): no rise or set to show, and its
  // "visible" span would cover whole nights, so it is left out.
  if (p.startsBeforeWindow && p.endsAfterWindow) {
    return (
      <li className="pass-row small">
        Always above 10° here: {compass(p.culmination.azRad)}, about{' '}
        {radToDeg(p.culmination.elRad).toFixed(0)}° high.
      </li>
    );
  }
  const v = p.visible;
  return (
    <li>
      <button
        className="pass-row clickable"
        title="Watch this pass: jump to it and follow the satellite"
        onClick={() => {
          simClock.setTime(p.rise.t - 30_000, 1);
          selection.setFocused(true);
        }}
      >
        <span>
          <span className="muted">{dayFmt.format(p.rise.t)}</span>{' '}
          <span className="num">
            {p.startsBeforeWindow ? 'now' : timeFmt.format(p.rise.t)}–
            {p.endsAfterWindow ? '…' : timeFmt.format(p.set.t)}
          </span>
        </span>
        <span className="num small muted">
          {compass(p.rise.azRad)} → {compass(p.set.azRad)}, highest{' '}
          {radToDeg(p.culmination.elRad).toFixed(0)}°
          {v && (
            <span
              className="badge badge-good pass-visible"
              title="Satellite in sunlight while your sky is dark"
            >
              Visible {timeFmt.format(v.from)}–{timeFmt.format(v.to)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function PassesPanel({
  satrec,
  name,
}: {
  readonly satrec: SatRec | undefined;
  readonly name: string | undefined;
}) {
  const observer = useObserver();
  const [editing, setEditing] = useState(false);
  const { status, locate } = useMyLocation();
  const result = usePasses(satrec, observer);

  return (
    <section className="pane passes" aria-label="Passes over your location">
      <div className="pane-head">
        <h2 className="pane-title">Passes over you</h2>
      </div>
      <div className="pane-section">
        {editing ? (
          <LocationEditor onDone={() => setEditing(false)} />
        ) : (
          <div className="location-row">
            <span className="num small">
              {observer
                ? `${fmtLat(observer.latDeg)}, ${fmtLon(observer.lonDeg)}`
                : 'No location set'}
            </span>
            <button className="btn btn-small" onClick={locate}>
              Use my location
            </button>
            <button className="btn btn-small" onClick={() => setEditing(true)}>
              {observer ? 'Edit' : 'Type it'}
            </button>
          </div>
        )}
        {status && <p className="small muted">{status}</p>}
      </div>
      {observer && !editing && (
        <div className="pane-section scroll passes-body">
          {!satrec ? (
            <p className="small muted">Select a satellite to see when it passes over you.</p>
          ) : !result ? null : result.passes.length === 0 ? (
            <p className="small muted">
              {name} does not rise above 10° here in the next {LOOKAHEAD_DAYS} days.
            </p>
          ) : (
            <>
              <ul className="pass-list">
                {result.passes.map((p) => (
                  <PassRow key={p.rise.t} p={p} />
                ))}
              </ul>
              <p className="faint small">
                Above 10° elevation, next {LOOKAHEAD_DAYS} days from the shown time. Times in {zone}
                . Click a pass to watch it. &quot;Visible&quot; means sunlit in a dark sky;
                brightness is not modelled, so small or distant satellites may still be too faint.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
