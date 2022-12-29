import {defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ command, mode}) => {
    const env = loadEnv(mode, process.cwd(), 'OPTUNA_')
    return {
        //build: {
        //},
        //build: {
        //    lib: {
        //        entry: resolve(__dirname, "optuna_dashboard/ts/index.tsx"),
        //        name: "optuna-dashboard",
        //        fileName: "bundle",
        //    },
        //    outDir: resolve(__dirname, "optuna_dashboard/public"),
        //},
        define: {
            API_ENDPOINT: env.API_ENDPOINT || "127.0.0.1:8080",
            APP_BAR: env.APP_BAR_TITLE || "Optuna Dashboard",
        },
        publicDir: resolve(__dirname, "optuna_dashboard/public"),
        plugins: [
            react(),
            //splitVendorChunk()
        ],
    }
});
