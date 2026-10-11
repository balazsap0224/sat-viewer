// The info card (SPEC.md 1 item 4, 7.2): who owns the satellite, when and where it was
// launched, its orbit, where it is now, what it is (GCAT), and how fresh its orbit data is.

import {
  apsidesKm,
  elementAgeDays,
  epochToUnixMs,
  norm,
  type OrbitClass,
  periodMinutes,
  propagateAt,
  type SatRec,
  STALE_AFTER_DAYS,
  temeToGeodetic,
} from '@sat-viewer/core';
import type { CatalogEntry, ElementRow } from '@sat-viewer/shared';
import { useEffect, useState } from 'react';
import { LAUNCH_SITES, OBJECT_NOTES, ownerName } from '../data/content';
import { CONSTELLATIONS } from '../data/content';
import { ORBIT_CLASS_COLORS } from '../scene/SatellitePoints';
import { selection, useSelection } from '../state/selection';
import { simClock } from '../state/simClock';
import { CLASS_NAMES } from './StatusCorner';
import { fmtAgeDays, fmtDate, fmtInt, fmtLat, fmtLon, OPS_STATUS, yearsSince } from './format';

/** Links out (SPEC.md 7.2). Wikipedia: a search, not an article (owner's choice, 2026-10-11). */
export const celestrakUrl = (norad: number) =>
  `https://celestrak.org/satcat/table-satcat.php?CATNR=${norad}`;
export const wikipediaSearchUrl = (name: string) =>
  `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;

function useTicker(ms: number): number {
  const [t, setT] = useState(() => simClock.now());
  useEffect(() => {
    const id = setInterval(() => setT(simClock.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

export interface InfoCardProps {
  readonly row: ElementRow;
  readonly entry: CatalogEntry | undefined;
  readonly cls: OrbitClass;
  readonly satrec: SatRec;
}

export function InfoCard({ row, entry, cls, satrec }: InfoCardProps) {
  const { focused } = useSelection();
  const t = useTicker(250);
  const norad = row[0];
  const name = entry?.name ?? String(norad);
  const g = entry?.gcat;

  const s = propagateAt(satrec, t);
  const here = s.ok ? temeToGeodetic(s.r, t) : undefined;
  const { perigeeKm, apogeeKm } = apsidesKm(row[2], row[3]);
  const epoch = epochToUnixMs(row[1]);
  const dataAge = elementAgeDays(epoch, Date.now());
  const stale = dataAge > STALE_AFTER_DAYS;
  // How far the shown time is from the element epoch: SGP4's error grows with it.
  const fromEpoch = elementAgeDays(epoch, t);
  const site = entry?.launchSite ? LAUNCH_SITES[entry.launchSite] : undefined;
  const age = yearsSince(entry?.launchDate ?? null, Date.now());
  const constellation = CONSTELLATIONS.find((c) => c.id === entry?.constellation);
  const note = OBJECT_NOTES[String(norad)];

  return (
    <section className="pane info-card" aria-label={`About ${name}`}>
      <div className="pane-head">
        <h2 className="pane-title">{name}</h2>
        <button
          className="icon-btn"
          onClick={() => selection.select(null)}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
      </div>
      <div className="pane-section info-sub">
        <span className="num muted">
          NORAD {norad}
          {entry?.cosparId ? ` · ${entry.cosparId}` : ''}
        </span>
        <span className="badge" style={{ color: ORBIT_CLASS_COLORS[cls] }} title={CLASS_NAMES[cls]}>
          {cls}
        </span>
        {stale && (
          <span
            className="badge badge-warn"
            title={`Orbit data older than ${STALE_AFTER_DAYS} days`}
          >
            Stale
          </span>
        )}
      </div>

      <div className="pane-section scroll info-body">
        <dl className="kv">
          <dt>Owner</dt>
          <dd>{entry ? ownerName(entry.ownerCode) : '–'}</dd>
          {g?.operator && (
            <>
              <dt>Operator</dt>
              <dd>{g.operator}</dd>
            </>
          )}
          {constellation && (
            <>
              <dt>Constellation</dt>
              <dd>{constellation.name}</dd>
            </>
          )}
          {entry?.opsStatus && (
            <>
              <dt>Status</dt>
              <dd>{OPS_STATUS[entry.opsStatus] ?? entry.opsStatus}</dd>
            </>
          )}
          <dt>Launched</dt>
          <dd>
            {entry?.launchDate ? fmtDate(entry.launchDate) : '–'}
            {age !== null && (
              <span className="faint"> ({age === 0 ? 'this year' : `${age} y ago`})</span>
            )}
          </dd>
          {entry?.launchSite && (
            <>
              <dt>From</dt>
              <dd>{site?.name ?? entry.launchSite}</dd>
            </>
          )}
          {g?.manufacturer && (
            <>
              <dt>Maker</dt>
              <dd>{g.manufacturer}</dd>
            </>
          )}
          {g?.bus && (
            <>
              <dt>Bus</dt>
              <dd>{g.bus}</dd>
            </>
          )}
          {g?.massKg != null && (
            <>
              <dt>Mass</dt>
              <dd className="num">
                {g.massEstimated ? '≈ ' : ''}
                {fmtInt(g.massKg)} kg
              </dd>
            </>
          )}
        </dl>
        {note && <p className="small muted info-note">{note}</p>}

        <h3 className="info-h">Orbit</h3>
        <dl className="kv num">
          <dt>Perigee</dt>
          <dd>{fmtInt(perigeeKm)} km</dd>
          <dt>Apogee</dt>
          <dd>{fmtInt(apogeeKm)} km</dd>
          <dt>Inclination</dt>
          <dd>{row[4].toFixed(2)}°</dd>
          <dt>Period</dt>
          <dd>
            {periodMinutes(row[2]) < 600
              ? `${periodMinutes(row[2]).toFixed(1)} min`
              : `${(periodMinutes(row[2]) / 60).toFixed(2)} h`}
          </dd>
        </dl>

        <h3 className="info-h">Now</h3>
        {here && s.ok ? (
          <dl className="kv num">
            <dt>Latitude</dt>
            <dd>{fmtLat(here.latDeg)}</dd>
            <dt>Longitude</dt>
            <dd>{fmtLon(here.lonDeg)}</dd>
            <dt>Altitude</dt>
            <dd>{fmtInt(here.altKm)} km</dd>
            <dt>Speed</dt>
            <dd>{norm(s.v).toFixed(2)} km/s</dd>
          </dl>
        ) : (
          <p className="muted small">No position at this time (SGP4: {s.ok ? '' : s.failure}).</p>
        )}
        <p className="faint small info-note">
          Orbit data {fmtAgeDays(dataAge)} old. Positions are good to about 1 km near the data's
          epoch and drift by a few km per day away from it
          {Math.abs(fromEpoch) > 2 ? ` (the shown time is ${fmtAgeDays(fromEpoch)} away)` : ''}.
        </p>
      </div>

      <div className="pane-section info-actions">
        <button
          className={`btn btn-small ${focused ? 'btn-active' : ''}`}
          aria-pressed={focused}
          onClick={() => selection.setFocused(!focused)}
        >
          {focused ? 'Stop following' : 'Follow'}
        </button>
        <a className="btn btn-small" href={celestrakUrl(norad)} target="_blank" rel="noreferrer">
          CelesTrak
        </a>
        <a
          className="btn btn-small"
          href={wikipediaSearchUrl(name)}
          target="_blank"
          rel="noreferrer"
        >
          Search Wikipedia
        </a>
      </div>
    </section>
  );
}
