import { useAtomValue, useAtom, atom } from "jotai"
import { useSnackbar } from "notistack"
import { useEffect } from "react"
import { StudyDetail } from "../types/optuna"
import { studyDetailStateFamily, reloadIntervalState, useStudyIsPreferential } from "../state"
import { useAPIClient } from "ts/apiClientProvider"
import { atomFamily } from "jotai/utils"

export const studyDetailLoadingStateFamily = atomFamily((studyId: number) => atom<boolean>(false))

export const useLatestStudyDetail = (studyId: number): StudyDetail | null => {
  const { apiClient } = useAPIClient()
  const reloadInterval = useAtomValue(reloadIntervalState)
  const { enqueueSnackbar } = useSnackbar()
  const [studyDetail, setStudyDetail] = useAtom(studyDetailStateFamily(studyId))
  const [studyDetailLoading, setStudyDetailLoading] = useAtom(studyDetailLoadingStateFamily(studyId))
  const isPreferential = useStudyIsPreferential(studyId)

  const updateStudyDetail = (studyId: number) => {
    if (studyDetailLoading) {
      return
    }
    setStudyDetailLoading(true)

    let nLocalFixedTrials = 0
    if (studyDetail !== null) {
      const currentTrials = studyDetail.trials
      const firstUpdatable = currentTrials.findIndex((trial) =>
        ["Running", "Waiting"].includes(trial.state)
      )
      nLocalFixedTrials =
        firstUpdatable === -1 ? currentTrials.length : firstUpdatable
    }
    apiClient
      .getStudyDetail(studyId, nLocalFixedTrials)
      .then((study) => {
        setStudyDetailLoading(false)
        const currentFixedTrials =
          studyDetail !== null
            ? studyDetail.trials.slice(0, nLocalFixedTrials)
            : []
        study.trials = currentFixedTrials.concat(study.trials)
        setStudyDetail(study)
      })
      .catch((err) => {
        setStudyDetailLoading(false)
        const reason = err.response?.data.reason
        if (reason !== undefined) {
          enqueueSnackbar(`Failed to fetch study (reason=${reason})`, {
            variant: "error",
          })
        }
        console.log(err)
      })
  }

  useEffect(() => {
    updateStudyDetail(studyId)
  }, [])

  useEffect(() => {
    if (reloadInterval < 0) {
      return
    }
    const nTrials = studyDetail ? studyDetail.trials.length : 0
    let interval = reloadInterval * 1000

    // For Human-in-the-loop Optimization, the interval is set to 2 seconds
    // when the number of trials is small, and the page is "trialList" or top page of preferential.
    if (
      (!isPreferential && page === "trialList") ||
      (isPreferential && page === "top")
    ) {
      if (nTrials < 100) {
        interval = 2000
      } else if (nTrials < 500) {
        interval = 5000
      }
    }

    const intervalId = setInterval(() => {
      updateStudyDetail(studyId)
    }, interval)
    return () => clearInterval(intervalId)
  }, [reloadInterval, studyDetail, page])

  return studyDetail
}
