import React, { FC, useState } from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { App } from "./components/App"
import { RecoilRoot } from "recoil"
import { StorageContext } from "./storage"

export const AppWrapper: FC = () => {
  const [storage, setStorage] = useState<OptunaStorage | null>(null)

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
