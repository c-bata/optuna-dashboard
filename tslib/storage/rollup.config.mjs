import typescript from "@rollup/plugin-typescript"
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { wasm } from '@rollup/plugin-wasm';

export default {
  input: "src/index.ts",
  output: {
    dir: "pkg",
    format: "es",
    exports: "named",
    sourcemap: true,
  },
  external: [],
  plugins: [
    nodeResolve(),
    wasm({
      targetEnv: "auto-inline",
      maxFileSize: 0,
      sync: ["sqlite3.wasm"]
    }),
    typescript({
      declaration: true,
      declarationDir: "pkg",
      outDir: "pkg",
    }),
  ],
}
