import * as Optuna from "@optuna/types"
import sqlite3InitModule from "./sqlite_init.js"
import type { StorageEdit } from "./storage"

// Where to take sqlite3.wasm from.
//
// sqlite-wasm normally derives that URL from its own script URL, which stops
// working once this backend runs inside a Worker: a Worker started from a blob:
// URL, which is how a VS Code Webview has to start one, cannot resolve anything
// relative to itself. The caller therefore says where the wasm is.
//
//   - `sqliteWasmUrl`: sqlite-wasm fetches it. Used where the bundler emits
//     sqlite3.wasm next to the app and the Worker may fetch it.
//   - `sqliteWasmBuffer`: the bytes, fetched by the caller. A VS Code Webview
//     needs this: extension assets are served by the Webview's service worker,
//     which does not answer requests coming from a blob: URL Worker, so the
//     document fetches the asset and transfers it.
//
// A third option is to inline the wasm into the JavaScript as base64, which is
// what the VS Code build has done so far. It keeps distribution simple, but it
// turns 931KB into roughly 1.24MB of JavaScript source that has to be parsed on
// every load, and it rules out WebAssembly.instantiateStreaming() as well as
// caching the wasm separately from the bundle.
export type SQLiteWasmOptions = {
  sqliteWasmUrl?: string
  sqliteWasmBuffer?: ArrayBuffer
}

// TODO(porink0424): Refactor to common function with journal.ts (current workaround duplicates code due to missing file extensions in tsc build output).
const isDistributionEqual = (
  a: Optuna.Distribution,
  b: Optuna.Distribution
) => {
  if (a.type !== b.type) {
    return false
  }

  if (a.type === "IntDistribution" || a.type === "FloatDistribution") {
    if (b.type !== "IntDistribution" && b.type !== "FloatDistribution") {
      throw new Error("Invalid distribution type")
    }
    return (
      a.low === b.low &&
      a.high === b.high &&
      a.step === b.step &&
      a.log === b.log
    )
  }
  if (a.type === "CategoricalDistribution") {
    if (b.type !== "CategoricalDistribution") {
      throw new Error("Invalid distribution type")
    }
    return JSON.stringify(a.choices) === JSON.stringify(b.choices)
  }

  throw new Error("Invalid distribution type")
}

type SQLite3DB = {
  pointer: number
  exec(options: {
    sql: string
    bind?: (string | number | null)[]
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    callback?: (...args: any[]) => void
  }): void
  close(): void
}

type SQLite3Api = {
  capi: {
    SQLITE_DESERIALIZE_FREEONCLOSE: number
    SQLITE_DESERIALIZE_RESIZEABLE: number
    sqlite3_deserialize: (
      pointer: number,
      schema: string,
      data: number,
      size: number,
      bufferSize: number,
      flags: number
    ) => number
    sqlite3_js_db_export: (pointer: number) => Uint8Array
  }
}

const isWalDatabase = (buffer: ArrayBuffer): boolean => {
  if (buffer.byteLength < 20) {
    return false
  }
  const header = new Uint8Array(buffer)
  return header[18] === 2 || header[19] === 2
}

const normalizeWalHeader = (buffer: ArrayBuffer): ArrayBuffer => {
  if (!isWalDatabase(buffer)) {
    return buffer
  }
  const copy = new Uint8Array(buffer).slice()
  copy[18] = 1
  copy[19] = 1
  return copy.buffer
}

const EDITABLE_SCHEMA_VERSIONS = new Set([
  "v2.6.0.a",
  "v3.0.0.a",
  "v3.0.0.b",
  "v3.0.0.c",
  "v3.0.0.d",
  "v3.2.0.a",
])

export class SQLite3Storage {
  db: Promise<SQLite3DB>
  summaries_cache: Optuna.StudySummary[] | null
  private closed = false
  private sqlite3: SQLite3Api | null = null
  private readonly wasWal: boolean
  constructor(arrayBuffer: ArrayBuffer, options: SQLiteWasmOptions = {}) {
    this.wasWal = isWalDatabase(arrayBuffer)
    this.db = this.initDB(normalizeWalHeader(arrayBuffer), options)
    // A failed open is closed without ever being queried, so keep a rejection
    // handler attached to avoid an unhandled rejection in the meantime.
    this.db.catch(() => {})
    this.summaries_cache = null
  }

