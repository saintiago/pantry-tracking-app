/**
 * verify-bundle-split.mjs
 *
 * Asserts that the Vite production build has correctly split @ericblade/quagga2
 * into a separate lazy chunk and that no entry chunk contains Quagga2 source.
 *
 * Usage (after `npm run build`):
 *   node scripts/verify-bundle-split.mjs
 *
 * Exit codes:
 *   0 — bundle split verified
 *   1 — verification failed (diagnostic printed to stderr)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, '..', 'build');
const assetsDir = path.join(buildDir, 'assets');

// Quagga2-specific markers that should only appear in the lazy chunk
const QUAGGA_MARKERS = ['@ericblade/quagga2', 'Quagga.onProcessed', 'CameraAccess'];

function fail(message) {
  console.error(`\nFAIL: ${message}\n`);
  process.exit(1);
}

// 1. Read index.html and extract entry chunk filenames from <script> tags
const indexHtmlPath = path.join(buildDir, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  fail(`build/index.html not found. Run 'npm run build' first.`);
}

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Match both module scripts and regular scripts in assets/
const entryChunkNames = new Set();
for (const match of indexHtml.matchAll(/src="[./]*assets\/([^"]+\.js)"/g)) {
  entryChunkNames.add(match[1]);
}

if (entryChunkNames.size === 0) {
  fail('No entry chunk <script> tags found in build/index.html. The build output may be unexpected.');
}

console.log(`Entry chunks found in index.html: ${[...entryChunkNames].join(', ')}`);

// 2. Walk every .js file in build/assets/ and check for Quagga2 markers
if (!fs.existsSync(assetsDir)) {
  fail(`build/assets/ directory not found. Run 'npm run build' first.`);
}

const allJsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));

if (allJsFiles.length === 0) {
  fail('No .js files found in build/assets/. The build output may be unexpected.');
}

let entryChunksWithQuagga = [];
let lazyChunksWithQuagga = [];

for (const filename of allJsFiles) {
  const filePath = path.join(assetsDir, filename);
  const content = fs.readFileSync(filePath, 'utf8');
  const hasQuagga = QUAGGA_MARKERS.some((marker) => content.includes(marker));

  if (!hasQuagga) continue;

  if (entryChunkNames.has(filename)) {
    entryChunksWithQuagga.push(filename);
  } else {
    lazyChunksWithQuagga.push(filename);
  }
}

// 3. Assert: no entry chunk contains Quagga2
if (entryChunksWithQuagga.length > 0) {
  fail(
    `Quagga2 markers found in entry chunk(s): ${entryChunksWithQuagga.join(', ')}\n` +
      `This means BarcodeScanner is still being statically imported. ` +
      `Check for any non-lazy import of BarcodeScanner or @ericblade/quagga2 in frontend/src/.`,
  );
}

// 4. Assert: exactly one lazy chunk contains Quagga2
if (lazyChunksWithQuagga.length === 0) {
  fail(
    `No lazy chunk containing Quagga2 markers was found in build/assets/.\n` +
      `Expected exactly 1 lazy chunk. The dynamic import may not have been emitted correctly.`,
  );
}

if (lazyChunksWithQuagga.length > 1) {
  fail(
    `Expected exactly 1 lazy chunk with Quagga2 markers, but found ${lazyChunksWithQuagga.length}: ` +
      `${lazyChunksWithQuagga.join(', ')}\n` +
      `This may indicate duplicate chunks or an unexpected code-splitting configuration.`,
  );
}

console.log(`Lazy chunk with Quagga2: ${lazyChunksWithQuagga[0]}`);
console.log('\nOK: bundle split verified');
process.exit(0);
