import type { StorageWorkerFactory } from "@optuna/storage"
import React from "react"
import ReactDOM from "react-dom/client"
import sqliteWasmUrl from "../../tslib/storage/node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm?url"
import { App } from "./components/App"
import { StorageProvider } from "./components/StorageProvider"
import "./index.css"

const workerFactory: StorageWorkerFactory = async () => {
  const worker = new Worker(
    new URL("../../tslib/storage/src/journal_worker.ts", import.meta.url),
    { type: "module" }
  )
  return {
    worker,
    dispose: () => {},
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageProvider
      workerFactory={workerFactory}
      sqliteWasmUrl={sqliteWasmUrl}
    >
      <App />
    </StorageProvider>
  </React.StrictMode>
)