  async initDB(
    arrayBuffer: ArrayBuffer,
    options: SQLiteWasmOptions
  ): Promise<SQLite3DB> {
    const initOptions: Parameters<typeof sqlite3InitModule>[0] & {
      wasmBinary?: ArrayBuffer
    } = {
      print: console.log,
      printErr: console.log,
    }
    // Without locateFile, sqlite-wasm resolves sqlite3.wasm as `new
    // URL("sqlite3.wasm", import.meta.url).href`. A bundler rewrites that to the
    // asset it emitted, which is what makes the default work on the main thread,
    // so locateFile is only set when this call actually knows better. Setting it
    // unconditionally would replace that rewritten URL with a bare relative path
    // that resolves against the page instead.
    if (options.sqliteWasmBuffer !== undefined) {
      initOptions.wasmBinary = options.sqliteWasmBuffer
      // The binary is already here. locateFile only keeps sqlite-wasm from
      // evaluating the fallback above, which throws in a Worker started from a
      // blob: URL because nothing resolves relative to it. What it returns is
      // never fetched.
      initOptions.locateFile = (path: string) => path
    } else if (options.sqliteWasmUrl !== undefined) {
      initOptions.locateFile = (path: string) =>
        path === "sqlite3.wasm" ? (options.sqliteWasmUrl as string) : path
    }

    const sqlite3 = (await sqlite3InitModule(initOptions)) as SQLite3Api & {
      wasm: { allocFromTypedArray: (value: ArrayBuffer) => number }
      oo1: { DB: new () => SQLite3DB & { checkRc: (rc: number) => void } }
    }
    this.sqlite3 = sqlite3
    let db: SQLite3DB | null = null
    try {
      const p = sqlite3.wasm.allocFromTypedArray(arrayBuffer)
      const sqliteDb = new sqlite3.oo1.DB()
      db = sqliteDb
      const rc = sqlite3.capi.sqlite3_deserialize(
        sqliteDb.pointer,
        "main",
        p,
        arrayBuffer.byteLength,
        arrayBuffer.byteLength,
        sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
          sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
      )
      sqliteDb.checkRc(rc)
      return sqliteDb
    } catch (error) {
      try {
        db?.close()
      } catch {
        // Preserve the initialization error.
      }
      throw error
    }
  }

  async waitUntilReady(): Promise<void> {
    await this.db
  }

  // Whether this database is an Optuna storage at all. Any SQLite file
  // deserializes, so a database that Optuna never wrote would open here and only
  // fail on the first query.
  hasOptunaSchema = async (): Promise<boolean> => {
    const db = await this.db
    let tables = 0
    db.exec({
      sql:
        "SELECT name FROM sqlite_master WHERE type = 'table'" +
        " AND name IN ('studies', 'alembic_version')",
      callback: () => {
        tables++
      },
    })
    return tables === 2
  }

  getEditDisabledReason = async (): Promise<string | undefined> => {
    if (this.wasWal) {
      return "WAL-mode SQLite databases can be viewed but not edited safely"
    }
    const schemaVersion = getSchemaVersion(await this.db)
    if (!EDITABLE_SCHEMA_VERSIONS.has(schemaVersion)) {
      return `SQLite schema ${
        schemaVersion || "unknown"
      } is not supported for editing`
    }
    return undefined
  }

