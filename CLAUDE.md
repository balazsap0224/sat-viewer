# CLAUDE.md

Read `SPEC.md` before any task. Its working agreements (the game's SPEC section 16, adapted in SPEC.md section 14) apply in full; the key points:

1. Work one module at a time, in order (SPEC.md section 8). Do not build ahead. Module status lives in `docs/roadmap.md`; update its status column as modules finish.
2. **Reference values:** the owner hand-verifies every orbit-math reference value, **once per module**. Present each value with its formula, source and working, and do not treat it as verified until the owner confirms. Tests awaiting sign-off are marked `PENDING OWNER VERIFICATION`; the values to check are collected in `docs/verification/`.
3. `packages/core` stays free of I/O, DOM, Node, network and framework imports (enforced by ESLint).
4. Units: km, s, rad, km/s internally; degrees only at the UI boundary. Times are Unix milliseconds (UTC). SGP4 uses WGS-72 inside satellite.js; everything after it uses WGS-84. Never change units, frames or constants without updating `docs/orbit-notes.md` and `SPEC.md`.
5. Content (owner codes, constellations, launch sites) lives in `content/` as zod-validated JSON, never hard-coded.
6. Do not add dependencies without stating why. Log decisions in `docs/decisions.md`.
7. **[OPEN]** items in SPEC.md: stop and ask the owner. **[PROPOSED]** items: implement, keep easy to change.
8. **Never hammer the data sources** (SPEC.md 4.3): at most one request per source per run, cache, stop on any HTTP error, never retry in a loop. Live network calls are never part of tests.
9. Wrong positions are bugs, not quirks. Objects SGP4 cannot propagate are hidden, never drawn at a wrong place.
10. The owner is learning orbital mechanics: prefer clear, conventional code and explain non-obvious math.

## Commands

- `pnpm test`: all tests (Vitest)
- `pnpm typecheck`: `tsc --noEmit` in every package
- `pnpm lint`: ESLint
- `pnpm web`: the site (Vite dev server)
- `pnpm data`: the data job: fetches CelesTrak and GCAT (politely, with a cache in `.data-cache/`) and writes `packages/web/public/data/`

TypeScript is pinned to 6.0, the same as the game, because typescript-eslint does not yet support 7.x.
