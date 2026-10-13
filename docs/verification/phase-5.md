# Phase 5: values for the owner to verify

## Module 9: statistics data (`packages/data-job/src/stats.ts`)

**Status: PENDING OWNER VERIFICATION.** The tests pass, but a passing test only shows the code
agrees with the number written in the test. Please check each value by hand or against the
cited source, and tick it. Test ids such as `[9.1]` appear in the test names
(`packages/data-job/test/dataJob.test.ts`).

### Built

- The data job writes `packages/web/public/data/stats.json` (3 KB): one value per year from
  1957 to now for orbital launches, payloads launched by country group, and objects in Earth
  orbit at the end of the year (payloads, rocket stages, debris and parts). Rules: SPEC.md 4.5.
- New weekly download: GCAT's `satcat100k.tsv` (0.3 MB). GCAT's main file stops at catalog
  number 69999 (July 2026); this one has the newer objects. As a bonus the 6-digit objects now
  get GCAT details on the info card (operator, maker, mass): 16,698 of 16,699 objects instead of
  15,938.
- Country groups: `content/stat-groups.json` (United States, USSR / Russia, China, Europe,
  Japan, India, Others) **[PROPOSED]**.
- A sanity check: the number of GCAT rows may not change by more than 10 % between runs.

### Reference values from history (test fixture: every object GCAT lists as launched in 1957 or 1958)

The fixture `gcat-1957-1958.tsv` holds the 15 real GCAT rows (GCAT of 9 October 2026):

| Catalog | Kind         | Name                     | Launched    | Came down (GCAT) |
| ------- | ------------ | ------------------------ | ----------- | ---------------- |
| 1       | rocket stage | Sputnik 1's core stage   | 1957 Oct 4  | 1957 Dec 1       |
| 2       | payload      | Sputnik 1 ("1-y ISZ")    | 1957 Oct 4  | 1958 Jan 4       |
| 3       | payload      | Sputnik 2 ("2-y ISZ")    | 1957 Nov 3  | 1958 Apr 14      |
| 4       | payload      | Explorer 1               | 1958 Feb 1  | 1970 Mar 31      |
| 5       | payload      | Vanguard 1               | 1958 Mar 17 | still in orbit   |
| 6       | payload      | Explorer 3               | 1958 Mar 26 | 1958 Jun 28      |
| 7       | rocket stage | Sputnik 3's core stage   | 1958 May 15 | 1958 Dec 3       |
| 8       | payload      | Sputnik 3                | 1958 May 15 | 1960 Apr 6       |
| 9       | payload      | Explorer 4               | 1958 Jul 26 | 1959 Oct 23      |
| 10      | payload      | SCORE                    | 1958 Dec 18 | 1959 Jan 21      |
| 16      | rocket stage | Vanguard 1's third stage | 1958 Mar 17 | still in orbit   |
| 110     | payload      | Pioneer 1                | 1958 Oct 11 | 1958 Oct 13      |
| 111     | payload      | Pioneer 3                | 1958 Dec 6  | 1958 Dec 7       |
| 1576    | part         | Vanguard 1 clamp         | 1958 Mar 17 | still in orbit   |
| 69999   | part         | Vanguard 1 part          | 1958 Mar 17 | still in orbit   |

