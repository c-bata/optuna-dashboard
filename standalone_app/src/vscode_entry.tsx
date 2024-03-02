import React, { FC, useEffect } from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { App } from "./components/App"
import {
  StorageProvider,
  useSetStorageState,
} from "./components/StorageProvider"

class StorageWrapper {
  summaries: StudySummary[]
  constructor(summaries: StudySummary[]) {
    this.summaries = summaries
  }
  getStudies = async (): Promise<StudySummary[]> => {
    return this.summaries
  }
  getStudy = async (idx: number): Promise<Study | null> => {
    return null
  }
}

export const AppWrapper: FC = () => {
  const setStorage = useSetStorageState()

  useEffect(() => {
    window.addEventListener("message", (event) => {
      const message = event.data
      switch (message.type) {
        case "studySummaries":
          const summaries: StudySummary[] = message.content
          const storage = new StorageWrapper(summaries)
          setStorage(storage)
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
