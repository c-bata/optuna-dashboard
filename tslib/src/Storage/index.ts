import { JournalFileStorage } from "./journal"
import { SQLite3Storage } from "./sqlite3"
import { Study, StudySummary } from "../entity"

export type OptunaStorage = {
  getStudies: () => Promise<StudySummary[]>
  getStudy: (idx: number) => Promise<Study | null>
}

export const getStorage = (arrayBuffer: ArrayBuffer): OptunaStorage => {
  const header = new Uint8Array(arrayBuffer, 0, 16)
  const headerString = new TextDecoder().decode(header)
  if (headerString === "SQLite format 3\u0000") {
    return new SQLite3Storage(arrayBuffer)
  } else {
    return new JournalFileStorage(arrayBuffer)
  }
}
