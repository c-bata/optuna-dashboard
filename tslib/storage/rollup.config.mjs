import typescript from "@rollup/plugin-typescript"
import { nodeResolve } from '@rollup/plugin-node-resolve';

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
    typescript({
      declaration: true,
      declarationDir: "pkg",
      outDir: "pkg",
    }),
  ],
}
