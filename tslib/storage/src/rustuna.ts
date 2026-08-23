import type * as Optuna from "@optuna/types"
import {
  JournalStorage,
  SQLite3Storage,
  type StorageAttribute,
  type StorageCategoryLabel,
  type StorageDistribution,
  type StorageStudy,
  type StorageTrial,
  type StorageWarning,
} from "rustuna/web"
import type { OptunaStorage, StorageEdit } from "./storage.js"

const EDITABLE_SCHEMA_VERSIONS = new Set([
  "v2.6.0.a",
  "v3.0.0.a",
  "v3.0.0.b",
  "v3.0.0.c",
  "v3.0.0.d",
  "v3.2.0.a",
])

type NativeStorage = JournalStorage | SQLite3Storage

export class RustunaStorage implements OptunaStorage {
  private closed = false

  private constructor(
    private readonly native: NativeStorage,
    private readonly editDisabledReason: string | undefined,
    private readonly warnings: StorageWarning[],
    readonly appliedRecords: number
  ) {}

  static openJournal(buffer: ArrayBuffer): RustunaStorage {
    const native = new JournalStorage(new Uint8Array(buffer))
    const warnings = native.warnings
    const bytes = new Uint8Array(buffer)
    const editDisabledReason =
      warnings.length > 0
        ? "This Journal contains unreadable records"
        : bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a
          ? "The final Journal record is not newline-terminated"
          : undefined
    return new RustunaStorage(
      native,
      editDisabledReason,
      warnings,
      native.appliedRecords
    )
  }

  static openSQLite(buffer: ArrayBuffer): RustunaStorage {
    const native = new SQLite3Storage(new Uint8Array(buffer))
    const editDisabledReason = native.wasWal
      ? "WAL-mode SQLite databases can be viewed but not edited safely"
      : !EDITABLE_SCHEMA_VERSIONS.has(native.schemaVersion ?? "")
        ? `SQLite schema ${
            native.schemaVersion ?? "unknown"
          } is not supported for editing`
        : undefined
    return new RustunaStorage(native, editDisabledReason, [], 0)
  }

  getWarnings(): StorageWarning[] {
    return this.warnings
  }

  getEditDisabledReason(): string | undefined {
    return this.editDisabledReason
  }

  getStudies = async (): Promise<Optuna.StudySummary[]> => {
    this.assertOpen()
    return this.native.getStudies().map(toStudySummary)
  }

  getStudy = async (studyId: number): Promise<Optuna.Study | null> => {
    this.assertOpen()
    const study = this.native.getStudy(studyId)
    if (study === undefined) {
      return null
    }
    const trials = this.native.getTrials(studyId).map(toTrial)
    const unionSearchSpace: Optuna.SearchSpaceItem[] = []
    let intersectionSearchSpace: Optuna.SearchSpaceItem[] = []
    const unionUserAttrs = new Set<string>()

    for (const [index, trial] of trials.entries()) {
      for (const { key } of trial.user_attrs) {
        unionUserAttrs.add(key)
      }
      const trialSearchSpace = trial.params.map(({ name, distribution }) => ({
        name,
        distribution,
      }))
      for (const item of trialSearchSpace) {
        if (
          !unionSearchSpace.some(
            (current) =>
              current.name === item.name &&
              isDistributionEqual(current.distribution, item.distribution)
          )
        ) {
          unionSearchSpace.push(item)
        }
      }
      intersectionSearchSpace =
        index === 0
          ? trialSearchSpace
          : intersectionSearchSpace.filter((item) =>
              trialSearchSpace.some(
                (current) =>
                  current.name === item.name &&
                  isDistributionEqual(current.distribution, item.distribution)
              )
            )
    }

    const metricNames = getSystemAttribute(study.systemAttrs, [
      "dashboard:objective_names",
      "study:metric_names",
    ])
    return {
      ...toStudySummary(study),
      union_search_space: unionSearchSpace,
      intersection_search_space: intersectionSearchSpace,
      union_user_attrs: Array.from(unionUserAttrs).map((key) => ({
        key,
        sortable: false,
      })),
      trials,
      metric_names:
        metricNames === undefined
          ? undefined
          : (JSON.parse(metricNames) as string[]),
    }
  }

