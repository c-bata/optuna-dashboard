import React, { FC, useEffect } from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { App } from "./components/App"
import { RecoilRoot, useSetRecoilState } from "recoil"
import { studiesState } from "./state"
import { loadFileStorage } from "./storage"

export const AppWrapper: FC = () => {
  const setStudies = useSetRecoilState<Study[]>(studiesState)

  const onceSetStudies = (setter: (prev: Study[]) => Study[]): void => {
    const studies = setter([])
    setStudies(studies)
  }

  useEffect(() => {
    window.addEventListener("message", (event) => {
      const message = event.data
      let fileContentBase64: string
      let binaryString: string
      let len: number
      let bytes: Uint8Array

      switch (message.type) {
        case "optunaStorage":
          fileContentBase64 = message.content
          binaryString = atob(fileContentBase64)
          len = binaryString.length
          bytes = new Uint8Array(len)
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          loadFileStorage(bytes.buffer, onceSetStudies)
          break
      }
    })
  }, [])
  return <App />
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecoilRoot>
      <AppWrapper />
    </RecoilRoot>
  </React.StrictMode>
)
