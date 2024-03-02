import React, { FC, useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { App } from "./components/App"
import { RecoilRoot } from "recoil"
import { StorageContext, getStorage } from "./storage"

export const AppWrapper: FC = () => {
  const [storage, setStorage] = useState<OptunaStorage | null>(null)

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
  return (
    <StorageContext.Provider value={{ storage, setStorage }}>
      <App />
    </StorageContext.Provider>
  )
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecoilRoot>
      <AppWrapper />
    </RecoilRoot>
  </React.StrictMode>
)
