// Filters (SPEC.md 7.2): chosen satellites ("show only these"), orbit class, owner,
// constellation, launch years, altitude and inclination, and a counter "N of M objects".
// The filtering itself is in state/filters.ts.

import { ORBIT_CLASSES } from '@sat-viewer/core';
import { useEffect, useMemo, useState } from 'react';
import { CONSTELLATIONS, DEBRIS_CLOUDS, ownerName } from '../data/content';
import type { SatData } from '../data/load';
import { ORBIT_CLASS_COLORS } from '../scene/SatellitePoints';
import { filtersStore, isFiltering, launchYear, NO_FILTERS, useFilters } from '../state/filters';
import { search } from '../state/search';
import { CLASS_NAMES } from './StatusCorner';
import { searchIndexFor } from './SearchBox';
import { fmtInt } from './format';

/** Value → count, sorted by count (largest first), then by label. */
function counted<K extends string>(
  keys: readonly (K | null | undefined)[],
  label: (k: K) => string,
) {
  const counts = new Map<K, number>();
  for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts]
    .map(([key, count]) => ({ key, count, label: label(key) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Typed text → a number in [min, max], null when empty, undefined when not valid. */
function parseInRange(t: string, min: number, max: number): number | null | undefined {
  if (t.trim() === '') return null;
  const n = Number(t.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

type RangeKey = 'altMin' | 'altMax' | 'inclMin' | 'inclMax';

/**
 * A number field for one end of a range: empty clears it, a number in [min, max] sets it,
 * anything else stays as typed but is not applied. It follows the store when the filter is
 * changed elsewhere (Clear filters, a link).
 */
function RangeField({
  k,
  min,
  max,
  placeholder,
  label,
}: {
  readonly k: RangeKey;
  readonly min: number;
  readonly max: number;
  readonly placeholder: string;
  readonly label: string;
}) {
  const value = useFilters()[k];
  const parse = (t: string) => parseInRange(t, min, max);
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    // Keep what was typed while it means the same value ("500." is 500); otherwise show the
    // store's value.
    setText((t) => (parseInRange(t, min, max) === value ? t : value === null ? '' : String(value)));
  }, [value, min, max]);
  return (
    <input
      className="field num range-input"
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if (v !== undefined) filtersStore.update({ [k]: v });
      }}
    />
  );
}

/** The "show only these" list: chips for the chosen satellites and a field to add more. */
function ChosenSatellites({ data }: { readonly data: SatData }) {
  const { only } = useFilters();
  const [query, setQuery] = useState('');
  const results = useMemo(
    () => search(searchIndexFor(data), query, 8).filter((r) => !only.includes(r.norad)),
    [data, query, only],
  );
  const nameOf = (norad: number) => {
    const i = data.indexOf.get(norad);
    return (i !== undefined ? data.catalog[i]?.name : undefined) ?? String(norad);
  };
  const add = (norad: number) => {
    filtersStore.addOnly(norad);
    setQuery('');
  };

  return (
    <div className="chosen">
      <span className="faint small">Show only these satellites</span>
      {only.length > 0 && (
        <div className="chips">
          {only.map((n) => (
            <span key={n} className="chosen-chip small">
              {nameOf(n)}
              <button
                className="icon-btn chosen-remove"
                aria-label={`Remove ${nameOf(n)}`}
                title="Remove"
                onClick={() => filtersStore.removeOnly(n)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="search">
        <input
          className="field search-input"
          type="search"
          placeholder="Add a satellite: name or number…"
          aria-label="Add a satellite to show"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) add(results[0].norad);
            else if (e.key === 'Escape') setQuery('');
          }}
        />
        {query.trim() !== '' && (
          <ul className="pane search-results" role="listbox" aria-label="Satellites to add">
            {results.length === 0 && <li className="muted small search-empty">No match</li>}
            {results.map((r) => (
              <li
                key={r.norad}
                role="option"
                aria-selected={false}
                className="search-result"
                onMouseDown={(ev) => {
                  ev.preventDefault(); // keep the focus in the input
                  add(r.norad);
                }}
              >
                <span>{r.name}</span>
                <span className="faint small num">{r.norad}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {only.length > 0 && (
        <p className="small muted chosen-note">
          Only {only.length === 1 ? 'this one is' : `these ${only.length} are`} shown; the filters
          below are paused.{' '}
          <button className="link-btn small" onClick={() => filtersStore.update({ only: [] })}>
            Show all again
          </button>
        </p>
      )}
    </div>
  );
}

export function FiltersPanel({ data, shown }: { readonly data: SatData; readonly shown: number }) {
  const f = useFilters();
  const [open, setOpen] = useState(() => isFiltering(filtersStore.get()));
  const total = data.elements.rows.length;

  // "Show only this" on the info card opens the panel, so the list can be seen and edited.
  const chosen = f.only.length;
  useEffect(() => {
    if (chosen > 0) setOpen(true);
  }, [chosen]);

  const owners = useMemo(
    () =>
      counted(
        data.catalog.map((e) => e?.ownerCode),
        ownerName,
      ),
    [data],
  );
  const groups = useMemo(
    () =>
      counted(
        data.catalog.map((e) => e?.constellation),
        (id) => CONSTELLATIONS.find((c) => c.id === id)?.name ?? id,
      ),
    [data],
  );
  const years = useMemo(() => {
    const ys = data.catalog.map(launchYear).filter((y): y is number => y !== null);
    return { min: Math.min(...ys), max: Math.max(...ys) };
  }, [data]);

  const yearInput = (key: 'yearFrom' | 'yearTo', label: string) => (
    <label className="filter-year">
      <span className="faint small">{label}</span>
      <input
        className="field num"
        type="number"
        min={years.min}
        max={years.max}
        placeholder={String(key === 'yearFrom' ? years.min : years.max)}
        value={f[key] ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          filtersStore.update({ [key]: /^\d{4}$/.test(v) ? Number(v) : null });
        }}
      />
    </label>
  );

  return (
    <section className="pane filters" aria-label="Filters">
      <div className="pane-head">
        <button
          className="btn-ghost filters-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'} Filters
        </button>
        <span className="small num muted" aria-live="polite">
          {shown === total
            ? `${fmtInt(total)} objects`
            : `${fmtInt(shown)} of ${fmtInt(total)} objects`}
        </span>
      </div>
      {open && (
        <div className="pane-section filters-body">
          <ChosenSatellites data={data} />

          <fieldset className="filters-rest" disabled={chosen > 0}>
            {data.meta.counts.debris > 0 && (
              <label
                className="small debris-toggle"
                title={DEBRIS_CLOUDS.map((c) => `${c.name}: ${c.event}`).join('\n\n')}
              >
                <input
                  type="checkbox"
                  checked={f.debris}
                  onChange={(e) => filtersStore.update({ debris: e.target.checked })}
                />{' '}
                Show space debris ({fmtInt(data.meta.counts.debris)} pieces of{' '}
                {DEBRIS_CLOUDS.map((c) => c.name).join(', ')})
              </label>
            )}

            <div className="chips" role="group" aria-label="Orbit class">
              {ORBIT_CLASSES.map((c) => {
                const on = f.classes.includes(c);
                return (
                  <button
                    key={c}
                    className={`btn btn-small chip ${on ? 'btn-active' : ''}`}
                    aria-pressed={on}
                    title={CLASS_NAMES[c]}
                    onClick={() =>
                      filtersStore.update({
                        classes: on ? f.classes.filter((x) => x !== c) : [...f.classes, c],
                      })
                    }
                  >
                    <span className="legend-dot" style={{ background: ORBIT_CLASS_COLORS[c] }} />
                    {c}
                  </button>
                );
              })}
            </div>

            <label className="filter-row">
              <span className="faint small">Owner</span>
              <select
                className="field"
                value={f.owner ?? ''}
                onChange={(e) => filtersStore.update({ owner: e.target.value || null })}
              >
                <option value="">Any owner</option>
                {owners.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label} ({fmtInt(o.count)})
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-row">
              <span className="faint small">Constellation</span>
              <select
                className="field"
                value={f.constellation ?? ''}
                onChange={(e) => filtersStore.update({ constellation: e.target.value || null })}
              >
                <option value="">Any</option>
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label} ({fmtInt(g.count)})
                  </option>
                ))}
              </select>
            </label>

            <div className="filter-row">
              <span className="faint small">Launched</span>
              <div className="filter-years">
                {yearInput('yearFrom', 'from')}
                {yearInput('yearTo', 'to')}
              </div>
            </div>

            <div
              className="filter-row"
              title="Height above the Earth's surface. The whole orbit, from its lowest point (perigee) to its highest (apogee), must lie in the range. ISS ≈ 420 km, GPS ≈ 20,200 km, GEO ≈ 35,786 km."
            >
              <span className="faint small">Altitude, km</span>
              <div className="filter-range">
                <RangeField
                  k="altMin"
                  min={0}
                  max={1_000_000}
                  placeholder="0"
                  label="Lowest altitude in km"
                />
                <span className="faint small">to</span>
                <RangeField
                  k="altMax"
                  min={0}
                  max={1_000_000}
                  placeholder="any"
                  label="Highest altitude in km"
                />
              </div>
            </div>

            <div
              className="filter-row"
              title="Tilt of the orbit against the equator: 0° along the equator, 90° over the poles, above 90° moving westward. ISS 51.6°, sun-synchronous orbits ≈ 97–99°."
            >
              <span className="faint small">Inclination, °</span>
              <div className="filter-range">
                <RangeField
                  k="inclMin"
                  min={0}
                  max={180}
                  placeholder="0"
                  label="Lowest inclination in degrees"
                />
                <span className="faint small">to</span>
                <RangeField
                  k="inclMax"
                  min={0}
                  max={180}
                  placeholder="180"
                  label="Highest inclination in degrees"
                />
              </div>
            </div>
          </fieldset>

          <button
            className="btn btn-small"
            disabled={!isFiltering(f)}
            onClick={() => filtersStore.set(NO_FILTERS)}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