  applyEdit = async (edit: StorageEdit): Promise<ArrayBuffer> => {
    if (this.closed) {
      throw new Error("Storage is closed")
    }
    const editDisabledReason = await this.getEditDisabledReason()
    if (editDisabledReason !== undefined) {
      throw new Error(editDisabledReason)
    }
    const db = await this.db
    db.exec({ sql: "BEGIN IMMEDIATE" })
    try {
      if (edit.kind === "createStudy") {
        createStudy(db, edit.name, edit.directions)
      } else {
        deleteStudy(db, edit.studyId)
      }
      db.exec({ sql: "COMMIT" })
    } catch (error) {
      try {
        db.exec({ sql: "ROLLBACK" })
      } catch {
        // Preserve the edit error.
      }
      throw error
    }
    this.summaries_cache = null
    return await this.exportFile()
  }

  exportFile = async (): Promise<ArrayBuffer> => {
    if (this.closed || this.sqlite3 === null) {
      throw new Error("Storage is closed")
    }
    const db = await this.db
    const exported = this.sqlite3.capi.sqlite3_js_db_export(db.pointer)
    return exported.slice().buffer as ArrayBuffer
  }

  getStudies = async (): Promise<Optuna.StudySummary[]> => {
    if (this.closed) {
      throw new Error("Storage is closed")
    }
    const db = await this.db
    this.summaries_cache = getStudySummaries(db)
    return this.summaries_cache
  }

  getStudy = async (studyId: number): Promise<Optuna.Study | null> => {
    if (this.closed) {
      throw new Error("Storage is closed")
    }
    const db = await this.db
    const schemaVersion = getSchemaVersion(db)
    if (!isSupportedSchema(schemaVersion)) {
      return null
    }
    if (this.summaries_cache === null) {
      this.summaries_cache = getStudySummaries(db)
    }
    const summary = this.summaries_cache.find(
      (summary) => summary.id === studyId
    )
    if (summary === undefined) {
      return null
    }
    return getStudy(db, schemaVersion, summary)
  }

  close = async (): Promise<void> => {
    if (this.closed) {
      return
    }
    this.closed = true
    try {
      const db = await this.db
      db.close()
    } catch {
      // close() is idempotent and never fails. An initialization failure was
      // already handed to whoever awaited the storage.
    }
  }
}

const getSchemaVersion = (db: SQLite3DB): string => {
  let schemaVersion = ""
  db.exec({
    sql: "SELECT version_num FROM alembic_version LIMIT 1",
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    callback: (vals: any[]) => {
      schemaVersion = vals[0]
    },
  })
  return schemaVersion
}

const isSupportedSchema = (schemaVersion: string): boolean => {
  const lowestVersion = "v2.6.0.a" // supported: "v3.2.0.a", "v3.0.0.{a,b,c,d}", "v2.6.0.a"
  if (schemaVersion === lowestVersion) return true
  return isGreaterSchemaVersion(schemaVersion, lowestVersion)
}

const isGreaterSchemaVersion = (
  leftVersion: string,
  rightVersion: string
): boolean => {
  // return leftVersion > rightVersion
  const leftSuffix = leftVersion.split(".").reverse()[0]
  const rightSuffix = rightVersion.split(".").reverse()[0]
  const leftVersion_ = leftVersion.replace(/\D/g, "")
  const rightVersion_ = rightVersion.replace(/\D/g, "")

  const left = Number(leftVersion_)
  const right = Number(rightVersion_)
  if (left === right) return leftSuffix > rightSuffix
  return left > right
}

const queryExists = (
  db: SQLite3DB,
  sql: string,
  bind: (string | number | null)[]
): boolean => {
  let exists = false
  db.exec({
    sql,
    bind,
    callback: () => {
      exists = true
    },
  })
  return exists
}

const tableExists = (db: SQLite3DB, table: string): boolean => {
  return queryExists(
    db,
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [table]
  )
}

