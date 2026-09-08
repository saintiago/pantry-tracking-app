import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
const require = createRequire(import.meta.url);
/** Ship the fallback runtime ourselves; recipe photos never go to a third-party OCR CDN. */
export function ocrAssets(): Plugin {
  const files = new Map<string, string>();
  const prefix = 'ocr/v6.0.1/';
  files.set(prefix + 'worker.min.js', require.resolve('tesseract.js/dist/worker.min.js'));
  const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
  for (const file of fs.readdirSync(core))
    if (/\.wasm(?:\.js)?$/.test(file)) files.set(prefix + file, path.join(core, file));
  for (const language of ['eng', 'spa', 'ita'])
    files.set(
      prefix + language + '.traineddata.gz',
      require.resolve(`@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`),
    );
  return {
    name: 'self-hosted-recipe-ocr',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const key = (request.url ?? '').split('?')[0].replace(/^\//, '');
        const file = files.get(key);
        if (!file) {
          next();
          return;
        }
        response.setHeader(
          'Content-Type',
          key.endsWith('.js')
            ? 'application/javascript'
            : key.endsWith('.wasm')
              ? 'application/wasm'
              : 'application/octet-stream',
        );
        fs.createReadStream(file).pipe(response);
      });
    },
    generateBundle() {
      for (const [fileName, file] of files)
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(file) });
    },
  };
}
