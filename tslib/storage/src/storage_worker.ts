import { JournalFileStorage } from "./journal.js"
import { SQLite3Storage } from "./sqlite.js"
import type {
  StorageWorkerRequest,
  StorageWorkerResponse,
} from "./worker_protocol.js"

type WorkerScope = {
  onmessage: (event: MessageEvent<StorageWorkerRequest>) => void
  postMessage: (message: StorageWorkerResponse) => void
}

type WorkerStorage = JournalFileStorage | SQLite3Storage

let storage: WorkerStorage | null = null

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

const postError = (id: number, error: unknown): void => {
  workerScope.postMessage({
    id,
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

const closeStorage = async (): Promise<void> => {
  const currentStorage = storage
  storage = null
  if (currentStorage !== null) {
    await currentStorage.close()
  }
}

workerScope.onmessage = async (event) => {
  const request = event.data

  try {
    switch (request.type) {
      case "open": {
        if (storage !== null) {
          throw new WorkerRequestError(
            "invalid_state",
            "Storage is already open"
          )
        }
        if (isSQLiteFile(request.buffer)) {
          if (
            request.sqliteWasmUrl === undefined &&
            request.sqliteWasmBuffer === undefined
          ) {
            throw new WorkerRequestError(
              "missing_sqlite_wasm",
              "SQLite wasm URL or buffer is required"
            )
          }
          const sqliteStorage = new SQLite3Storage(request.buffer, {
            sqliteWasmUrl: request.sqliteWasmUrl,
            sqliteWasmBuffer: request.sqliteWasmBuffer,
          })
          try {
            await sqliteStorage.waitUntilReady()
          } catch (error) {
            await sqliteStorage.close().catch(() => {})
            throw error
          }
          storage = sqliteStorage
          workerScope.postMessage({
            id: request.id,
            ok: true,
            result: { format: "sqlite3", warnings: [] },
          })
          break
        }

        const journalStorage = new JournalFileStorage(request.buffer)
        storage = journalStorage
        workerScope.postMessage({
          id: request.id,
          ok: true,
          result: {
            format: "journal",
            warnings: journalStorage.getErrors(),
          },
        })
        break
      }
      case "getStudies": {
        if (storage === null) {
          throw new WorkerRequestError("invalid_state", "Storage is not open")
        }
        workerScope.postMessage({
          id: request.id,
          ok: true,
          result: await storage.getStudies(),
        })
        break
      }
      case "getStudy": {
        if (storage === null) {
          throw new WorkerRequestError("invalid_state", "Storage is not open")
        }
        workerScope.postMessage({
          id: request.id,
          ok: true,
          result: await storage.getStudy(request.studyId),
        })
        break
      }
      case "close": {
        await closeStorage()
        workerScope.postMessage({ id: request.id, ok: true, result: null })
        break
      }
    }
  } catch (error) {
    postError(request.id, error)
  }
}
