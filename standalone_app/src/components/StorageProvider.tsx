import React, { FC, createContext, useState, useContext, Dispatch } from "react"
import { OptunaStorage } from "@optuna/tslib"

export const StorageContext = createContext<{
  storage: OptunaStorage | null
  setStorage: Dispatch<OptunaStorage | null>
}>({
  storage: null,
  setStorage: () => {},
})

export const useStorageState = (): [
  OptunaStorage | null,
  Dispatch<OptunaStorage | null>,
] => {
  const { storage, setStorage } = useContext(StorageContext)
  return [storage, setStorage]
}

export const useStorageValue = (): OptunaStorage | null => {
  const { storage } = useContext(StorageContext)
  return storage
}

export const useSetStorageState = (): Dispatch<OptunaStorage | null> => {
  const { setStorage } = useContext(StorageContext)
  return setStorage
}

export const StorageProvider: FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const [storage, setStorage] = useState<OptunaStorage | null>(null)
  return (
    <StorageContext.Provider value={{ storage, setStorage }}>
      {children}
    </StorageContext.Provider>
  )
}
