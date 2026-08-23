import {
  type OptunaStorage,
  type RustunaWasmSource,
  type StorageEdit,
  type StorageWorkerFactory,
  openStorage,
} from "@optuna/storage/worker-client"
import React, {
  FC,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

export type StorageOpenOptions = {
  // Shown next to the button that closes this storage, so that the UI can say
  // which file it is holding.
  name?: string
  workerFactory?: StorageWorkerFactory
  rustunaWasm?: RustunaWasmSource
  editDisabledReason?: string
}

export const StorageContext = createContext<{
  storage: OptunaStorage | null
  storageName: string | null
  loadStorage: (
    arrayBuffer: ArrayBuffer,
    options?: StorageOpenOptions
  ) => Promise<void>
  closeStorage: () => Promise<void>
  applyEdit: (edit: StorageEdit) => Promise<void>
  downloadStorage: () => void
  editDisabledReason?: string
  dirty: boolean
  loading: boolean
  error: Error | null
  reportError: (error: unknown) => void
}>({
  storage: null,
  storageName: null,
  loadStorage: async () => {},
  closeStorage: async () => {},
  applyEdit: async () => {},
  downloadStorage: () => {},
  editDisabledReason: undefined,
  dirty: false,
  loading: false,
  error: null,
  reportError: () => {},
})

// A viewer owns at most one storage session at a time. The session is kept in a
// ref because every transition has to read the current one without waiting for
// a re-render: a second drop must be rejected before React commits `loading`.
//
// `generation` invalidates work in flight. Closing, unmounting, or starting
// another load bumps it, and a load that finds its generation stale closes the
// storage it just opened instead of publishing it.
type StorageSession = {
  generation: number
  storage: OptunaStorage | null
  loading: boolean
}

export const StorageProvider: FC<{
  children: React.ReactNode
  workerFactory?: StorageWorkerFactory
  rustunaWasm?: RustunaWasmSource
  onStorageChange?: (buffer: ArrayBuffer) => Promise<void>
}> = ({ children, workerFactory, rustunaWasm, onStorageChange }) => {
  const [storage, setActiveStorage] = useState<OptunaStorage | null>(null)
  const [storageName, setStorageName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [editDisabledReason, setEditDisabledReason] = useState<
    string | undefined
  >()
  const [dirty, setDirty] = useState(false)
  const [currentBytes, setCurrentBytes] = useState<ArrayBuffer | null>(null)
  const sessionRef = useRef<StorageSession>({
    generation: 0,
    storage: null,
    loading: false,
  })
  const editInFlightRef = useRef(false)

  const reportError = useCallback((loadError: unknown) => {
    const normalizedError =
      loadError instanceof Error
        ? loadError
        : new Error("Storage request failed")
    // StorageErrorNotifier only shows the message; keep the original error
    // around for the Webview developer tools.
    console.error("Optuna storage error", loadError)
    setError(normalizedError)
  }, [])

  const closeStorage = useCallback(async () => {
    const session = sessionRef.current
    session.generation += 1
    const currentStorage = session.storage
    session.storage = null
    setActiveStorage(null)
    setStorageName(null)
    setLoading(false)
    setError(null)
    setEditDisabledReason(undefined)
    setDirty(false)
    setCurrentBytes(null)
    if (currentStorage !== null) {
      try {
        await currentStorage.close()
      } catch (closeError) {
        reportError(closeError)
      }
    }
  }, [reportError])

  const loadStorage = useCallback(
    async (arrayBuffer: ArrayBuffer, options: StorageOpenOptions = {}) => {
      const session = sessionRef.current
      if (session.loading) {
        return
      }
      if (session.storage !== null) {
        reportError(new Error("Storage is already open"))
        return
      }

      session.loading = true
      const generation = ++session.generation
      setLoading(true)
      setError(null)
      try {
        const factory = options.workerFactory ?? workerFactory
        if (factory === undefined) {
          throw new Error("A storage worker factory is required")
        }
        const nextStorage = await openStorage(
          arrayBuffer,
          factory,
          options.rustunaWasm ?? rustunaWasm
        )

        if (generation !== session.generation) {
          await nextStorage.close()
          return
        }

        session.storage = nextStorage
        setActiveStorage(nextStorage)
        setStorageName(options.name ?? null)
        setEditDisabledReason(
          options.editDisabledReason ?? nextStorage.getEditDisabledReason()
        )
        setDirty(false)
        setCurrentBytes(null)
      } catch (loadError) {
        if (generation === session.generation) {
          reportError(loadError)
        }
      } finally {
        session.loading = false
        if (generation === session.generation) {
          setLoading(false)
        }
      }
    },
    [reportError, rustunaWasm, workerFactory]
  )

  const applyEdit = useCallback(
    async (edit: StorageEdit) => {
      const currentStorage = sessionRef.current.storage
      if (currentStorage === null) {
        throw new Error("Storage is not open")
      }
      if (editDisabledReason !== undefined) {
        throw new Error(editDisabledReason)
      }
      if (editInFlightRef.current) {
        throw new Error("Another storage edit is still in progress")
      }
      editInFlightRef.current = true
      try {
        const buffer = await currentStorage.applyEdit(edit)
        const localCopy = buffer.slice(0)
        if (onStorageChange !== undefined) {
          await onStorageChange(buffer)
        }
        setCurrentBytes(localCopy)
        setDirty(true)
      } catch (editError) {
        reportError(editError)
        throw editError
      } finally {
        editInFlightRef.current = false
      }
    },
    [editDisabledReason, onStorageChange, reportError]
  )

  const downloadStorage = useCallback(() => {
    if (currentBytes === null) {
      return
    }
    const url = URL.createObjectURL(
      new Blob([currentBytes], { type: "application/octet-stream" })
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = storageName ?? "optuna-storage"
    anchor.click()
    URL.revokeObjectURL(url)
    setDirty(false)
  }, [currentBytes, storageName])

  useEffect(() => {
    if (!dirty || IS_VSCODE) {
      return
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const session = sessionRef.current
    return () => {
      session.generation += 1
      session.loading = false
      const currentStorage = session.storage
      session.storage = null
      if (currentStorage !== null) {
        void currentStorage.close().catch(() => {})
      }
    }
  }, [])

  return (
    <StorageContext.Provider
      value={{
        storage,
        storageName,
        loadStorage,
        closeStorage,
        applyEdit,
        downloadStorage,
        editDisabledReason,
        dirty,
        loading,
        error,
        reportError,
      }}
    >
      {children}
    </StorageContext.Provider>
  )
}
