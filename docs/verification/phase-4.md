# Phase 4: what the owner checks

## Module 8: phone layout

No orbit-math reference values in this module. The owner checks the site on their own phone.

### Built

- `ui/usePhone.ts`: phone layout below 700 px wide or 500 px tall; "sideways" when also wider
  than tall. Desktop is unchanged above that.
- `ui/PhoneLayout.tsx`: the globe fills the screen. Top: name, search, ⓘ (About). Bottom: a
  compact time bar (one speed button that steps 1× → 10× → 100× → 1,000×), the tabs **Info**
  (when a satellite is selected) · **Watchlist** · **Visible**/**Passes** · **Meetings** ·
  **Filters** (with the colour legend), and a one-line credit. A tab opens a sheet over at most
  45 % of the screen; tapping the same tab closes it; "▾ Hide" folds it.
- Selecting a satellite opens its info card; **Follow** (or tapping a pass) folds the card to one
  line, name · altitude · speed, so the satellite stays in view.
- Sideways: bar, tabs and sheet in a column on the left, the time bar bottom right.
- `scene/viewInsets.ts`, `scene/ViewShift.tsx`: the picture slides so the globe (or the followed
  satellite) is centred in the part of the screen the panels leave free, easing over a few frames.
- Touch: satellites can be tapped from 22 px away (8 px with a mouse); no hover tooltips;
  buttons at least 36 px tall; text fields 16 px, so phones do not zoom in when one is tapped.
- `e2e/phone.spec.ts`: upright (390 × 844) search → info card → Follow folds it → Filters with
  the legend → close; About from ⓘ; sideways (844 × 390) time bar and tabs fully on screen.
  7 of 7 end-to-end tests pass in Edge (2026-10-12).

Found by the tests and fixed: the legend was hidden on phones by an older rule for narrow
desktop windows.

Found by the owner on an iPhone 15 (Safari) and fixed: the selected satellite's name label was
drawn over the info card (desktop too). Labels now sit beneath the panels (`zIndexRange` 1, the
panels are 2). The owner's first phone test showed the old layout: it was opened at the
per-deploy address `bb6fc5f5.satviewer-8hx.pages.dev`, which always shows the first deploy;
the site is `satviewer-8hx.pages.dev` (docs/hosting.md).

### Owner checks on a real phone

All confirmed by the owner on 2026-10-13 ("phone verified").

| Check                                                                                       | ✓              |
| ------------------------------------------------------------------------------------------- | -------------- |
| Upright: the globe is visible and can be turned and pinch-zoomed; nothing overlaps          | ✓ (2026-10-13) |
| Search "iss", choose it: the info card opens; Follow folds it and the ISS stays in view     | ✓ (2026-10-13) |
| Each tab opens its sheet, the globe stays visible above it; the same tab closes it          | ✓ (2026-10-13) |
| Tapping a satellite on the globe selects it without many misses                             | ✓ (2026-10-13) |
| Sideways: panels on the left, time bar bottom right, nothing cut off                        | ✓ (2026-10-13) |
| Visible / Passes with "Use my location" works on the phone (needs the browser's permission) | ✓ (2026-10-13) |
| The address and tool bars of the phone's browser do not hide the tabs or the time bar       | ✓ (2026-10-13) |
