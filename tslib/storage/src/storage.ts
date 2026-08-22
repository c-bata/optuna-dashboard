import * as Optuna from "@optuna/types"

export type OptunaStorage = {
  getStudies: () => Promise<Optuna.StudySummary[]>
  getStudy: (studyId: number) => Promise<Optuna.Study | null>
  close: () => Promise<void>
}

export type StudyDirection = "minimize" | "maximize"

export type StorageEdit =
  | { kind: "createStudy"; name: string; directions: StudyDirection[] }
  | { kind: "deleteStudy"; studyId: number }

export type StorageCapabilities = {
  editable: boolean
  readOnlyReason?: string
}

export type StorageEditResult = {
  revision: number
  buffer: ArrayBuffer
}

export type EditableOptunaStorage = OptunaStorage & {
  getCapabilities: () => StorageCapabilities
  applyEdit: (edit: StorageEdit) => Promise<StorageEditResult>
}
