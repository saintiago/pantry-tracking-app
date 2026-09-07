import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'build/assets');
const files = fs.readdirSync(assets);
const html = fs.readFileSync(path.join(root, 'build/index.html'), 'utf8');
const scripts = files
  .filter((file) => file.endsWith('.js'))
  .map((file) => fs.readFileSync(path.join(assets, file), 'utf8'));
const catalogs = path.join(root, 'src/i18n/locales');
for (const source of fs.readdirSync(catalogs).filter((file) => file.endsWith('.json'))) {
  const language = path.basename(source, '.json');
  const emitted = files.filter((file) => file.startsWith(`${language}-`) && file.endsWith('.json'));
  assert.equal(emitted.length, 1, `Expected one separate ${language} catalog asset`);
  const original = fs.readFileSync(path.join(catalogs, source), 'utf8');
  assert.equal(fs.readFileSync(path.join(assets, emitted[0]), 'utf8'), original);
  assert.ok(!html.includes(emitted[0]), `${language} must not be preloaded by the entry HTML`);
  const entries = Object.entries(JSON.parse(original).messages);
  const marker = entries.find(([key, value]) => key !== value && value.length > 20)?.[1];
  assert.ok(marker, `Expected a distinctive translated message in ${language}`);
  assert.ok(
    scripts.every(
      (script) => !script.includes(marker) && !script.includes(JSON.stringify(marker).slice(1, -1)),
    ),
    `${language} translations must not be embedded in JavaScript`,
  );
  console.log(`On-demand ${language}: ${emitted[0]} (${Buffer.byteLength(original)} bytes)`);
}
console.log(
  'Language catalogs are separate assets, without entry preloads or embedded dictionaries.',
);
