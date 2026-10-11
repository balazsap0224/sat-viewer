// The tooltip next to the pointer when it is over a satellite: name and owner (SPEC.md 7.1).

import { ownerName } from '../data/content';
import type { SatData } from '../data/load';
import { useHover } from '../state/selection';

export function HoverTip({ data }: { readonly data: SatData }) {
  const hover = useHover();
  if (!hover) return null;
  const i = data.indexOf.get(hover.norad);
  const e = i === undefined ? undefined : data.catalog[i];
  return (
    <div className="pane hover-tip" style={{ left: hover.x + 14, top: hover.y + 14 }} aria-hidden>
      <div>{e?.name ?? hover.norad}</div>
      {e && <div className="faint small">{ownerName(e.ownerCode)}</div>}
    </div>
  );
}
