import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import HomeIcon from "@mui/icons-material/Home"
import {
  Box,
  Card,
  CardContent,
  IconButton,
  Typography,
  useTheme,
} from "@mui/material"
import React, { FC, useMemo } from "react"
import { Link, useParams } from "react-router-dom"

import { useConstants } from "../constantsProvider"
import { useStudyName } from "../state"
import { AppDrawer } from "./AppDrawer"

export const useURLVars = (): number => {
  const { studyId } = useParams<{ studyId: string }>()

  if (studyId === undefined) {
    throw new Error("studyId is not defined")
  }

  return useMemo(() => parseInt(studyId, 10), [studyId])
}

export const StudyDetailOverview: FC<{
  toggleColorMode: () => void
}> = ({ toggleColorMode }) => {
  const { url_prefix } = useConstants()

  const theme = useTheme()
  const studyId = useURLVars()
  const studyName = useStudyName(studyId)

  const title =
    studyName !== null ? `${studyName} (id=${studyId})` : `Study #${studyId}`

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
        <Typography variant="h5" sx={{ m: theme.spacing(2) }}>
          Views
        </Typography>
        <Box component="div" sx={{ display: "flex", flexWrap: "wrap" }}>
          <Card
            key="views-history"
            sx={{ margin: theme.spacing(2), width: "500px" }}
          >
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                History View
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This view shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card
            key="views-trial-selection"
            sx={{ margin: theme.spacing(2), width: "500px" }}
          >
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Trial Selection View
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This view shows ...
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Typography variant="h5" sx={{ m: theme.spacing(2) }}>
          Visualizations
        </Typography>
        <Box component="div" sx={{ display: "flex", flexWrap: "wrap" }}>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Optimization History
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This plot shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Contour
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This plot shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Pareto Front
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This plot shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Param Importance
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This plot shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Timeline
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This plot shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Parallel coordinate
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This plot shows ...
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Typography variant="h5" sx={{ m: theme.spacing(2) }}>
          Other Information
        </Typography>
        <Box component="div" sx={{ display: "flex", flexWrap: "wrap" }}>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Trials (List)
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This page shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Trials (Table)
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This page shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Study User Attributes
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This page shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Study Artifacts
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This page shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Study Note
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This page shows ...
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ margin: theme.spacing(2), width: "500px" }}>
            <CardContent>
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                Settings
              </Typography>
              <Typography
                variant="subtitle1"
                color="text.secondary"
                component="div"
              >
                This page shows ...
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </AppDrawer>
    </Box>
  )
}
