import * as Optuna from "@optuna/types"

export type OptunaStorage = {
  getStudies: () => Promise<Optuna.StudySummary[]>
  getStudy: (studyId: number) => Promise<Optuna.Study | null>
  getEditDisabledReason: () => string | undefined
  applyEdit: (edit: StorageEdit) => Promise<ArrayBuffer>
  close: () => Promise<void>
}

export type StorageEdit =
  | {
      kind: "createStudy"
      name: string
      directions: Optuna.StudyDirection[]
    }
  | { kind: "deleteStudy"; studyId: number }
