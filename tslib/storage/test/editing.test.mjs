import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, it } from "node:test"
import { Worker as NodeWorker } from "node:worker_threads"

import { JournalFileStorage } from "../pkg/journal.js"
import { SQLite3Storage } from "../pkg/sqlite.js"
import { StorageWorkerClient } from "../pkg/worker_client.js"

const sqliteAssetUrl = new URL(
  "../../react/public/sample_db.sqlite3",
  import.meta.url
)
const sqliteWasmUrl = new URL(
  "../node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm",
  import.meta.url
)
const workerModuleUrl = new URL("../pkg/storage_worker.js", import.meta.url)

const readAsset = async (url) => Uint8Array.from(await readFile(url)).buffer

const openSQLite = async (buffer) => {
  const storage = new SQLite3Storage(
    buffer ?? (await readAsset(sqliteAssetUrl)),
    {
      sqliteWasmBuffer: await readAsset(sqliteWasmUrl),
    }
  )
  await storage.waitUntilReady()
  return storage
}

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
      globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer)
      parentPort.on("message", (message) => globalThis.onmessage({ data: message }))
      await import(${JSON.stringify(workerModuleUrl.href)})
    `,
    { eval: true, type: "module" }
  )
  return { worker: new WorkerAdapter(worker), dispose: () => {} }
}

describe("editable storage", () => {
  it("appends compatible multi-objective Journal operations", async () => {
    const original =
      '{"op_code":0,"worker_id":"python","study_name":"first","directions":[1]}\n' +
      '{"op_code":1,"worker_id":"python","study_id":0}\n'
    const storage = new JournalFileStorage(
      new TextEncoder().encode(original).buffer
    )

    const exported = await storage.applyEdit({
      kind: "createStudy",
      name: "second",
      directions: ["minimize", "maximize"],
    })
    const text = new TextDecoder().decode(exported)
    assert.equal(text.slice(0, original.length), original)
    const operation = JSON.parse(text.trimEnd().split("\n").at(-1))
    assert.equal(
      operation.worker_id.startsWith("optuna-dashboard-") ||
        operation.worker_id.length > 0,
      true
    )
    assert.deepEqual(operation.directions, [1, 2])
    assert.equal((await storage.getStudies())[0].id, 1)
    assert.deepEqual((await storage.getStudies())[0].directions, [
      "minimize",
      "maximize",
    ])
  })

  it("makes incomplete or unreadable Journals read-only", () => {
    const incomplete = new JournalFileStorage(
      new TextEncoder().encode(
        '{"op_code":0,"worker_id":"x","study_name":"x","directions":[1]}'
      ).buffer
    )
    assert.equal(incomplete.getCapabilities().editable, false)

    const unreadable = new JournalFileStorage(
      new TextEncoder().encode("not-json\n").buffer
    )
    assert.equal(unreadable.getCapabilities().editable, false)
  })

  it("creates, exports, reopens, and deletes a SQLite study", async () => {
    const storage = await openSQLite()
    try {
      const created = await storage.applyEdit({
        kind: "createStudy",
        name: "editable-storage-test",
        directions: ["minimize", "maximize"],
      })
      const reopened = await openSQLite(created)
      try {
        const summary = (await reopened.getStudies()).find(
          (study) => study.name === "editable-storage-test"
        )
        assert.ok(summary)
        assert.deepEqual(summary?.directions, ["minimize", "maximize"])
        const deleted = await reopened.applyEdit({
          kind: "deleteStudy",
          studyId: summary.id,
        })
        const afterDelete = await openSQLite(deleted)
        try {
          assert.equal(
            (await afterDelete.getStudies()).some(
              (study) => study.name === "editable-storage-test"
            ),
            false
          )
        } finally {
          await afterDelete.close()
        }
      } finally {
        await reopened.close()
      }
    } finally {
      await storage.close()
    }
  })

  it("deletes a SQLite study with trials and rolls back invalid edits", async () => {
    const storage = await openSQLite()
    try {
      const before = await storage.getStudies()
      assert.equal(before.length > 0, true)
      await assert.rejects(
        storage.applyEdit({
          kind: "createStudy",
          name: before[0].name,
          directions: ["minimize"],
        }),
        /already exists/
      )
      assert.deepEqual(await storage.getStudies(), before)

      const exported = await storage.applyEdit({
        kind: "deleteStudy",
        studyId: before[0].id,
      })
      const reopened = await openSQLite(exported)
      try {
        assert.equal(await reopened.getStudy(before[0].id), null)
        assert.equal((await reopened.getStudies()).length, before.length - 1)
      } finally {
        await reopened.close()
      }
    } finally {
      await storage.close()
    }
  })

  it("opens a checkpointed WAL header as read-only", async () => {
    const bytes = new Uint8Array(await readAsset(sqliteAssetUrl))
    bytes[18] = 2
    bytes[19] = 2
    const storage = await openSQLite(bytes.buffer)
    try {
      assert.equal((await storage.getStudies()).length > 0, true)
      assert.equal((await storage.getEditCapabilities()).editable, false)
    } finally {
      await storage.close()
    }
  })

  it("serializes Worker edits and reads in request order", async () => {
    const content =
      '{"op_code":0,"worker_id":"python","study_name":"first","directions":[1]}\n'
    const storage = await StorageWorkerClient.open(
      new TextEncoder().encode(content).buffer,
      createWorkerFactory()
    )
    try {
      assert.deepEqual(storage.getCapabilities(), { editable: true })
      const edit = storage.applyEdit({
        kind: "createStudy",
        name: "second",
        directions: ["maximize"],
      })
      const studies = storage.getStudies()
      const [result, summaries] = await Promise.all([edit, studies])
      assert.equal(result.revision, 1)
      assert.deepEqual(
        summaries.map((study) => study.name),
        ["first", "second"]
      )
      assert.match(new TextDecoder().decode(result.buffer), /"worker_id"/)
    } finally {
      await storage.close()
    }
  })
})
