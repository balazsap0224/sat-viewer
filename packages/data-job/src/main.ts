// `pnpm data`: one run of the data job. Exits with code 1 on any error, so a scheduled
// workflow run fails visibly and the owner gets an email (SPEC.md 4.3).
//
// DATA_CACHED_ONLY=true (set by the workflow for runs started by a code push): rebuild from the
// cached downloads, however old, and ask a source only if it has no cached copy at all. Fresh
// orbits come from the 6-hour schedule; a push in between must not shift that beat.

import { fileURLToPath } from 'node:url';
import { build } from './build';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const cachedOnly = process.env.DATA_CACHED_ONLY === 'true';
if (cachedOnly) console.log('DATA_CACHED_ONLY: using cached downloads, however old');

try {
  await build(
    {
      cacheDir: `${root}.data-cache`,
      contentDir: `${root}content`,
      outDir: `${root}packages/web/public/data`,
    },
    new Date(),
    (url, init) => fetch(url, init),
    console.log,
    { cachedOnly },
  );
} catch (e) {
  console.error(`data job stopped: ${(e as Error).message}`);
  console.error('The previous data files were left unchanged.');
  process.exitCode = 1;
}
