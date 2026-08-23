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
// This file is the second: the UI thread client.

import type * as Optuna from "@optuna/types"
import type { OptunaStorage, StorageEdit } from "./storage"
import type {
  OpenStorageResult,
  StorageWorkerRequest,
  StorageWorkerRequestBody,
  StorageWorkerRequestType,
  StorageWorkerResponse,
  StorageWorkerResultMap,
} from "./worker_protocol"

// Re-exported so that a UI can depend on this subpath alone: importing the
// package root would pull the Rustuna backend into the bundle.
export type {
  OptunaStorage,
  StorageEdit,
} from "./storage"

export type StorageWorker = {
  postMessage: (message: StorageWorkerRequest, transfer: Transferable[]) => void
  addEventListener: (type: string, listener: (event: Event) => void) => void
  removeEventListener: (type: string, listener: (event: Event) => void) => void
  terminate: () => void
}

export type StorageWorkerHandle = {
  worker: StorageWorker
  dispose: () => void
}

export type StorageWorkerFactory = () => Promise<StorageWorkerHandle>

// Where the storage Worker takes Rustuna's WebAssembly module from. The two are
// exclusive: a URL is fetched by the Worker, bytes are transferred to it. Bytes
// are what a VS Code Webview needs, where the Worker cannot fetch extension
// assets itself.
export type RustunaWasmSource = { url: string } | { buffer: ArrayBuffer }

export class StorageWorkerError extends Error {
  readonly code: string
  readonly details: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = "StorageWorkerError"
    this.code = code
    this.details = details
  }
}

type ClientState = "opening" | "ready" | "closing" | "closed" | "failed"

type PendingRequest = {
  type: StorageWorkerRequestType
  resolve: (value: never) => void
  reject: (reason: unknown) => void
}

export class StorageWorkerClient implements OptunaStorage {
  private state: ClientState = "opening"
  private nextRequestId = 0
  private readonly pending = new Map<number, PendingRequest>()
  private readonly handle: StorageWorkerHandle
  private readonly openPromise: Promise<OpenStorageResult>
  private closePromise: Promise<void> | null = null
  private openResult: OpenStorageResult | null = null
  private disposed = false

  private readonly handleMessage = (event: Event): void => {
    const response = (event as MessageEvent<StorageWorkerResponse>).data
    const pending = this.pending.get(response.id)
    if (pending === undefined) {
      return
    }
    this.pending.delete(response.id)
    if (response.ok) {
      if (response.type !== pending.type) {
        pending.reject(
          new StorageWorkerError(
            "protocol_mismatch",
            `Storage worker answered ${pending.type} with ${response.type}`
          )
        )
        return
      }
      pending.resolve(response.result as never)
    } else {
      pending.reject(
        new StorageWorkerError(
          response.error.code,
          response.error.message,
          response.error.details
        )
      )
    }
  }

  private readonly handleWorkerFailure = (event: Event): void => {
    const errorEvent = event as ErrorEvent
    const message = errorEvent.message || "Storage worker failed"
    this.fail(new StorageWorkerError("worker_failed", message))
  }

  private constructor(
    handle: StorageWorkerHandle,
    buffer: ArrayBuffer,
    rustunaWasm?: RustunaWasmSource
  ) {
    this.handle = handle
    handle.worker.addEventListener("message", this.handleMessage)
    handle.worker.addEventListener("error", this.handleWorkerFailure)
    handle.worker.addEventListener("messageerror", this.handleWorkerFailure)

    const rustunaWasmUrl =
      rustunaWasm !== undefined && "url" in rustunaWasm
        ? rustunaWasm.url
        : undefined
    const rustunaWasmBuffer =
      rustunaWasm !== undefined && "buffer" in rustunaWasm
        ? rustunaWasm.buffer
        : undefined
    this.openPromise = this.request(
      { type: "open", buffer, rustunaWasmUrl, rustunaWasmBuffer },
      rustunaWasmBuffer === undefined ? [buffer] : [buffer, rustunaWasmBuffer]
    )
  }

  public static async open(
    buffer: ArrayBuffer,
    workerFactory: StorageWorkerFactory,
    rustunaWasm?: RustunaWasmSource
  ): Promise<StorageWorkerClient> {
    const client = new StorageWorkerClient(
      await workerFactory(),
      buffer,
      rustunaWasm
    )
    try {
      client.openResult = await client.openPromise
      client.state = "ready"
      return client
    } catch (error) {
      client.fail(error)
      throw error
    }
  }

  public getWarnings(): OpenStorageResult["warnings"] {
    return this.openResult?.warnings ?? []
  }

  public getEditDisabledReason(): string | undefined {
    return this.openResult?.editDisabledReason
  }

  public applyEdit = async (edit: StorageEdit): Promise<ArrayBuffer> => {
    await this.waitUntilReady()
    return this.request({ type: "applyEdit", edit })
  }

  public getStudies = async (): Promise<Optuna.StudySummary[]> => {
    await this.waitUntilReady()
    return this.request({ type: "getStudies" })
  }

  public getStudy = async (studyId: number): Promise<Optuna.Study | null> => {
    await this.waitUntilReady()
    return this.request({ type: "getStudy", studyId })
  }

  public close = async (): Promise<void> => {
    if (this.state === "closed") {
      return
    }
    if (this.closePromise !== null) {
      return this.closePromise
    }

    this.closePromise = (async () => {
      if (this.state === "opening") {
        try {
          await this.openPromise
        } catch {
          // The failure path below releases the worker resources.
        }
      }
      if (this.state === "ready") {
        this.state = "closing"
        try {
          await this.request({ type: "close" })
        } catch {
          // close must release the client even if the worker already failed.
        }
      }
      this.dispose()
      this.state = "closed"
    })()
    return this.closePromise
  }

  private waitUntilReady = async (): Promise<void> => {
    if (this.state === "opening") {
      await this.openPromise
    }
    if (this.state !== "ready") {
      throw new StorageWorkerError(
        "invalid_state",
        `Storage worker is ${this.state}`
      )
    }
  }

  private request<K extends StorageWorkerRequestType>(
    request: Extract<StorageWorkerRequestBody, { type: K }>,
    transfer: Transferable[] = []
  ): Promise<StorageWorkerResultMap[K]> {
    if (this.state === "closed" || this.state === "failed") {
      return Promise.reject(
        new StorageWorkerError(
          "invalid_state",
          `Storage worker is ${this.state}`
        )
      )
    }

    const id = this.nextRequestId++
    const message = { ...request, id } as StorageWorkerRequest
    return new Promise<StorageWorkerResultMap[K]>((resolve, reject) => {
      this.pending.set(id, {
        type: request.type,
        resolve: resolve as (value: never) => void,
        reject,
      })
      try {
        this.handle.worker.postMessage(message, transfer)
      } catch (error) {
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  private fail(error: unknown): void {
    if (this.state === "closed" || this.state === "failed") {
      return
    }
    this.state = "failed"
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
    this.dispose()
  }

  private dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.handle.worker.removeEventListener("message", this.handleMessage)
    this.handle.worker.removeEventListener("error", this.handleWorkerFailure)
    this.handle.worker.removeEventListener(
      "messageerror",
      this.handleWorkerFailure
    )
    this.handle.worker.terminate()
    this.handle.dispose()
  }
}

export const openStorage = async (
  buffer: ArrayBuffer,
  workerFactory: StorageWorkerFactory,
  rustunaWasm?: RustunaWasmSource
): Promise<StorageWorkerClient> => {
  return StorageWorkerClient.open(buffer, workerFactory, rustunaWasm)
}
