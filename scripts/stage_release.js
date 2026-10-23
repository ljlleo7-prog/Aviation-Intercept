import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Local artifacts only. This script never uploads or deploys anything.
const root = new URL('../', import.meta.url);
const output = new URL('release-artifacts/', root);
const packs = [];
for (const directory of ['aip-packs', 'scenery-packs']) {
  const source = new URL(`${directory}/`, root);
  const catalog = JSON.parse(await readFile(new URL('catalog.json', source), 'utf8'));
  for (const entry of catalog) {
    if (!/^[a-z0-9][a-z0-9.-]*\.zip$/.test(entry.file)) {
      throw new Error(`Invalid release filename: ${entry.file}`);
    }
    const file = new URL(entry.file, source);
    const bytes = await readFile(file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== entry.bytes || sha256 !== entry.sha256) {
      throw new Error(`Pack differs from catalog: ${directory}/${entry.file}`);
    }
    packs.push({ directory, file, name: entry.file, bytes: bytes.length, sha256 });
  }
}
// Refuse to overwrite an existing review set; feature work may need its artifacts.
await mkdir(output);
await cp(new URL('dist/', root), new URL('app/', output), { recursive: true });
await writeFile(new URL('app/CNAME', output), 'aviation.geeksproductionstudio.com\n');
for (const directory of ['aip-packs', 'scenery-packs']) {
  const target = new URL(`${directory}/`, output);
  await mkdir(target);
  for (const name of ['catalog.json', 'README.md', ...(directory === 'scenery-packs' ? ['coverage.json'] : [])]) {
    await cp(new URL(`${directory}/${name}`, root), new URL(name, target));
  }
  for (const pack of packs.filter(pack => pack.directory === directory)) {
    await cp(pack.file, new URL(pack.name, target));
  }
}
await writeFile(new URL('SHA256SUMS', output), packs.map(pack => `${pack.sha256}  ${pack.directory}/${pack.name}\n`).join(''));
await writeFile(new URL('README.txt', output), 'Local review artifacts for aviation.geeksproductionstudio.com. Nothing has been published.\nDeploy app/ only. Publish optional pack directories separately after reviewing versions, notices and download URLs.\n');
console.log(`Staged app and ${packs.length} verified optional packs in release-artifacts/. Nothing published.`);
