// "About the data" (SPEC.md 7.2, 4.4): sources, licences, when the data was refreshed, and
// which objects are hidden.

import type { MetaFile } from '@sat-viewer/shared';
import { useEffect, useRef } from 'react';
import { fmtInt } from './format';

const when = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export function AboutDialog({
  meta,
  onClose,
}: {
  readonly meta: MetaFile;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const s = meta.sources;
  return (
    <dialog ref={ref} className="pane about" onClose={onClose} aria-labelledby="about-title">
      <div className="pane-head">
        <h2 className="pane-title" id="about-title">
          About the data
        </h2>
        <button className="icon-btn" onClick={() => ref.current?.close()} aria-label="Close">
          ×
        </button>
      </div>
      <div className="pane-section scroll about-body">
        <p>
          SatViewer shows every <strong>active satellite</strong> in CelesTrak&apos;s catalog (
          {fmtInt(meta.counts.objects)} objects), computed in your browser with the SGP4 model from
          their published orbital elements. Debris, rocket bodies and dead satellites are not shown
          yet.
        </p>

        <h3 className="info-h">Sources</h3>
        <ul className="about-list">
          <li>
            <strong>Orbits:</strong>{' '}
            <a href="https://celestrak.org" target="_blank" rel="noreferrer">
              CelesTrak
            </a>{' '}
            (Dr T.S. Kelso), general perturbations data, group &quot;active&quot;. Fetched{' '}
            {when(s.gp.fetchedAt)}, {fmtInt(s.gp.records)} records.
          </li>
          <li>
            <strong>Catalog</strong> (owner, launch date and site): CelesTrak SATCAT. Fetched{' '}
            {when(s.satcat.fetchedAt)}.
          </li>
          <li>
            <strong>Satellite details</strong> (operator, maker, bus, mass): Jonathan
            McDowell&apos;s{' '}
            <a href="https://planet4589.org/space/gcat/" target="_blank" rel="noreferrer">
              General Catalog of Artificial Space Objects (GCAT)
            </a>
            , licensed{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
            . Fetched {when(s.gcat.fetchedAt)}; details found for {fmtInt(meta.counts.withGcat)} of{' '}
            {fmtInt(meta.counts.objects)} objects (the newest satellites are often not in it yet).
          </li>
          <li>
            <strong>Earth images:</strong> NASA Blue Marble and Black Marble (public domain).
          </li>
          <li>
            <strong>SGP4:</strong>{' '}
            <a href="https://github.com/shashwatak/satellite-js" target="_blank" rel="noreferrer">
              satellite.js
            </a>{' '}
            (MIT licence).
          </li>
        </ul>

        <h3 className="info-h">Accuracy</h3>
        <p>
          Positions are good to about 1 km near the time of each orbit&apos;s data and drift by a
          few km per day away from it, which is why the time slider stays within 7 days of now.
          Orbit data older than 14 days is marked &quot;stale&quot;. Owner names, constellations and
          launch sites are matched by hand-kept tables and may contain mistakes.
        </p>

        <h3 className="info-h">Hidden objects</h3>
        <p>
          Objects SGP4 cannot compute (for example after re-entry) are hidden rather than drawn in
          the wrong place.
          {meta.skipped.length === 0
            ? ' No object was left out of this data set.'
            : ` Left out of this data set: ${meta.skipped.length}.`}
        </p>
        {meta.skipped.length > 0 && (
          <ul className="about-list small">
            {meta.skipped.map((o) => (
              <li key={o.norad}>
                {o.name} ({o.norad}): {o.reason}
              </li>
            ))}
          </ul>
        )}
        <p className="faint small">Data files generated {when(meta.generatedAt)}.</p>
      </div>
    </dialog>
  );
}
