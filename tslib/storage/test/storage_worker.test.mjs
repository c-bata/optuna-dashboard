import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, it } from "node:test"
import { Worker as NodeWorker } from "node:worker_threads"

import { StorageWorkerClient } from "../pkg/worker_client.js"

const workerModuleUrl = new URL("../pkg/journal_worker.js", import.meta.url)
const sqliteAssetUrl = new URL("./asset/db.sqlite3", import.meta.url)
const journalAssetUrl = new URL("./asset/journal.log", import.meta.url)
const sqliteWasmUrl = new URL(
  "../node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm",
  import.meta.url
)

class WorkerAdapter extends EventTarget {
  constructor(worker) {
    super()
    this.worker = worker
    worker.on("message", (data) => {
      const event = new Event("message")
      Object.defineProperty(event, "data", { value: data })
      this.dispatchEvent(event)
    })
    worker.on("error", (error) => {
      const event = new Event("error")
      Object.defineProperty(event, "message", { value: error.message })
      this.dispatchEvent(event)
    })
    worker.on("messageerror", () => {
      this.dispatchEvent(new Event("messageerror"))
    })
  }

  postMessage(message, transfer) {
    this.worker.postMessage(message, transfer)
  }

  terminate() {
    void this.worker.terminate()
  }
}

const createWorkerFactory = () => async () => {
  const worker = new NodeWorker(
    `
      import { parentPort } from "node:worker_threads"
      globalThis.self = globalThis
      globalThis.postMessage = (message) => parentPort.postMessage(message)
      parentPort.on("message", (message) => globalThis.onmessage({ data: message }))
      await import(${JSON.stringify(workerModuleUrl.href)})
    `,
    { eval: true, type: "module" }
  )
  const adapter = new WorkerAdapter(worker)
  return { worker: adapter, dispose: () => {} }
}

const readAsset = async (url) => {
  const bytes = await readFile(url)
  return Uint8Array.from(bytes).buffer
}

describe("storage worker", () => {
  it("opens Journal storage in the common worker", async () => {
    const storage = await StorageWorkerClient.open(
      await readAsset(journalAssetUrl),
      createWorkerFactory()
    )

    const studies = await storage.getStudies()
    assert.equal(studies.length, 6)
    assert.equal((await storage.getStudy(studies[0].id))?.name, studies[0].name)
    await storage.close()
  })

  it("opens SQLite storage with a transferred wasm binary", async () => {
    const storage = await StorageWorkerClient.open(
      await readAsset(sqliteAssetUrl),
      createWorkerFactory(),
      undefined,
      await readAsset(sqliteWasmUrl)
    )

    const studies = await storage.getStudies()
    assert.equal(studies.length, 0)
    assert.equal(await storage.getStudy(1), null)
    await storage.close()
  })

  it("reports a missing SQLite wasm asset after transferring the database", async () => {
    await assert.rejects(
      StorageWorkerClient.open(
        await readAsset(sqliteAssetUrl),
        createWorkerFactory()
      ),
      { code: "missing_sqlite_wasm" }
    )
  })
})
