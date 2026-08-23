// @optuna/storage has three entry points, one per execution context:
//
//   - `@optuna/storage` (index.ts): the Rustuna adapter. Importing it pulls the
//     Rustuna WebAssembly glue into the bundle, so it belongs in the Worker.
//   - `@optuna/storage/worker-client` (worker_client.ts): the client that talks
//     to the storage Worker. It runs on the UI thread and has no runtime
//     dependency of its own.
//   - storage_worker.ts: the Worker entry. It is not part of `exports` because
//     a Worker is not imported but pointed at: the app hands its path to the
//     bundler, as `new URL(..., import.meta.url)` for Vite or as an entry point
//     for webpack.
//
// This file is the third: the Worker itself.

import { initSync } from "rustuna/web"
import { RustunaStorage } from "./rustuna.js"
import type {
  StorageWorkerRequest,
  StorageWorkerRequestType,
  StorageWorkerResponse,
  StorageWorkerResultMap,
} from "./worker_protocol.js"

type WorkerScope = {
  onmessage: (event: MessageEvent<StorageWorkerRequest>) => void
  postMessage: (
    message: StorageWorkerResponse,
    transfer?: Transferable[]
  ) => void
}

let storage: RustunaStorage | null = null
let rustunaInitialized = false

const workerScope = self as unknown as WorkerScope

class WorkerRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

const createError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      code: error instanceof WorkerRequestError ? error.code : "request_failed",
      message: error.message,
      details: error instanceof WorkerRequestError ? error.details : undefined,
    }
  }
  return {
    code: "request_failed",
    message: "Unknown worker error",
  }
}

const postResult = <K extends StorageWorkerRequestType>(
  id: number,
  type: K,
  result: StorageWorkerResultMap[K],
  transfer: Transferable[] = []
): void => {
  workerScope.postMessage(
    {
      id,
      type,
      ok: true,
      result,
    } as StorageWorkerResponse,
    transfer
  )
}

const postError = (id: number, type: string, error: unknown): void => {
  workerScope.postMessage({
    id,
    type,
    ok: false,
    error: createError(error),
  })
}

const isSQLiteFile = (buffer: ArrayBuffer): boolean => {
  const headerLength = Math.min(buffer.byteLength, 16)
  const header = new TextDecoder().decode(
    new Uint8Array(buffer, 0, headerLength)
  )
  return header === "SQLite format 3\u0000"
}

const initializeRustuna = async (
  url: string | undefined,
  buffer: ArrayBuffer | undefined
): Promise<void> => {
  if (rustunaInitialized) {
    return
  }
  let module = buffer
  if (module === undefined && url !== undefined) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new WorkerRequestError(
        "rustuna_wasm_failed",
        `Failed to fetch Rustuna wasm: ${response.status}`
      )
    }
    module = await response.arrayBuffer()
  }
  if (module === undefined) {
    throw new WorkerRequestError(
      "missing_rustuna_wasm",
      "Rustuna wasm URL or buffer is required"
    )
  }
  initSync({ module })
  rustunaInitialized = true
}

const closeStorage = async (): Promise<void> => {
  const currentStorage = storage
  storage = null
  if (currentStorage !== null) {
    await currentStorage.close()
  }
}

const handleRequest = async (request: StorageWorkerRequest): Promise<void> => {
  try {
    switch (request.type) {
      case "open": {
        if (storage !== null) {
          throw new WorkerRequestError(
            "invalid_state",
            "Storage is already open"
          )
        }
        // Neither format can say anything about a file with no bytes, and
        // creating a storage does leave one behind, so name that case rather
        // than opening it as a storage with nothing in it.
        if (request.buffer.byteLength === 0) {
          throw new WorkerRequestError("empty_file", "This file is empty")
        }
        await initializeRustuna(
          request.rustunaWasmUrl,
          request.rustunaWasmBuffer
        )
        if (isSQLiteFile(request.buffer)) {
          let sqliteStorage: RustunaStorage | undefined
          try {
            sqliteStorage = RustunaStorage.openSQLite(request.buffer)
            await sqliteStorage.getStudies()
          } catch (error) {
            await sqliteStorage?.close()
            throw new WorkerRequestError(
              "unsupported_format",
              "Not an Optuna storage: this SQLite database has no Optuna tables",
              error instanceof Error ? error.message : undefined
            )
          }
          storage = sqliteStorage
          postResult(request.id, "open", {
            format: "sqlite3",
            warnings: [],
            editDisabledReason: sqliteStorage.getEditDisabledReason(),
          })
          break
        }

        const journalStorage = RustunaStorage.openJournal(request.buffer)
        const warnings = journalStorage.getWarnings()
        // A Journal file is read line by line, and a line that cannot be read is
        // collected as a warning rather than raised, which is what keeps a
        // partially written file usable. A file that is not a storage at all
        // would then open as an empty one, so require at least one record. A
        // Journal storage whose studies were all deleted still has records.
        if (journalStorage.appliedRecords === 0) {
          await journalStorage.close()
          throw new WorkerRequestError(
            "unsupported_format",
            "Not an Optuna storage: no SQLite header and no Journal record",
            { unreadableLines: warnings.length }
          )
        }
        storage = journalStorage
        postResult(request.id, "open", {
          format: "journal",
          warnings,
          editDisabledReason: journalStorage.getEditDisabledReason(),
        })
        break
      }
      case "getStudies": {
        if (storage === null) {
          throw new WorkerRequestError("invalid_state", "Storage is not open")
        }
        postResult(request.id, "getStudies", await storage.getStudies())
        break
      }
      case "getStudy": {
        if (storage === null) {
          throw new WorkerRequestError("invalid_state", "Storage is not open")
        }
        postResult(
          request.id,
          "getStudy",
          await storage.getStudy(request.studyId)
        )
        break
      }
      case "applyEdit": {
        if (storage === null) {
          throw new WorkerRequestError("invalid_state", "Storage is not open")
        }
        const buffer = await storage.applyEdit(request.edit)
        postResult(request.id, "applyEdit", buffer, [buffer])
        break
      }
      case "close": {
        await closeStorage()
        postResult(request.id, "close", null)
        break
      }
      default: {
        // `request` is never here as long as every request type is handled.
        // Answering keeps a client of a different version from waiting forever.
        const unsupported = request as { id: number; type: string }
        throw new WorkerRequestError(
          "unsupported_request",
          `Unsupported request: ${unsupported.type}`
        )
      }
    }
  } catch (error) {
    postError(request.id, request.type, error)
  }
}

// Requests that mutate or serialize storage must be observed in arrival order.
// Keeping every request in the same queue also makes reads deterministic around
// an edit and prevents close from racing an export.
let requestQueue = Promise.resolve()
workerScope.onmessage = (event) => {
  const request = event.data
  requestQueue = requestQueue.then(() => handleRequest(request))
}
