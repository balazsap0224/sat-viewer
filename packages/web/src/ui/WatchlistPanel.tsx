// The watchlist (state/watchlist.ts): the visitor's own satellites, one click away. Opens and
// closes like the filters. "Show only these" puts the list into the filters' chosen list, which
// also turns the passes panel into a timetable of their passes over the visitor.

import { useState } from 'react';
import type { SatData } from '../data/load';
import { filtersStore, useFilters } from '../state/filters';
import { selection } from '../state/selection';
import { useWatchlist, watchlist } from '../state/watchlist';

export function WatchlistPanel({ data }: { readonly data: SatData }) {
  const list = useWatchlist();
  const { only } = useFilters();
  const [open, setOpen] = useState(false);
  const nameOf = (norad: number) => {
    const i = data.indexOf.get(norad);
    return (i !== undefined ? data.catalog[i]?.name : undefined) ?? `${norad} (not in the data)`;
  };
  const known = list.filter((n) => data.indexOf.has(n));
  const showingList =
    known.length > 0 && only.length === known.length && known.every((n) => only.includes(n));

  return (
    <section className="pane watchlist" aria-label="Watchlist">
      <div className="pane-head">
        <button
          className="btn-ghost filters-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'} Watchlist
        </button>
        <span className="small num muted">{list.length}</span>
      </div>
      {open && (
        <div className="pane-section">
          {list.length === 0 ? (
            <p className="small muted watch-empty">
              Empty. Open a satellite and press ☆ Watch to add it. The list is kept in this browser
              only.
            </p>
          ) : (
            <>
              <ul className="watch-list watch-body">
                {list.map((n) => (
                  <li key={n} className="watch-row">
                    <button
                      className="btn-ghost small watch-name"
                      title="Select it"
                      disabled={!data.indexOf.has(n)}
                      onClick={() => selection.select(n)}
                    >
                      {nameOf(n)}
                    </button>
                    <button
                      className="icon-btn chosen-remove"
                      aria-label={`Remove ${nameOf(n)} from the watchlist`}
                      title="Remove"
                      onClick={() => watchlist.remove(n)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="watch-actions">
                {showingList ? (
                  <button
                    className="btn btn-small btn-active"
                    onClick={() => filtersStore.update({ only: [] })}
                  >
                    Show all
                  </button>
                ) : (
                  <button
                    className="btn btn-small"
                    title="Hide every other satellite; the passes panel lists their passes"
                    disabled={known.length === 0}
                    onClick={() => filtersStore.update({ only: known })}
                  >
                    Show only these
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
