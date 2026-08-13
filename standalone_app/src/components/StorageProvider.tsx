import type { OptunaStorage } from "@optuna/storage"
import {
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

export const StorageContext = createContext<{
  storage: OptunaStorage | null
  loadStorage: (
    arrayBuffer: ArrayBuffer,
    workerFactory?: StorageWorkerFactory,
    sqliteWasmUrl?: string,
    sqliteWasmBuffer?: ArrayBuffer
  ) => Promise<void>
  closeStorage: () => Promise<void>
  loading: boolean
  error: Error | null
  reportError: (error: unknown) => void
}>({
  storage: null,
  loadStorage: async () => {},
  closeStorage: async () => {},
  loading: false,
  error: null,
  reportError: () => {},
})

export const StorageProvider: FC<{
  children: React.ReactNode
  workerFactory?: StorageWorkerFactory
  sqliteWasmUrl?: string
}> = ({ children, workerFactory, sqliteWasmUrl }) => {
  const [storage, setStorage] = useState<OptunaStorage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const storageRef = useRef<OptunaStorage | null>(null)
  const loadingRef = useRef(false)
  const generationRef = useRef(0)
  const mountedRef = useRef(true)

  const reportError = useCallback((loadError: unknown) => {
    const normalizedError =
      loadError instanceof Error
        ? loadError
        : new Error("Storage request failed")
    // The VS Code Webview has no UI for this yet, so keep a console trace there.
    console.error("Optuna storage error", loadError)
    if (mountedRef.current) {
      setError(normalizedError)
    }
  }, [])

  const closeStorage = useCallback(async () => {
    generationRef.current += 1
    const currentStorage = storageRef.current
    storageRef.current = null
    if (mountedRef.current) {
      setStorage(null)
      setLoading(false)
      setError(null)
    }
    if (currentStorage !== null) {
      try {
        await currentStorage.close()
      } catch (closeError) {
        reportError(closeError)
      }
    }
  }, [reportError])

  const loadStorage = useCallback(
    async (
      arrayBuffer: ArrayBuffer,
      overrideWorkerFactory?: StorageWorkerFactory,
      overrideSqliteWasmUrl?: string,
      overrideSqliteWasmBuffer?: ArrayBuffer
    ) => {
      if (!mountedRef.current || loadingRef.current) {
        return
      }
      if (storageRef.current !== null) {
        reportError(new Error("Storage is already open"))
        return
      }

      loadingRef.current = true
      const generation = ++generationRef.current
      setLoading(true)
      setError(null)
      try {
        const factory = overrideWorkerFactory ?? workerFactory
        if (factory === undefined) {
          throw new Error("A storage worker factory is required")
        }
        const nextStorage = await openStorage(
          arrayBuffer,
          factory,
          overrideSqliteWasmUrl ?? sqliteWasmUrl,
          overrideSqliteWasmBuffer
        )

        if (!mountedRef.current || generation !== generationRef.current) {
          await nextStorage.close()
          return
        }

        storageRef.current = nextStorage
        setStorage(nextStorage)
      } catch (loadError) {
        if (mountedRef.current && generation === generationRef.current) {
          reportError(loadError)
        }
      } finally {
        loadingRef.current = false
        if (mountedRef.current && generation === generationRef.current) {
          setLoading(false)
        }
      }
    },
    [reportError, sqliteWasmUrl, workerFactory]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      loadingRef.current = false
      const currentStorage = storageRef.current
      storageRef.current = null
      if (currentStorage !== null) {
        void currentStorage.close().catch(() => {})
      }
    }
  }, [])

  return (
    <StorageContext.Provider
      value={{
        storage,
        loadStorage,
        closeStorage,
        loading,
        error,
        reportError,
      }}
    >
      {children}
    </StorageContext.Provider>
  )
}
