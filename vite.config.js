import { defineConfig, splitVendorChunk } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, "optuna_dashboard/ts/index.tsx"),
            name: "optuna-dashboard",
            fileName: "bundle",
        },
        outDir: resolve(__dirname, "optuna_dashboard/public"),
    },
    plugins: [
        react(),
        //splitVendorChunk()
    ],
});
