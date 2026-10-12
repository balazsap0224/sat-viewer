// The phone layout (module 8, SPEC.md section 8): the globe gets the whole screen. On top, a
// slim bar with the name, search and About. At the bottom, a compact time bar and a row of
// tabs; a tab, or a selected satellite's info card, opens in a sheet above them that covers
// at most about half the screen. Held sideways, the bar, tabs and sheet move into a column on
// the left instead (layout.css). The panels are the desktop's own, in their `sheet` form.
// What the panels cover is passed to the scene, which slides the globe into the free area
// (scene/viewInsets.ts).

import type { OrbitClass, SatRec } from '@sat-viewer/core';
import type { CatalogEntry, ElementRow } from '@sat-viewer/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SatData } from '../data/load';
import { setViewInsets } from '../scene/viewInsets';
import { useSelection } from '../state/selection';
import { FiltersPanel } from './FiltersPanel';
import { InfoCard } from './InfoCard';
import { MeetingsPanel } from './MeetingsPanel';
import { PassesPanel } from './PassesPanel';
import { SearchBox } from './SearchBox';
import { StatusCorner } from './StatusCorner';
import { TimeBar } from './TimeBar';
import { useSideways } from './usePhone';
import { WatchlistPanel } from './WatchlistPanel';

type Tab = 'info' | 'watch' | 'passes' | 'meetings' | 'filters';

/** The selected satellite (App.tsx useSelected). */
export interface PhoneSelection {
  readonly row: ElementRow;
  readonly entry: CatalogEntry | undefined;
  readonly cls: OrbitClass;
  readonly satrec: SatRec;
}

/** What both layouts get from App.tsx. */
export interface LayoutProps {
  readonly data: SatData | undefined;
  readonly sel: PhoneSelection | undefined;
  readonly mask: Uint8Array | undefined;
  readonly shown: number;
  readonly onAbout: () => void;
}

export function PhoneLayout({ data, sel, mask, shown, onAbout }: LayoutProps) {
  const { selected, focused } = useSelection();
  const [tab, setTab] = useState<Tab | null>(null);
  const [folded, setFolded] = useState(false);
  const sideways = useSideways();
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  // Tell the scene which screen edges the panels cover, whenever their size changes.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const top = topRef.current;
    const dock = dockRef.current;
    if (!root || !top || !dock) return;
    const update = () => {
      const r = root.getBoundingClientRect();
      if (sideways) {
        setViewInsets({ top: 0, bottom: 0, left: dock.getBoundingClientRect().right, right: 0 });
      } else {
        const bottom = r.bottom - dock.getBoundingClientRect().top;
        setViewInsets({ top: top.getBoundingClientRect().bottom, bottom, left: 0, right: 0 });
      }
    };
    const observer = new ResizeObserver(update);
    for (const el of [root, top, dock]) observer.observe(el);
    update();
    return () => {
      observer.disconnect();
      setViewInsets({ top: 0, bottom: 0, left: 0, right: 0 });
    };
  }, [sideways]);

  // A newly selected satellite opens its info card; closing the card closes its sheet.
  useEffect(() => {
    if (selected !== null) {
      setTab('info');
      setFolded(false);
    } else {
      setTab((t) => (t === 'info' ? null : t));
    }
  }, [selected]);

  // Following a satellite folds the sheet down, so the satellite stays in view.
  useEffect(() => {
    if (focused) setFolded(true);
  }, [focused]);

  const tabs: { id: Tab; label: string }[] = [
    ...(sel ? [{ id: 'info' as const, label: 'Info' }] : []),
    { id: 'watch', label: 'Watchlist' },
    { id: 'passes', label: sel ? 'Passes' : 'Visible' },
    { id: 'meetings', label: 'Meetings' },
    { id: 'filters', label: 'Filters' },
  ];

  // The same tab again: unfold a folded sheet, otherwise close it.
  const press = (id: Tab) => {
    if (id === tab && !folded) setTab(null);
    else {
      setTab(id);
      setFolded(false);
    }
  };

  const content = (() => {
    if (!data || !tab) return null;
    switch (tab) {
      case 'info':
        return sel ? (
          <InfoCard
            key={sel.row[0]}
            row={sel.row}
            entry={sel.entry}
            cls={sel.cls}
            satrec={sel.satrec}
            folded={folded}
          />
        ) : null;
      case 'watch':
        return <WatchlistPanel data={data} sheet />;
      case 'passes':
        return (
          <PassesPanel
            key={sel?.row[0] ?? 'none'}
            data={data}
            satrec={sel?.satrec}
            name={sel?.entry?.name}
          />
        );
      case 'meetings':
        return mask ? <MeetingsPanel data={data} mask={mask} sheet /> : null;
      case 'filters':
        return (
          <>
            <FiltersPanel data={data} shown={shown} sheet />
            <StatusCorner meta={data.meta} />
          </>
        );
    }
  })();

  return (
    <div className="phone" ref={rootRef}>
      <header className="pane phone-top" ref={topRef}>
        <strong className="phone-name">SatViewer</strong>
        {data && <SearchBox data={data} />}
        <button className="icon-btn phone-about" onClick={onAbout} aria-label="About SatViewer">
          ⓘ
        </button>
      </header>

      <div className="phone-dock" ref={dockRef}>
        {content && (
          <div className={`phone-sheet ${folded ? 'folded' : ''}`}>
            <button
              className="btn-ghost small phone-fold"
              onClick={() => setFolded(!folded)}
              aria-expanded={!folded}
            >
              {folded ? '▴ Show' : '▾ Hide'}
            </button>
            {content}
          </div>
        )}
        <TimeBar compact />
        <nav className="phone-tabs" aria-label="Panels">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`btn phone-tab ${t.id === tab ? 'btn-active' : ''}`}
              aria-pressed={t.id === tab}
              onClick={() => press(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="phone-credits">
          CelesTrak · GCAT (J. McDowell) · NASA Blue/Black Marble · satellite.js
        </div>
      </div>
    </div>
  );
}
