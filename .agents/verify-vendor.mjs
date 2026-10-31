import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

for (const bundle of ['pstack', 'thermos']) {
  const directory = new URL(`./skills/${bundle}/`, import.meta.url);
  const inventory = JSON.parse(await readFile(new URL('upstream.json', directory), 'utf8'));
  const adapted = new Set(inventory.adaptations.map(({ path }) => path));
  let verified = 0;
  for (const entry of inventory.files) {
    if (adapted.has(entry.path)) continue;
    const path = new URL(entry.path, directory);
    const bytes = await readFile(path);
    const hash = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    if (hash !== entry.blob) throw new Error(`Vendor source changed: ${fileURLToPath(path)}`);
    verified += 1;
  }
  console.log(`${bundle}: ${verified} pinned files verified at ${inventory.revision}`);
}
