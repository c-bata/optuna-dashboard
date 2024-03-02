import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { App } from "./components/App"
import { StorageProvider } from "@optuna/tslib"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageProvider>
      <App />
    </StorageProvider>
  </React.StrictMode>
)
