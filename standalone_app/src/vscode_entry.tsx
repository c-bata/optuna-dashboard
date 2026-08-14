import type { StorageWorkerFactory } from "@optuna/storage"
import React, { FC, useContext, useEffect } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./components/App"
import { StorageContext, StorageProvider } from "./components/StorageProvider"
import "./index.css"

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void
}

// acquireVsCodeApi() may only be called once per Webview, so memoize it outside
// of the component: StrictMode mounts the effect below twice.
let vscodeApi: ReturnType<typeof acquireVsCodeApi> | null = null
const getVsCodeApi = (): ReturnType<typeof acquireVsCodeApi> => {
  if (vscodeApi === null) {
    vscodeApi = acquireVsCodeApi()
  }
  return vscodeApi
}

type WebviewMessage = {
  type: "optunaStorage"
  content: unknown
  workerUri: string
  sqliteWasmUri: string
}

export const AppWrapper: FC = () => {
  const { loadStorage } = useContext(StorageContext)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as WebviewMessage

      switch (message.type) {
        case "optunaStorage":
          void loadStorage(
            toArrayBuffer(message.content, "Storage content"),
            createWebviewWorkerFactory(message.workerUri),
            message.sqliteWasmUri
          )
          break
      }
    }
    window.addEventListener("message", handleMessage)
    // Ask for the storage only once the listener is in place. The extension
    // answers immediately, and a message posted before this point is dropped.
    getVsCodeApi().postMessage({ type: "webviewDidLoad" })
    return () => window.removeEventListener("message", handleMessage)
  }, [loadStorage])
  return <App />
}

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
      const worker = new Worker(blobUrl)
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

// Webview messages carry typed arrays since VS Code 1.57, so `content` normally
// arrives as a Uint8Array. Some hosts hand over an array or an index keyed object
// instead, and a storage file can be hundreds of megabytes, so the fallback must
// stay linear and must not allocate per byte.
// TODO: record which host actually needs the index keyed fallback and drop it if
// no supported host does.
const toArrayBuffer = (content: unknown, label: string): ArrayBuffer => {
  if (content instanceof ArrayBuffer) {
    return content
  }
  if (content instanceof Uint8Array) {
    if (
      content.buffer instanceof ArrayBuffer &&
      content.byteOffset === 0 &&
      content.byteLength === content.buffer.byteLength
    ) {
      return content.buffer
    }
    return content.slice().buffer as ArrayBuffer
  }
  if (content === null || typeof content !== "object") {
    throw new TypeError(`${label} is not a byte sequence`)
  }

  const indexed = content as ArrayLike<unknown>
  const length =
    typeof indexed.length === "number"
      ? indexed.length
      : Object.keys(content).length
  if (!Number.isInteger(length) || length <= 0) {
    throw new TypeError(`${label} is not a byte sequence`)
  }
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    const value = indexed[i]
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 255
    ) {
      throw new TypeError(`${label} is not a byte sequence`)
    }
    bytes[i] = value
  }
  return bytes.buffer
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageProvider>
      <AppWrapper />
    </StorageProvider>
  </React.StrictMode>
)
