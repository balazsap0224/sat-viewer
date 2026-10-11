// Filters (SPEC.md 7.2): owner, orbit class, launch year range, constellation, and a counter
// "N of M objects". The filtering itself is in state/filters.ts.

import { ORBIT_CLASSES } from '@sat-viewer/core';
import { useMemo, useState } from 'react';
import { CONSTELLATIONS, ownerName } from '../data/content';
import type { SatData } from '../data/load';
import { ORBIT_CLASS_COLORS } from '../scene/SatellitePoints';
import { filtersStore, isFiltering, launchYear, NO_FILTERS, useFilters } from '../state/filters';
import { CLASS_NAMES } from './StatusCorner';
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

export function FiltersPanel({ data, shown }: { readonly data: SatData; readonly shown: number }) {
  const f = useFilters();
  const [open, setOpen] = useState(() => isFiltering(filtersStore.get()));
  const total = data.elements.rows.length;

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
