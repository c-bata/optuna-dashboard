import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, it } from "node:test"

import { JournalFileStorage } from "../pkg/journal.js"
import { SQLite3Storage } from "../pkg/sqlite.js"

const sqliteAssetUrl = new URL(
  "../../react/public/sample_db.sqlite3",
  import.meta.url
)
const sqliteWasmUrl = new URL(
  "../node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm",
  import.meta.url
)

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
    assert.match(incomplete.getEditDisabledReason(), /newline-terminated/)

    const unreadable = new JournalFileStorage(
      new TextEncoder().encode("not-json\n").buffer
    )
    assert.match(unreadable.getEditDisabledReason(), /unreadable/)
  })

  it("edits and reopens a SQLite storage", async () => {
    const storage = await openSQLite()
    try {
      const before = await storage.getStudies()
      await assert.rejects(
        storage.applyEdit({
          kind: "createStudy",
          name: before[0].name,
          directions: ["minimize"],
        }),
        /already exists/
      )
      assert.deepEqual(await storage.getStudies(), before)

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
        assert.deepEqual(summary.directions, ["minimize", "maximize"])
        const deleted = await reopened.applyEdit({
          kind: "deleteStudy",
          studyId: before[0].id,
        })
        const afterDelete = await openSQLite(deleted)
        try {
          assert.equal(await afterDelete.getStudy(before[0].id), null)
          assert.ok(
            (await afterDelete.getStudies()).some(
              (study) => study.name === summary.name
            )
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

  it("opens a checkpointed WAL header as read-only", async () => {
    const bytes = new Uint8Array(await readAsset(sqliteAssetUrl))
    bytes[18] = 2
    bytes[19] = 2
    const storage = await openSQLite(bytes.buffer)
    try {
      assert.equal((await storage.getStudies()).length > 0, true)
      assert.match(await storage.getEditDisabledReason(), /WAL-mode/)
    } finally {
      await storage.close()
    }
  })
})
