import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, it } from "node:test"
import { initSync } from "rustuna/web"

import { RustunaStorage } from "../pkg/rustuna.js"

const rustunaWasmUrl = new URL(
  "../node_modules/rustuna/pkg/web/rustuna_bg.wasm",
  import.meta.url
)
initSync({ module: await readFile(rustunaWasmUrl) })

const encodeJournal = (records) =>
  new TextEncoder().encode(
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`
  ).buffer

describe("Rustuna Journal adapter", () => {
  it("loads a study by its ID instead of its position", async () => {
    const storage = RustunaStorage.openJournal(
      encodeJournal([
        {
          op_code: 0,
          worker_id: "python",
          study_name: "study-0",
          directions: [1],
        },
        {
          op_code: 0,
          worker_id: "python",
          study_name: "study-1",
          directions: [1],
        },
        { op_code: 1, worker_id: "python", study_id: 1 },
        {
          op_code: 0,
          worker_id: "python",
          study_name: "study-2",
          directions: [1],
        },
      ])
    )

    assert.deepEqual(
      (await storage.getStudies()).map((summary) => summary.id),
      [0, 2]
    )
    assert.equal(await storage.getStudy(1), null)
    assert.equal((await storage.getStudy(2))?.name, "study-2")
  })

  it("converts dynamic search spaces, attrs, metrics, and non-finite values", async () => {
    const float = (low, high) =>
      JSON.stringify({
        name: "FloatDistribution",
        attributes: { low, high, step: null, log: false },
      })
    const categorical = JSON.stringify({
      name: "CategoricalDistribution",
      attributes: { choices: ["a", "b"] },
    })
    const records = [
      {
        op_code: 0,
        worker_id: "python",
        study_name: "dynamic",
        directions: [1],
      },
      {
        op_code: 3,
        worker_id: "python",
        study_id: 0,
        system_attr: { "study:metric_names": ["objective"] },
      },
      {
        op_code: 4,
        worker_id: "python",
        study_id: 0,
        state: 1,
        values: ["__INF__"],
        params: { x: 0.5, category: 1 },
        distributions: { x: float(0, 1), category: categorical },
        intermediate_values: { 1: "__NAN__" },
        user_attrs: { owner: "alice" },
        system_attrs: { constraints: [-1, 2] },
      },
      {
        op_code: 4,
        worker_id: "python",
        study_id: 0,
        state: 1,
        values: [0.5],
        params: { x: -0.5, category: 0 },
        distributions: { x: float(-1, 0), category: categorical },
      },
      {
        op_code: 4,
        worker_id: "python",
        study_id: 0,
        state: 2,
        intermediate_values: { 0: 0.5, 1: 0.25, 2: 0.75 },
        params: { category: 0 },
        distributions: { category: categorical },
      },
    ]
    const text = `${records
      .map((record) => JSON.stringify(record))
      .join("\n")
      .replace('"__INF__"', "Infinity")
      .replace('"__NAN__"', "NaN")}\n`
    const storage = RustunaStorage.openJournal(
      new TextEncoder().encode(text).buffer
    )
    const study = await storage.getStudy(0)

    assert.ok(study)
    assert.deepEqual(study.metric_names, ["objective"])
    assert.deepEqual(study.union_search_space.map(({ name }) => name).sort(), [
      "category",
      "x",
      "x",
    ])
    assert.deepEqual(
      study.intersection_search_space.map(({ name }) => name),
      ["category"]
    )
    assert.equal(study.trials[0].values?.[0], Infinity)
    assert.equal(
      Number.isNaN(study.trials[0].intermediate_values[0].value),
      true
    )
    assert.deepEqual(study.trials[0].constraints, [-1, 2])
    assert.deepEqual(study.trials[2].values, [0.25])
    assert.deepEqual(study.union_user_attrs, [
      { key: "owner", sortable: false },
    ])
  })

  it("derives pruned values from intermediate values in either direction", async () => {
    for (const [direction, expected] of [
      [1, -2],
      [2, 3],
    ]) {
      const storage = RustunaStorage.openJournal(
        encodeJournal([
          {
            op_code: 0,
            worker_id: "python",
            study_name: "pruned",
            directions: [direction],
          },
          {
            op_code: 4,
            worker_id: "python",
            study_id: 0,
            state: 2,
            intermediate_values: { 0: 3, 1: "NaN", 2: -2 },
          },
        ])
      )
      try {
        assert.deepEqual((await storage.getStudy(0))?.trials[0].values, [
          expected,
        ])
      } finally {
        await storage.close()
      }
    }
  })

  it("reports malformed records while keeping readable records", async () => {
    const storage = RustunaStorage.openJournal(
      new TextEncoder().encode(
        '{"op_code":0,"worker_id":"python","study_name":"ok","directions":[1]}\n' +
          "not-json\n"
      ).buffer
    )

    assert.equal(storage.getWarnings().length, 1)
    assert.deepEqual(
      (await storage.getStudies()).map(({ name }) => name),
      ["ok"]
    )
  })
})
