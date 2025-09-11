import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import HomeIcon from "@mui/icons-material/Home"
import { Box, IconButton, Typography, useTheme } from "@mui/material"
import React, { FC, useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { useConstants } from "../constantsProvider"
import { useLatestStudyDetail } from "../hooks/useLatestStudyDetail"
import { useStudyName } from "../state"
import { AppDrawer } from "./AppDrawer"
import { Contour } from "./GraphContour"

export const useURLVars = (): number => {
  const { studyId } = useParams<{ studyId: string }>()

  if (studyId === undefined) {
    throw new Error("studyId is not defined")
  }

  return useMemo(() => parseInt(studyId, 10), [studyId])
}

export const StudyDetailContour: FC<{
  toggleColorMode: () => void
}> = ({ toggleColorMode }) => {
  const { url_prefix } = useConstants()

  const theme = useTheme()
  const studyId = useURLVars()
  const studyName = useStudyName(studyId)

  const title =
    studyName !== null ? `${studyName} (id=${studyId})` : `Study #${studyId}`
  const studyDetail = useLatestStudyDetail({
    studyId: studyId,
    shortInterval: false,
  })

  const content = (
    <Box sx={{ height: "100vh", width: "100%", p: theme.spacing(2) }}>
      <Contour study={studyDetail} />
    </Box>
  )
  const toolbar = (
    <>
      <IconButton
        component={Link}
        to={url_prefix + "/"}
        sx={{ marginRight: theme.spacing(1) }}
        color="inherit"
        title="Return to the top page"
      >
        <HomeIcon />
      </IconButton>
      <ChevronRightIcon sx={{ marginRight: theme.spacing(1) }} />
      <Typography
        noWrap
        component="div"
        sx={{ fontWeight: theme.typography.fontWeightBold }}
      >
        {title}
      </Typography>
    </>
  )

  return (
    <Box component="div" sx={{ display: "flex" }}>
      <AppDrawer
        studyId={studyId}
        toggleColorMode={toggleColorMode}
        toolbar={toolbar}
      >
        {content}
      </AppDrawer>
    </Box>
  )
}
