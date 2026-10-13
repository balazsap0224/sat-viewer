# Data notes

How the data job (`packages/data-job`, `pnpm data`) gets and merges its data. What was learned from the first live run on 2026-10-11 is marked _(observed)_.

## Requests

| Source       | URL                                                                    | Refresh (no request before) | Size _(observed)_ |
| ------------ | ---------------------------------------------------------------------- | --------------------------- | ----------------- |
| GP elements  | `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON` | 3 h (job every 6 h)         | 7.0 MB            |
| SATCAT       | `https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=JSON`    | 21 h                        | 5.7 MB            |
| GCAT catalog | `https://planet4589.org/space/gcat/tsv/cat/satcat.tsv`                 | 7 days − 3 h                | 19.3 MB           |
| GCAT 6-digit | `https://planet4589.org/space/gcat/tsv/cat/satcat100k.tsv`             | 7 days − 3 h                | 0.3 MB            |
| GCAT orgs    | `https://planet4589.org/space/gcat/tsv/tables/orgs.tsv`                | 7 days − 3 h                | 0.7 MB            |

- One request per source per run at most, in this order. The first error stops the run; later sources are not asked.
- Each minimum age is the refresh interval minus 3 h, so a scheduled run GitHub starts late never makes the next one skip. Runs started by a code push ask no source that has a cached copy (`DATA_CACHED_ONLY`, SPEC.md 4.3).
- Responses are cached in `.data-cache/` (not committed) with their `ETag` / `Last-Modified`. When the cache is old enough to refresh, the request is conditional, so an unchanged file costs a 304. _(observed)_ planet4589.org sends both headers; CelesTrak sends neither, so for CelesTrak the minimum age is what prevents repeat downloads (CelesTrak answers a repeat of unchanged GP data with 403).
- `User-Agent: SatViewer-data-job/0.1 (static satellite viewer; contact: balazs.apjok@gmail.com)`.
- Only 200 and 304 are accepted. Anything else (301, 403, 404, 500…) throws, with the start of the server's message; no retry.
- In GitHub Actions (module 7) `.data-cache/` must be kept between runs with `actions/cache`. Without it every run downloads everything, which is still within the rules (one request per source per 6 h) but wasteful for GCAT.

## What each source gives _(observed 2026-10-11)_

- **GP, `active`:** 16,701 objects, all `EPHEMERIS_TYPE` 0 (SGP4). Highest catalog number 100981; 761 objects have 6-digit numbers. Epochs from 2026-09-11 to 2026-10-12. 25 have elements older than 14 days (mostly Galileo, GLONASS and BeiDou, whose orbits change slowly and are refitted less often).
- **Future epochs:** two objects had an epoch _after_ the download: Chandra (CXO) 30 h ahead and XMM-Newton 13 h ahead. These are valid predictive fits for very high orbits, so the "no epoch in the future" check of SPEC.md 4.3 allows up to 3 days (`checks.ts`, docs/decisions.md).
- **SATCAT, `active`:** 17,210 records. Every GP object has one; 509 SATCAT records have no GP data (not published: no elements, no position). Object types: 17,206 `PAY` and 4 `R/B`. Status: 16,760 `+`, 412 `P`, 24 `B`, 9 `X`, 5 `S`. `DECAY_DATE` is an empty string, not null, when there is none.
- **GCAT:** 69,999 rows. The first line is the header (`#JCAT	Satcat	…`), the second a comment (`# Updated 2026 Oct  9 1800:46`). Values are space-padded; `-` means none. GCAT does not yet list objects with 6-digit numbers, so those 761 get no GCAT details (shown as "not known yet").
- **Matching GCAT:** by catalog number (15,682), else GCAT's own id `S` + 5 digits (GCAT writes `NNA` in the Satcat column where it disputes the identification but keeps the number in the id; 258 objects), else by international designator. In total 15,940 of 16,701 (95.4 %) have GCAT details.
- **GCAT 6-digit catalog** _(observed 2026-10-13)_: `satcat.tsv` stops at catalog number 69999 (its last objects were launched in July 2026); `satcat100k.tsv` has the objects numbered from 100000 on, same columns (1,028 rows on 2026-10-13). Since module 9 the job reads both, so the 6-digit objects get GCAT details too (16,698 of 16,699 published objects).
- **GCAT rows are phases** _(observed 2026-10-13)_: one row per object, but for objects with several phases the row is not always the last one. Gemini 8 shows "docked" (DK, 1966) and Early Bird "renamed" (N, 2001). The statistics rules (SPEC.md 4.5) are written around that.
- **GCAT orgs:** an org code can have a trailing `?` for an uncertain attribution (`DKJ?`); it is resolved without the `?`. Names use the long `Name` column ("Lockheed Martin Space Systems (Denver), Astronautics Operations").
- **GCAT masses are per piece:** the ISS (25544) shows 20,281 kg, the mass of the Zarya module alone. Worth a note on the info card in module 5.

## Codes

- Owner codes: `content/owners.json`, from https://celestrak.org/satcat/sources.php, plus KWT, SVK and JOR, which appear in the data but not on that page _(observed)_. Flags use ISO 3166 codes; `EU` for European bodies; multinational codes have no flag.
- Launch sites: `content/launch-sites.json`, from https://celestrak.org/satcat/launchsites.php. Coordinates are approximate (to about 0.05°), from public sources; sea and air launch areas get a representative point.
- Codes missing from either table do not stop the job; they are listed in `meta.json` (`unknownCodes`) and in the job's output.

## Output (`packages/web/public/data/`, not committed)

| File            | Raw    | gzip    | brotli  |
| --------------- | ------ | ------- | ------- |
| `elements.json` | 2.0 MB | 0.70 MB | 0.57 MB |
| `catalog.json`  | 5.8 MB | 0.35 MB | 0.18 MB |
| `stats.json`    | 3 KB   |         |         |

Total first load about 1.05 MB gzipped, within the 3 MB target (SPEC.md 10).
