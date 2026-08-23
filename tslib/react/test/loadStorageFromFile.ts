import { RustunaStorage } from "@optuna/storage"
import type { OptunaStorage } from "@optuna/storage/worker-client"
import * as Optuna from "@optuna/types"
import rustunaWasmUrl from "rustuna/wasm?url"
import initRustuna from "rustuna/web"

type SetterOrUpdater<T> = (valOrUpdater: ((currVal: T) => T) | T) => void

const readFile = async (file: File) => {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      const arrayBuffer = reader.result as ArrayBuffer | null
      if (arrayBuffer !== null) {
        resolve(arrayBuffer)
      } else {
        reject(new Error("Failed to load file"))
      }
    })
    reader.readAsArrayBuffer(file)
  })
}

const loadStudiesFromStorage = async (
  storage: OptunaStorage,
  setter: SetterOrUpdater<Optuna.Study[]>
) => {
  const studySummaries = await storage.getStudies()
  const studies = (
    await Promise.all(
      studySummaries.map((summary) => storage.getStudy(summary.id))
    )
  ).filter((s) => s !== null) as Optuna.Study[]
  setter((prev) => [...prev, ...studies])
}

export const loadStorageFromFile = async (
  file: File,
  setStudies: SetterOrUpdater<Optuna.Study[]>
) => {
  const arrayBuf = await readFile(file)
  await initRustuna({ module_or_path: rustunaWasmUrl })
  const header = new Uint8Array(arrayBuf, 0, 16)
  const headerString = new TextDecoder().decode(header)
  const storage =
    headerString === "SQLite format 3\u0000"
      ? RustunaStorage.openSQLite(arrayBuf)
      : RustunaStorage.openJournal(arrayBuf)
  try {
    await loadStudiesFromStorage(storage, setStudies)
  } finally {
    await storage.close()
  }
}
