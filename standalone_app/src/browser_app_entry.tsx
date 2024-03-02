import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { App } from "./components/App"
import { StorageProvider } from "./components/StorageProvider"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageProvider>
      <App />
    </StorageProvider>
  </React.StrictMode>
)
