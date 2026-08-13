import type { StorageWorkerFactory } from "@optuna/storage"
import React, { FC, useContext, useEffect } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./components/App"
import { StorageContext, StorageProvider } from "./components/StorageProvider"
import "./index.css"

type WebviewMessage = {
  type: "optunaStorage"
  content: unknown
  workerUri: string
  sqliteWasmUri: string
  sqliteWasmContent: unknown
}

export const AppWrapper: FC = () => {
  const { loadStorage } = useContext(StorageContext)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as WebviewMessage

      switch (message.type) {
        case "optunaStorage":
          void loadStorage(
            toArrayBuffer(message.content),
            createWebviewWorkerFactory(message.workerUri),
            message.sqliteWasmUri,
            toArrayBuffer(message.sqliteWasmContent)
          )
          break
      }
    }
    window.addEventListener("message", handleMessage)
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

const isByte = (value: unknown): value is number => {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  )
}

const toArrayBuffer = (content: unknown): ArrayBuffer => {
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

  const values = Array.isArray(content)
    ? content
    : content !== null && typeof content === "object"
      ? Object.entries(content)
          .filter(([key]) => /^\d+$/.test(key))
          .sort(([left], [right]) => Number(left) - Number(right))
          .map(([, value]) => value)
      : null
  if (values !== null && values.length > 0 && values.every(isByte)) {
    return Uint8Array.from(values).buffer
  }
  throw new TypeError("Storage content is not a byte sequence")
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageProvider>
      <AppWrapper />
    </StorageProvider>
  </React.StrictMode>
)
