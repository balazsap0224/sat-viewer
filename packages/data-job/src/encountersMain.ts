// `pnpm encounters`: recomputes encounters.json from the published elements.json, without
// fetching anything (for trying the screening, or after changing its settings).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogFileSchema, elementsFileSchema } from '@sat-viewer/shared';
import { computeEncounters } from './encounters';
import { writeAtomic } from './politeFetch';

const outDir = fileURLToPath(new URL('../../web/public/data/', import.meta.url));

try {
  const elements = elementsFileSchema.parse(
    JSON.parse(await readFile(join(outDir, 'elements.json'), 'utf8')),
  );
  const catalog = catalogFileSchema.parse(
    JSON.parse(await readFile(join(outDir, 'catalog.json'), 'utf8')),
  );
  const debris = new Set(catalog.entries.filter((e) => e.debrisCloud !== null).map((e) => e.norad));
  const file = computeEncounters(elements, debris);
  await writeAtomic(join(outDir, 'encounters.json'), JSON.stringify(file));
  console.log(`wrote encounters.json (${file.rows.length} approaches)`);
} catch (e) {
  console.error(`encounters stopped: ${(e as Error).message}`);
  process.exitCode = 1;
}