const createStudy = (
  db: SQLite3DB,
  name: string,
  directions: ("minimize" | "maximize")[]
): void => {
  if (name.trim() === "") {
    throw new Error("Study name must not be empty")
  }
  if (directions.length === 0) {
    throw new Error("At least one study direction is required")
  }
  if (
    directions.some(
      (direction) => direction !== "minimize" && direction !== "maximize"
    )
  ) {
    throw new Error("Invalid study direction")
  }
  if (
    queryExists(db, "SELECT 1 FROM studies WHERE study_name = ? LIMIT 1", [
      name,
    ])
  ) {
    throw new Error(`A study named '${name}' already exists`)
  }
  db.exec({ sql: "INSERT INTO studies (study_name) VALUES (?)", bind: [name] })
  let studyId: number | null = null
  db.exec({
    sql: "SELECT last_insert_rowid()",
    callback: (values: unknown[]) => {
      studyId = Number(values[0])
    },
  })
  if (studyId === null) {
    throw new Error("Failed to obtain the new study ID")
  }
  directions.forEach((direction, objective) => {
    db.exec({
      sql:
        "INSERT INTO study_directions (direction, study_id, objective)" +
        " VALUES (?, ?, ?)",
      bind: [
        direction === "minimize" ? "MINIMIZE" : "MAXIMIZE",
        studyId,
        objective,
      ],
    })
  })
}

const deleteStudy = (db: SQLite3DB, studyId: number): void => {
  if (!Number.isSafeInteger(studyId)) {
    throw new Error("Invalid study ID")
  }
  if (
    !queryExists(db, "SELECT 1 FROM studies WHERE study_id = ? LIMIT 1", [
      studyId,
    ])
  ) {
    throw new Error(`Study ${studyId} does not exist`)
  }

  const trialTables = [
    "trial_values",
    "trial_params",
    "trial_user_attributes",
    "trial_system_attributes",
    "trial_intermediate_values",
    "trial_heartbeats",
  ]
  for (const table of trialTables) {
    if (tableExists(db, table)) {
      db.exec({
        sql: `DELETE FROM ${table} WHERE trial_id IN (SELECT trial_id FROM trials WHERE study_id = ?)`,
        bind: [studyId],
      })
    }
  }
  db.exec({ sql: "DELETE FROM trials WHERE study_id = ?", bind: [studyId] })
  for (const table of [
    "study_directions",
    "study_user_attributes",
    "study_system_attributes",
  ]) {
    if (tableExists(db, table)) {
      db.exec({
        sql: `DELETE FROM ${table} WHERE study_id = ?`,
        bind: [studyId],
      })
    }
  }
  db.exec({ sql: "DELETE FROM studies WHERE study_id = ?", bind: [studyId] })
}

const getStudySummaries = (db: SQLite3DB): Optuna.StudySummary[] => {
  const summaries: Optuna.StudySummary[] = []
  db.exec({
    sql:
      "SELECT s.study_id, s.study_name, sd.direction, sd.objective" +
      " FROM studies AS s INNER JOIN study_directions AS sd" +
      " ON s.study_id = sd.study_id ORDER BY sd.study_direction_id",
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    callback: (vals: any[]) => {
      const studyId = vals[0]
      const studyName = vals[1]
      const direction: Optuna.StudyDirection =
        vals[2] === "MINIMIZE" ? "minimize" : "maximize"
      const objective = vals[3]

      if (objective === 0) {
        summaries.push({
          id: studyId,
          name: studyName,
          directions: [direction],
        })
        return
      }
      const index = summaries.findIndex((s) => s.id === studyId)
      summaries[index].directions.push(direction)
    },
  })
  return summaries
}

