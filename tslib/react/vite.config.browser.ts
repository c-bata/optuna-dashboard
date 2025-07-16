import react from "@vitejs/plugin-react-swc"
import { UserConfig, defineConfig } from "vite"
import { InlineConfig } from "vitest"

interface VitestConfig extends UserConfig {
  test: InlineConfig
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Enable browser mode for iframe and postMessage testing
    browser: {
      enabled: true,
      name: "chromium",
      provider: "playwright",
      headless: true,
      // Configure browser-specific settings
      api: {
        port: 63315,
      },
      isolate: true,
    },
    // Include browser-specific test files only
    include: ["**/*.browser.test.{ts,tsx}"],
    setupFiles: ["./test/browser_setup.ts"],
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
}) as VitestConfig
