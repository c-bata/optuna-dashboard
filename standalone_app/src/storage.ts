import { loadJournalStorage, loadSQLite3Storage } from "@optuna/storage-loader"
// @ts-ignore
import sqlite3InitModule from "@sqlite.org/sqlite-wasm"

export const loadFileStorage = (
  arrayBuffer: ArrayBuffer,
  setter: (setter: (prev: Study[]) => Study[]) => void
): void => {
  const header = new Uint8Array(arrayBuffer, 0, 16)
  const headerString = new TextDecoder().decode(header)
  if (headerString === "SQLite format 3\u0000") {
    loadSQLite3WasmStorage(arrayBuffer, setter)
  } else {
    loadJournalStorage(arrayBuffer, setter)
  }
}

const loadSQLite3WasmStorage = (
  arrayBuffer: ArrayBuffer,
  setter: (setter: (prev: Study[]) => Study[]) => void
): void => {
  sqlite3InitModule({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    print: (...args: any): void => {
      console.log(args)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    printErr: (...args: any): void => {
      console.log(args)
    },
    // @ts-ignore
  }).then((sqlite3) => {
    const p = sqlite3.wasm.allocFromTypedArray(arrayBuffer)
    const db = new sqlite3.oo1.DB()
    const rc = sqlite3.capi.sqlite3_deserialize(
      // @ts-ignore
      db.pointer,
      "main",
      p,
      arrayBuffer.byteLength,
      arrayBuffer.byteLength,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
    )
    db.checkRc(rc)
    loadSQLite3Storage(db, setter)
  })
}
