// Search box (SPEC.md 7.2): name, NORAD number or COSPAR designator, results as you type.
// Arrow keys move through the results, Enter selects, Escape clears.

import { useMemo, useState } from 'react';
import { ownerName } from '../data/content';
import type { SatData } from '../data/load';
import { buildSearchIndex, search } from '../state/search';
import { selection } from '../state/selection';

export function SearchBox({ data }: { readonly data: SatData }) {
  const index = useMemo(
    () =>
      buildSearchIndex(
        data.elements.rows.map((r) => r[0]),
        data.catalog,
      ),
    [data],
  );
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(index, query, 8), [index, query]);

  const choose = (norad: number | undefined) => {
    if (norad === undefined) return;
    selection.select(norad);
    setQuery('');
    setActive(0);
  };

  return (
    <div className="search" role="search">
      <input
        className="field search-input"
        type="search"
        placeholder="Search: ISS, 25544, 1998-067A…"
        aria-label="Search satellites by name, NORAD number or international designator"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            choose(results[active]?.norad);
          } else if (e.key === 'Escape') {
            setQuery('');
          }
        }}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="search-results"
        aria-activedescendant={results.length > 0 ? `search-result-${active}` : undefined}
      />
      {query.trim() !== '' && (
        <ul className="pane search-results" id="search-results" role="listbox">
          {results.length === 0 && <li className="muted small search-empty">No match</li>}
          {results.map((r, i) => {
            const e = data.catalog[r.index];
            return (
              <li
                key={r.norad}
                id={`search-result-${i}`}
                role="option"
                aria-selected={i === active}
                className={`search-result ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(ev) => {
                  ev.preventDefault(); // keep the focus in the input
                  choose(r.norad);
                }}
              >
                <span>{r.name}</span>
                <span className="faint small num">
                  {r.norad} · {e ? ownerName(e.ownerCode) : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
