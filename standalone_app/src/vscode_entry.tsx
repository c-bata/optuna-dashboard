import React, { FC, useEffect, useContext } from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { App } from "./components/App"
import {
  StorageProvider,
  getStorage,
  StorageContext,
} from "./components/StorageProvider"

export const AppWrapper: FC = () => {
  const { setStorage } = useContext(StorageContext)

  useEffect(() => {
    window.addEventListener("message", (event) => {
      const message = event.data
      let fileContentBase64: string
      let binaryString: string
      let len: number
      let bytes: Uint8Array
      let arrayBuffer: ArrayBuffer

      switch (message.type) {
        case "optunaStorage":
          fileContentBase64 = message.content
          binaryString = atob(fileContentBase64)
          len = binaryString.length
          bytes = new Uint8Array(len)
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          arrayBuffer = bytes.buffer
          setStorage(getStorage(arrayBuffer))
          break
      }
    })
  }, [])
  return <App />
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageProvider>
      <AppWrapper />
    </StorageProvider>
  </React.StrictMode>
)