const getStudy = (
  db: SQLite3DB,
  schemaVersion: string,
  summary: Optuna.StudySummary
): Optuna.Study => {
  const study: Optuna.Study = {
    id: summary.id,
    name: summary.name,
    directions: summary.directions,
    union_search_space: [],
    intersection_search_space: [],
    union_user_attrs: [],
    trials: [],
  }

  const studySystemAttrs = getStudySystemAttributes(db, summary.id)
  if (studySystemAttrs !== undefined) {
    study.metric_names = studySystemAttrs.metric_names
  }

  let intersectionSearchSpace: Optuna.SearchSpaceItem[] = []
  study.trials = getTrials(db, summary.id, schemaVersion)
  for (const trial of study.trials) {
    const userAttrs = getTrialUserAttributes(db, trial.trial_id)
    for (const attr of userAttrs) {
      if (study.union_user_attrs.findIndex((s) => s.key === attr.key) === -1) {
        study.union_user_attrs.push({ key: attr.key, sortable: false })
      }
    }

    const systemAttrs = getTrialSystemAttributes(db, trial.trial_id)
    if (systemAttrs !== undefined) {
      trial.constraints = systemAttrs.constraints
    }

    const params = getTrialParams(db, trial.trial_id)
    for (const param of params) {
      if (
        study.union_search_space.findIndex((s) => s.name === param.name) === -1
      ) {
        study.union_search_space.push({
          name: param.name,
          distribution: param.distribution,
        })
      }
    }
    if (intersectionSearchSpace.length === 0) {
      intersectionSearchSpace = params.map((param) => ({
        name: param.name,
        distribution: param.distribution,
      }))
    } else {
      intersectionSearchSpace = intersectionSearchSpace.filter((item) => {
        return params.some(
          (param) =>
            item.name === param.name &&
            isDistributionEqual(item.distribution, param.distribution)
        )
      })
    }
    trial.params = params
    trial.user_attrs = userAttrs
  }
  study.intersection_search_space = intersectionSearchSpace
  return study
}

const getTrials = (
  db: SQLite3DB,
  studyId: number,
  schemaVersion: string
): Optuna.Trial[] => {
  const trials: Optuna.Trial[] = []
  db.exec({
    sql: `SELECT trial_id, number, state, datetime_start, datetime_complete FROM trials WHERE study_id = ${studyId} ORDER BY number`,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    callback: (vals: any[]) => {
      const trialId = vals[0]
      const state: Optuna.TrialState =
        vals[2] === "COMPLETE"
          ? "Complete"
          : vals[2] === "PRUNED"
            ? "Pruned"
            : vals[2] === "RUNNING"
              ? "Running"
              : vals[2] === "WAITING"
                ? "Waiting"
                : "Fail"
      const trial: Optuna.Trial = {
        trial_id: trialId,
        number: vals[1],
        study_id: studyId,
        state: state,
        values: getTrialValues(db, trialId, schemaVersion),
        intermediate_values: getTrialIntermediateValues(
          db,
          trialId,
          schemaVersion
        ),
        params: [], // Set this column later
        user_attrs: [], // Set this column later
        constraints: [],
        datetime_start: new Date(vals[3]),
        datetime_complete: new Date(vals[4]),
      }
      trials.push(trial)
    },
  })
  return trials
}

const getTrialValues = (
  db: SQLite3DB,
  trialId: number,
  schemaVersion: string
): number[] => {
  const values: number[] = []
  if (isGreaterSchemaVersion(schemaVersion, "v3.0.0.c")) {
    db.exec({
      sql: `SELECT value, value_type FROM trial_values WHERE trial_id = ${trialId} ORDER BY objective`,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      callback: (vals: any[]) => {
        values.push(
          vals[1] === "INF_NEG"
            ? -Infinity
            : vals[1] === "INF_POS"
              ? Infinity
              : vals[0]
        )
      },
    })
  } else {
    db.exec({
      sql: `SELECT value FROM trial_values WHERE trial_id = ${trialId} ORDER BY objective`,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      callback: (vals: any[]) => {
        values.push(vals[0])
      },
    })
  }
  return values
}

const getTrialParams = (
  db: SQLite3DB,
  trialId: number
): Optuna.TrialParam[] => {
  const params: Optuna.TrialParam[] = []
  db.exec({
    sql: `SELECT param_name, param_value, distribution_json FROM trial_params WHERE trial_id = ${trialId}`,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    callback: (vals: any[]) => {
      const distribution = parseDistributionJSON(vals[2])
      params.push({
        name: vals[0],
        param_internal_value: vals[1],
        param_external_type: distribution.type,
        param_external_value: paramInternalValueToExternalValue(
          distribution,
          vals[1]
        ),
        distribution: distribution,
      })
    },
  })
  return params
}

