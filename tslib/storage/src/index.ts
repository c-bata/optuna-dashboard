// @optuna/storage has three entry points, one per execution context:
//
//   - `@optuna/storage` (index.ts): the Rustuna adapter. Importing it pulls the
//     Rustuna WebAssembly glue into the bundle, so it belongs in the Worker, or
//     in a consumer that knowingly parses storages on its own thread.
//   - `@optuna/storage/worker-client` (worker_client.ts): the client that talks
//     to the storage Worker. It runs on the UI thread and has no runtime
//     dependency of its own.
//   - storage_worker.ts: the Worker entry. It is not part of `exports` because
//     a Worker is not imported but pointed at: the app hands its path to the
//     bundler, as `new URL(..., import.meta.url)` for Vite or as an entry point
//     for webpack.
//
// This file is the first of those: the adapter.

export { RustunaStorage } from "./rustuna.js"
export {
  openStorage,
  StorageWorkerClient,
  StorageWorkerError,
} from "./worker_client.js"
export type {
  OptunaStorage,
  StorageEdit,
} from "./storage.js"
// The request and response types stay internal: they describe the wire between
// the client and the Worker, and a consumer that reaches for them is talking to
// the Worker without the client.
export type { OpenStorageResult, StorageWarning } from "./worker_protocol.js"
export type {
  RustunaWasmSource,
  StorageWorker,
  StorageWorkerFactory,
  StorageWorkerHandle,
} from "./worker_client.js"
