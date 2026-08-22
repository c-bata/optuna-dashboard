import type {
  StorageEditResult,
  StorageWorkerFactory,
} from "@optuna/storage/worker-client"
import React, { FC, useContext, useEffect } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./components/App"
import { StorageContext, StorageProvider } from "./components/StorageProvider"
import "./index.css"

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void
}

// acquireVsCodeApi() may only be called once per Webview, so memoize it outside
// of the component: StrictMode mounts the effect below twice. It throws when
// something else acquired the API first, which a stale extension build can do,
// and an effect that throws unmounts the React root, so report it instead.
let vscodeApi: ReturnType<typeof acquireVsCodeApi> | null = null
const getVsCodeApi = (): ReturnType<typeof acquireVsCodeApi> | null => {
  if (vscodeApi === null) {
    try {
      vscodeApi = acquireVsCodeApi()
    } catch (error) {
      console.error("Failed to acquire the VS Code API", error)
      return null
    }
  }
  return vscodeApi
}

type WebviewMessage = {
  type: "optunaStorage"
  content: unknown
  name?: string
  readOnlyReason?: string
  workerUri: string
  sqliteWasmUri: string
}

type ReloadMessage = {
  type: "reloadStorage"
  content: unknown
  readOnlyReason?: string
}

type ChangeResultMessage = {
  type: "documentChangeAccepted" | "documentChangeRejected"
  revision: number
  message?: string
  content?: unknown
}

const pendingChanges = new Map<
  number,
  { resolve: () => void; reject: (error: Error) => void }
>()

const sendStorageChange = (result: StorageEditResult): Promise<void> => {
  return new Promise((resolve, reject) => {
    const api = getVsCodeApi()
    if (api === null) {
      reject(new Error("VS Code API is unavailable"))
      return
    }
    pendingChanges.set(result.revision, { resolve, reject })
    api.postMessage({
      type: "documentChanged",
      revision: result.revision,
      content: result.buffer,
    })
  })
}

export const AppWrapper: FC = () => {
  const { loadStorage, closeStorage, reportError } = useContext(StorageContext)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as
        | WebviewMessage
        | ReloadMessage
        | ChangeResultMessage

      switch (message.type) {
        case "optunaStorage": {
          const buffer = toArrayBuffer(message.content)
          void (async () => {
            try {
              const storageMessage = message as WebviewMessage
              documentWorkerUri = storageMessage.workerUri
              documentWasmUri = storageMessage.sqliteWasmUri
              await loadStorage(buffer, {
                name: storageMessage.name,
                readOnlyReason: storageMessage.readOnlyReason,
                workerFactory: createWebviewWorkerFactory(
                  storageMessage.workerUri
                ),
                sqliteWasm: {
                  buffer: await fetchAsset(
                    storageMessage.sqliteWasmUri,
                    "SQLite wasm"
                  ),
                },
              })
            } catch (error) {
              reportError(error)
            }
          })()
          break
        }
        case "reloadStorage": {
          const reloadMessage = message as ReloadMessage
          void (async () => {
            try {
              const workerUri = documentWorkerUri
              const wasmUri = documentWasmUri
              if (workerUri === null || wasmUri === null) {
                throw new Error("Storage assets are not initialized")
              }
              await closeStorage()
              await loadStorage(toArrayBuffer(reloadMessage.content), {
                readOnlyReason: reloadMessage.readOnlyReason,
                workerFactory: createWebviewWorkerFactory(workerUri),
                sqliteWasm: {
                  buffer: await fetchAsset(wasmUri, "SQLite wasm"),
                },
              })
            } catch (error) {
              reportError(error)
            }
          })()
          break
        }
        case "documentChangeAccepted": {
          const resultMessage = message as ChangeResultMessage
          pendingChanges.get(resultMessage.revision)?.resolve()
          pendingChanges.delete(resultMessage.revision)
          break
        }
        case "documentChangeRejected": {
          const resultMessage = message as ChangeResultMessage
          pendingChanges
            .get(resultMessage.revision)
            ?.reject(
              new Error(resultMessage.message ?? "Document update failed")
            )
          pendingChanges.delete(resultMessage.revision)
          if (resultMessage.content !== undefined) {
            window.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  type: "reloadStorage",
                  content: resultMessage.content,
                } satisfies ReloadMessage,
              })
            )
          }
          break
        }
      }
    }
    window.addEventListener("message", handleMessage)
    // Ask for the storage only once the listener is in place. The extension
    // answers immediately, and a message posted before this point is dropped.
    if (!storageRequested) {
      storageRequested = true
      getVsCodeApi()?.postMessage({ type: "webviewDidLoad" })
    }
    return () => window.removeEventListener("message", handleMessage)
  }, [closeStorage, loadStorage, reportError])
  return <App />
}

let documentWorkerUri: string | null = null
let documentWasmUri: string | null = null
let storageRequested = false

// Extension assets are served by the Webview's service worker, which does not
// answer a request coming from a Worker that was started from a blob: URL: those
// come back with an error status. Everything the storage Worker needs is
// therefore fetched here, in the document, and handed over as bytes.
const fetchAsset = async (uri: string, label: string): Promise<ArrayBuffer> => {
  const response = await fetch(uri)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: ${response.status}`)
  }
  return response.arrayBuffer()
}

// A Webview cannot point a Worker at an extension asset, so the Worker bundle is
// fetched and started from a blob: URL. Revoking that URL is the factory's
// business, which is what the disposer is for.
const createWebviewWorkerFactory = (
  workerUri: string
): StorageWorkerFactory => {
  return async () => {
    const response = await fetch(workerUri)
    if (!response.ok) {
      throw new Error(`Failed to fetch storage worker: ${response.status}`)
    }
    const blobUrl = URL.createObjectURL(await response.blob())
    try {
      // A module Worker: the bundle is one file with no import, so nothing has
      // to be resolved relative to the blob: URL it is started from.
      const worker = new Worker(blobUrl, { type: "module" })
      return {
        worker,
        dispose: () => URL.revokeObjectURL(blobUrl),
      }
    } catch (error) {
      URL.revokeObjectURL(blobUrl)
      throw error
    }
  }
}

// The extension sends an ArrayBuffer. A typed array is accepted as well, since
// that is what the Webview message serializer produces for one, but anything
// else is named rather than left to fail as a missing method on an object of an
// unexpected shape.
const toArrayBuffer = (content: unknown): ArrayBuffer => {
  if (content instanceof ArrayBuffer) {
    return content
  }
  if (ArrayBuffer.isView(content)) {
    const buffer = content.buffer as ArrayBuffer
    if (content.byteOffset === 0 && content.byteLength === buffer.byteLength) {
      return buffer
    }
    return buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength
    )
  }
  const received =
    content === null || typeof content !== "object"
      ? typeof content
      : content.constructor?.name ?? "object"
  throw new TypeError(
    `Storage content arrived as ${received}, expected an ArrayBuffer`
  )
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageProvider onStorageChange={sendStorageChange}>
      <AppWrapper />
    </StorageProvider>
  </React.StrictMode>
)
