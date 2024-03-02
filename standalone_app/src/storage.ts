import { createContext } from "react"
import { SQLite3Storage } from "./sqlite3"
import { JournalFileStorage } from "./journalStorage"

export const StorageContext = createContext<{
  storage: OptunaStorage | null
  setStorage: (storage: OptunaStorage) => void
}>({
  storage: null,
  setStorage: (_: OptunaStorage) => {},
})

export const getStorage = (arrayBuffer: ArrayBuffer): OptunaStorage => {
  const header = new Uint8Array(arrayBuffer, 0, 16)
  const headerString = new TextDecoder().decode(header)
  if (headerString === "SQLite format 3\u0000") {
    return new SQLite3Storage(arrayBuffer)
  } else {
    return new JournalFileStorage(arrayBuffer)
  }
}
