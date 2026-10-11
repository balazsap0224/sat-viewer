# Roadmap

How each phase in `SPEC.md` section 8 is split into modules, and their status.

Status: ✅ done and verified · 🔎 built, waiting for owner verification · 🔨 in progress · ⬜ not started

## Phase 1: Data and orbits core

| #   | Module                    | What it does                                                                         | What the owner checks                                                     | Status |
| --- | ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------ |
| 1   | Repo and globe            | New repo, copied globe and physics pieces, globe at the real current time            | Visual: day/night correct for now                                         | ✅     |
| 2   | Data job                  | Fetch CelesTrak GP + SATCAT + GCAT, validate, merge, owner table, polite caching     | Counts, a few records (ISS, a GPS satellite, a Starlink) look right       | ✅     |
| 3   | SGP4 and frames           | `satellite.js` wrapper, TEME → ECEF → WGS-84 geodetic, derived values, orbit classes | Reference values (SPEC.md 6.5); IGSO cases in 3.13 still pending          | 🔎     |
| 4   | All satellites on a globe | Worker propagation, instanced points, time bar                                       | **Milestone:** all active satellites move; the ISS matches a tracker; fps | ✅     |

## Phase 2: Exploring

| #   | Module                     | Status |
| --- | -------------------------- | ------ |
| 5   | Search, filters, info card | ⬜     |
| 6   | Passes                     | ⬜     |

## Phase 3: Publish

| #   | Module               | Status |
| --- | -------------------- | ------ |
| 7   | Schedule and hosting | ⬜     |
