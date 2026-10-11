// `pnpm data`: one run of the data job. Exits with code 1 on any error, so a scheduled
// workflow run fails visibly and the owner gets an email (SPEC.md 4.3).

import { fileURLToPath } from 'node:url';
import { build } from './build';

const root = fileURLToPath(new URL('../../../', import.meta.url));

try {
  await build(
    {
      cacheDir: `${root}.data-cache`,
      contentDir: `${root}content`,
      outDir: `${root}packages/web/public/data`,
    },
    new Date(),
    (url, init) => fetch(url, init),
  );
} catch (e) {
  console.error(`data job stopped: ${(e as Error).message}`);
  console.error('The previous data files were left unchanged.');
  process.exitCode = 1;
}