const paramInternalValueToExternalValue = (
  distribution: Optuna.Distribution,
  internalValue: number
) => {
  if (distribution.type === "FloatDistribution") {
    return internalValue.toString()
  }
  if (distribution.type === "IntDistribution") {
    return internalValue.toString()
  }
  return distribution.choices[internalValue].value
}

const parseDistributionJSON = (t: string): Optuna.Distribution => {
  const parsed = JSON.parse(t)
  if (parsed.name === "FloatDistribution") {
    return {
      type: "FloatDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.step as number,
      log: parsed.attributes.log as boolean,
    }
  }
  if (parsed.name === "UniformDistribution") {
    return {
      type: "FloatDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: null,
      log: false,
    }
  }
  if (parsed.name === "LogUniformDistribution") {
    return {
      type: "FloatDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: null,
      log: true,
    }
  }
  if (parsed.name === "DiscreteUniformDistribution") {
    return {
      type: "FloatDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.q,
      log: false,
    }
  }
  if (parsed.name === "IntDistribution") {
    return {
      type: "IntDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.step as number,
      log: parsed.attributes.log as boolean,
    }
  }
  if (parsed.name === "IntUniformDistribution") {
    return {
      type: "IntDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.step as number,
      log: false,
    }
  }
  if (parsed.name === "IntLogUniformDistribution") {
    return {
      type: "IntDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.step as number,
      log: true,
    }
  }
  return {
    type: "CategoricalDistribution",
    choices: parsed.attributes.choices.map((choice: string) => ({
      pytype: "str",
      value: choice,
    })),
  }
}

const getStudySystemAttributes = (db: SQLite3DB, studyId: number) => {
  let attrs: { metric_names: string[] } | undefined
  db.exec({
    sql: `SELECT key, value_json FROM study_system_attributes WHERE study_id = ${studyId} AND key = 'dashboard:objective_names'`,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    callback: (vals: any[]) => {
      attrs = {
        metric_names: JSON.parse(vals[1]),
      }
    },
  })
  return attrs
}

const getTrialUserAttributes = (
  db: SQLite3DB,
  trialId: number
): Optuna.Attribute[] => {
  const attrs: Optuna.Attribute[] = []
  db.exec({
    sql: `SELECT key, value_json FROM trial_user_attributes WHERE trial_id = ${trialId}`,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    callback: (vals: any[]) => {
      attrs.push({
        key: vals[0],
        value: vals[1],
      })
    },
  })
  return attrs
}

const getTrialSystemAttributes = (db: SQLite3DB, trialId: number) => {
  let attrs: { constraints: number[] } | undefined
  db.exec({
    sql: `SELECT key, value_json FROM trial_system_attributes WHERE trial_id = ${trialId} AND key = 'constraints'`,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    callback: (vals: any[]) => {
      attrs = {
        constraints: JSON.parse(vals[1]),
      }
    },
  })
  return attrs
}

const getTrialIntermediateValues = (
  db: SQLite3DB,
  trialId: number,
  schemaVersion: string
): Optuna.TrialIntermediateValue[] => {
  const values: Optuna.TrialIntermediateValue[] = []
  if (isGreaterSchemaVersion(schemaVersion, "v3.0.0.c")) {
    db.exec({
      sql: `SELECT step, intermediate_value, intermediate_value_type FROM trial_intermediate_values WHERE trial_id = ${trialId} ORDER BY step`,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      callback: (vals: any[]) => {
        values.push({
          step: vals[0],
          value:
            vals[2] === "INF_NEG"
              ? -Infinity
              : vals[2] === "INF_POS"
                ? Infinity
                : vals[2] === "NAN"
                  ? NaN
                  : vals[1],
        })
      },
    })
  } else {
    db.exec({
      sql: `SELECT step, intermediate_value FROM trial_intermediate_values WHERE trial_id = ${trialId} ORDER BY step`,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      callback: (vals: any[]) => {
        values.push({
          step: vals[0],
          value: vals[1],
        })
      },
    })
  }
  return values
}