| Id  | Value                                                                                                                                                                                                               | Working                                                                                                                                                                                                                                                                                                                                                                                         | Source to compare                                                         | ✓   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --- |
| 9.1 | 1957: 2 orbital launches; payloads USSR 2, US 0; in orbit at the end of 1957: 2 payloads, 0 stages, 0 debris                                                                                                        | Launch tags 1957 ALP (Sputnik 1) and 1957 BET (Sputnik 2). Sputnik 1's core stage came down on 1 December, so only the two satellites were up on 31 December. (Sputnik 2 stayed attached to its own core stage; GCAT lists that stage in its auxiliary catalog, which we do not download.)                                                                                                      | Wikipedia "Sputnik 1", "Sputnik 2", "1957 in spaceflight"                 |     |
| 9.2 | 1958: 8 orbital launches; payloads US 7, USSR 1; in orbit at the end of 1958: 5 payloads, 1 stage, 2 parts                                                                                                          | Tags ALP to THE (8): Explorer 1, Vanguard 1, Explorer 3, Sputnik 3, Explorer 4, SCORE, Pioneer 1, Pioneer 3. GCAT counts Pioneer 1 and 3 as orbital launches: they got launch designations, flew more than 100,000 km out on long arcs and fell back. Still up on 31 December 1958: Explorer 1, Vanguard 1, Sputnik 3, Explorer 4, SCORE (payloads); Vanguard's third stage; two Vanguard parts | Wikipedia "1958 in spaceflight" (it may list Pioneer 1 and 3 as failures) |     |
| 9.3 | Now: of the 1957–58 objects, 1 payload (Vanguard 1), 1 stage and 2 parts are still in orbit                                                                                                                         | Vanguard 1 is the oldest satellite still in orbit                                                                                                                                                                                                                                                                                                                                               | Wikipedia "Vanguard 1"                                                    |     |
| 9.4 | GCAT statuses that end an object's count: reentered (R), reentered attached (AR), docked (DK), grappled (GRP), left for deep space (DSO). Not: renamed (N), broke up (E), released (REL), lost but probably up (OX) | Examples in the test: Gemini 8 docked with its Agena in 1966; Zarya was grappled by the Shuttle in 1998; Artemis II left for the Moon in 2026; Early Bird was renamed in 2001 but is still in orbit                                                                                                                                                                                             | GCAT "Phases and Status values" page                                      |     |
| 9.5 | Hong Kong counts for China, the Balearic Islands for Europe, Turkey and "no country" for Others; spurious entries (type Z) not at all                                                                               | GCAT's organisation table gives HK → CN, ESIB → E                                                                                                                                                                                                                                                                                                                                               | GCAT orgs table                                                           |     |

### Values from the real data (GCAT of 9 October 2026, 6-digit file of 13 October; not in the tests)

| Id   | Value                                                                                                                                                                                                                                                                       | Compare with                                                                                                                                                                                | ✓   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 9.6  | **6,970** orbital launches from 1957 to now                                                                                                                                                                                                                                 | GCAT's own "Launch Count Totals" (planet4589.org/space/gcat/web/launch/count.html): 6,971 orbital launches on 13 October 2026. One fewer here, probably a launch newer than our files       |     |
| 9.7  | Launches per year: 2022: 179, 2023: 212, 2024: 254, 2025: 315, 2026 so far: 232                                                                                                                                                                                             | Wikipedia "2024 in spaceflight" etc. (orbital launch totals: count the successes and partial failures, which reached orbit) or Jonathan McDowell's yearly summaries                         |     |
| 9.8  | Payloads launched in 2025: US 3,710, USSR / Russia 88, China 371, Europe 162, Japan 35, India 12, Others 135; 4,513 in all                                                                                                                                                  | The US number is mostly Starlink                                                                                                                                                            |     |
| 9.9  | In Earth orbit now: 20,120 payloads (working or dead), 2,083 rocket stages, 12,682 debris and parts; 34,885 in all                                                                                                                                                          | CelesTrak SATCAT Boxscore (celestrak.org/satcat/boxscore.php), totals "in orbit". Expect within about 10 %: GCAT keeps lost objects (OX) and objects the US catalog has not numbered        |     |
| 9.10 | Objects in orbit over time: about 10,600 in 2000; steps in 2007 (11,453 → 15,327: the Chinese anti-satellite test on Fengyun-1C), 2009 (15,584 → 18,013: the Iridium 33–Kosmos 2251 collision) and 2021 (22,107 → 25,632, with the Russian test on Kosmos 1408 in November) | NASA Orbital Debris Program Office chart "Monthly number of objects in Earth orbit by object type" (Orbital Debris Quarterly News): the same steps; our totals run somewhat higher, see 9.9 |     |

Found while building, and fixed before these values: the first version counted debris from its
parent's launch, so the 2021 Kosmos 1408 fragments counted from 1982 and 2000 showed 20,921
objects in orbit. Debris and parts now count from their separation date. Counting launch tags by
each object's launch year counted 14 launches twice (7,001 instead of 6,970); they now count in
their own year.

### Known limits

- The ISS itself is not among the objects counted: GCAT lists the assembled station in its
  auxiliary catalog. Its first module, Zarya, stops counting in 1998, when it was grappled.
- Objects that docked or were attached to another (every Soyuz and Progress, for example) stop
  counting at that moment, as part of the station. Their later return is in GCAT's event
  catalog, which we do not download. It changes the totals by a few dozen at most.
- The running year's in-orbit value is "now", not the end of the year.
