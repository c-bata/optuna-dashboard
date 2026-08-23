import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const wasmAsset = 'rustuna_bg.wasm';

// The Rustuna WebAssembly glue asks for this file with `new URL()`, which Vite
// recognizes as an asset reference. The extension hands the Webview this exact
// file name, so a binding change that stopped emitting it would only show up at
// runtime. Fail the build instead.
const assertWasmEmitted = () => ({
  name: 'assert-rustuna-wasm-emitted',
  writeBundle(options) {
    const wasmPath = path.join(options.dir, wasmAsset);
    if (!fs.existsSync(wasmPath)) {
      this.error(
        `Expected Rustuna to emit ${wasmAsset}, found: ` +
        fs.readdirSync(options.dir).join(', ')
      );
    }
  },
});

// The storage Worker for the VS Code Webview, built separately from the UI
// bundle because it has to stand on its own.
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: '../vscode/assets',
    // The UI build already cleared the directory.
    emptyOutDir: false,
    rollupOptions: {
      input: '../tslib/storage/src/storage_worker.ts',
      plugins: [assertWasmEmitted()],
      output: {
        // A Webview cannot point a Worker at an extension asset, so this is
        // started from a blob: URL, where nothing resolves relative to the
        // Worker: it has to be a single file with no import left in it.
        //
        // ES and not IIFE, even though this is one file: the Rustuna glue uses
        // import.meta.url for its default module URL.
        format: 'es',
        inlineDynamicImports: true,
        entryFileNames: 'storage-worker.js',
        // The extension hands the Webview the wasm by name as well.
        assetFileNames: '[name][extname]',
      },
    },
  },
});