  applyEdit = async (edit: StorageEdit): Promise<ArrayBuffer> => {
    this.assertOpen()
    if (this.editDisabledReason !== undefined) {
      throw new Error(this.editDisabledReason)
    }
    if (edit.kind === "createStudy") {
      this.native.createNewStudy(edit.name, edit.directions)
    } else {
      this.native.deleteStudy(edit.studyId)
    }
    return toArrayBuffer(this.native.export())
  }

  close = async (): Promise<void> => {
    if (this.closed) {
      return
    }
    this.closed = true
    this.native.free()
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("Storage is closed")
    }
  }
}

const toStudySummary = (study: StorageStudy): Optuna.StudySummary => ({
  id: study.id,
  name: study.name,
  directions: study.directions,
})

const toTrial = (trial: StorageTrial): Optuna.Trial => ({
  trial_id: trial.id,
  study_id: trial.studyId,
  number: trial.number,
  state: trial.state,
  values: trial.values,
  params: trial.params.map(({ name, internalValue, distribution }) => {
    const converted = toDistribution(distribution)
    return {
      name,
      param_internal_value: internalValue,
      param_external_value:
        converted.type === "CategoricalDistribution"
          ? converted.choices[internalValue]?.value ?? ""
          : internalValue.toString(),
      param_external_type: converted.type,
      distribution: converted,
    }
  }),
  intermediate_values: trial.intermediateValues.map(({ step, value }) => ({
    step,
    value,
  })),
  user_attrs: trial.userAttrs,
  constraints: parseConstraints(trial.systemAttrs),
  datetime_start:
    trial.datetimeStart === undefined
      ? undefined
      : new Date(trial.datetimeStart),
  datetime_complete:
    trial.datetimeComplete === undefined
      ? undefined
      : new Date(trial.datetimeComplete),
})

const toDistribution = (
  distribution: StorageDistribution
): Optuna.Distribution => {
  switch (distribution.kind) {
    case "float":
      return {
        type: "FloatDistribution",
        low: distribution.low,
        high: distribution.high,
        step: distribution.step ?? null,
        log: distribution.log,
      }
    case "int":
      return {
        type: "IntDistribution",
        low: distribution.low,
        high: distribution.high,
        step: distribution.step,
        log: distribution.log,
      }
    case "categorical":
      return {
        type: "CategoricalDistribution",
        choices: distribution.choices.map(toCategoricalChoice),
      }
  }
}

const toCategoricalChoice = (
  choice: StorageCategoryLabel
): Optuna.CategoricalChoiceType => {
  switch (choice.kind) {
    case "float":
      return { pytype: "float", value: choice.value.toString() }
    case "int":
      return { pytype: "int", value: choice.value.toString() }
    case "string":
      return { pytype: "str", value: choice.value }
    case "bool":
      return { pytype: "bool", value: choice.value ? "True" : "False" }
    case "none":
      return { pytype: "NoneType", value: "None" }
  }
}

const parseConstraints = (attrs: StorageAttribute[]): number[] => {
  const value = getSystemAttribute(attrs, ["constraints"])
  return value === undefined ? [] : (JSON.parse(value) as number[])
}

const getSystemAttribute = (
  attrs: StorageAttribute[],
  keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = attrs.find((attr) => attr.key === key)?.value
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

const isDistributionEqual = (
  left: Optuna.Distribution,
  right: Optuna.Distribution
): boolean => JSON.stringify(left) === JSON.stringify(right)

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = bytes.slice()
  return copy.buffer as ArrayBuffer
}
