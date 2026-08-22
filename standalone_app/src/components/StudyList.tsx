import { Add, Delete, Download, Search } from "@mui/icons-material"
import Brightness4Icon from "@mui/icons-material/Brightness4"
import Brightness7Icon from "@mui/icons-material/Brightness7"
import SortIcon from "@mui/icons-material/Sort"
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  SvgIcon,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material"
import { styled } from "@mui/system"
import * as Optuna from "@optuna/types"
import {
  FC,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Link } from "react-router-dom"
import { StorageLoader } from "./StorageLoader"
import { StorageContext } from "./StorageProvider"

export const StudyList: FC<{
  toggleColorMode: () => void
}> = ({ toggleColorMode }) => {
  const theme = useTheme()
  const {
    storage,
    storageName,
    closeStorage,
    applyEdit,
    downloadStorage,
    capabilities,
    editRevision,
    dirty,
    reportError,
  } = useContext(StorageContext)
  const [studies, setStudies] = useState<Optuna.StudySummary[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [studyName, setStudyName] = useState("")
  const [directions, setDirections] = useState<("minimize" | "maximize")[]>([
    "minimize",
  ])
  const [editing, setEditing] = useState(false)

  const [_studyFilterText, setStudyFilterText] = useState<string>("")
  const [sortBy, setSortBy] = useState<"id-asc" | "id-desc">("id-asc")
  const studyFilterText = useDeferredValue(_studyFilterText)
  useEffect(() => {
    let active = true
    const requestedRevision = editRevision
    const fetchStudies = async () => {
      if (storage === null) {
        setStudies([])
        return
      }
      try {
        const studies = await storage.getStudies()
        if (active && requestedRevision === editRevision) {
          setStudies(studies)
        }
      } catch (error) {
        if (active) {
          reportError(error)
        }
      }
    }
    void fetchStudies()
    return () => {
      active = false
    }
  }, [editRevision, reportError, storage])

  const createStudy = async () => {
    setEditing(true)
    try {
      await applyEdit({ kind: "createStudy", name: studyName, directions })
      setCreateOpen(false)
      setStudyName("")
      setDirections(["minimize"])
    } catch {
      // StorageProvider reports the actionable error.
    } finally {
      setEditing(false)
    }
  }

  const deleteStudy = async (study: Optuna.StudySummary) => {
    const autoSaveNote = IS_VSCODE
      ? " If Auto Save is enabled, this may be saved immediately."
      : ""
    if (
      !window.confirm(
        `Delete study '${study.name}' and all of its trials?${autoSaveNote}`
      )
    ) {
      return
    }
    setEditing(true)
    try {
      await applyEdit({ kind: "deleteStudy", studyId: study.id })
    } catch {
      // StorageProvider reports the actionable error.
    } finally {
      setEditing(false)
    }
  }
  const filteredStudies = useMemo(() => {
    const studyFilter = (row: Optuna.StudySummary): boolean => {
      const keywords = studyFilterText.split(" ")
      return !keywords.every((k) => {
        if (k === "") {
          return true
        }
        return row.name.indexOf(k) >= 0
      })
    }
    let filteredStudies: Optuna.StudySummary[] = studies.filter(
      (s) => !studyFilter(s)
    )
    if (sortBy === "id-desc") {
      filteredStudies = filteredStudies.reverse()
    }
    return filteredStudies
  }, [studyFilterText, studies, sortBy])

  const Select = styled(TextField)(({ theme }) => ({
    "& .MuiInputBase-input": {
      // vertical padding + font size from searchIcon
      paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    },
  }))
  const sortBySelect = (
    <Box
      sx={{
        position: "relative",
        borderRadius: theme.shape.borderRadius,
        margin: theme.spacing(0, 2),
      }}
    >
      <Box
        sx={{
          padding: theme.spacing(0, 2),
          height: "100%",
          position: "absolute",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SortIcon />
      </Box>
      <Select
        select
        value={sortBy}
        onChange={(e) => {
          setSortBy(e.target.value as "id-asc" | "id-desc")
        }}
      >
        <MenuItem value={"id-asc"}>Sort ascending</MenuItem>
        <MenuItem value={"id-desc"}>Sort descending</MenuItem>
      </Select>
    </Box>
  )

  return (
    <div>
      <AppBar position="static">
        <Container
          sx={{
            "@media (min-width: 1280px)": {
              maxWidth: "100%",
            },
          }}
        >
          <Toolbar>
            <Typography variant="h6">Optuna Dashboard (Wasm ver.)</Typography>
            <Box sx={{ flexGrow: 1 }} />
            {!IS_VSCODE && storageName !== null && (
              // Says which file the studies below come from, and closing it is
              // how another file is opened: the loader comes back with it.
              <Tooltip title="Close this file">
                <Chip
                  label={storageName}
                  variant="outlined"
                  onDelete={() => {
                    if (
                      !dirty ||
                      window.confirm(
                        "Discard edits that have not been downloaded?"
                      )
                    ) {
                      void closeStorage()
                    }
                  }}
                  sx={{
                    marginRight: theme.spacing(1),
                    maxWidth: "16rem",
                    color: "inherit",
                    borderColor: "currentColor",
                    "& .MuiChip-deleteIcon": {
                      color: "inherit",
                      opacity: 0.7,
                      "&:hover": { opacity: 1 },
                    },
                  }}
                />
              </Tooltip>
            )}
            <IconButton
              onClick={() => {
                toggleColorMode()
              }}
              color="inherit"
              title={
                theme.palette.mode === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme.palette.mode === "dark" ? (
                <Brightness7Icon />
              ) : (
                <Brightness4Icon />
              )}
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>
      <Container
        sx={{
          "@media (min-width: 1280px)": {
            maxWidth: "100%",
          },
        }}
      >
        <Card sx={{ margin: theme.spacing(2) }}>
          <CardContent>
            <Box sx={{ display: "flex" }}>
              <TextField
                onChange={(e) => {
                  setStudyFilterText(e.target.value)
                }}
                id="search-study"
                variant="outlined"
                placeholder="Search study"
                fullWidth
                sx={{ maxWidth: 500 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SvgIcon fontSize="small" color="action">
                        <Search />
                      </SvgIcon>
                    </InputAdornment>
                  ),
                }}
              />
              {sortBySelect}
              <Box sx={{ flexGrow: 1 }} />
              {!IS_VSCODE && dirty && (
                <Button
                  startIcon={<Download />}
                  onClick={downloadStorage}
                  sx={{ marginRight: theme.spacing(1) }}
                >
                  Download modified file
                </Button>
              )}
              {capabilities.editable && (
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setCreateOpen(true)}
                  disabled={editing}
                >
                  Create Study
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>
        {storage !== null && !capabilities.editable && (
          <Alert severity="info" sx={{ margin: theme.spacing(2) }}>
            Read-only: {capabilities.readOnlyReason ?? "editing is unavailable"}
          </Alert>
        )}
        <Box sx={{ display: "flex", flexWrap: "wrap" }}>
          {filteredStudies.map((study) => (
            <Card
              key={study.id}
              sx={{ margin: theme.spacing(2), width: "500px" }}
            >
              <Box sx={{ display: "flex", alignItems: "stretch" }}>
                <CardActionArea component={Link} to={`/study/${study.id}`}>
                  <CardContent>
                    <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                      {study.id}. {study.name}
                    </Typography>
                    <Typography
                      variant="subtitle1"
                      color="text.secondary"
                      component="div"
                    >
                      {`Direction: ${study.directions
                        .map((d) => d.toUpperCase())
                        .join(", ")}`}
                    </Typography>
                  </CardContent>
                </CardActionArea>
                {capabilities.editable && (
                  <Tooltip title="Delete study">
                    <IconButton
                      aria-label={`Delete ${study.name}`}
                      onClick={() => void deleteStudy(study)}
                      disabled={editing}
                      sx={{ margin: theme.spacing(1) }}
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Card>
          ))}
        </Box>
        {!IS_VSCODE && storage === null && <StorageLoader />}
      </Container>
      <Dialog
        open={createOpen}
        onClose={() => !editing && setCreateOpen(false)}
      >
        <DialogTitle>Create Study</DialogTitle>
        <DialogContent sx={{ minWidth: 420 }}>
          <TextField
            autoFocus
            fullWidth
            label="Study name"
            value={studyName}
            onChange={(event) => setStudyName(event.target.value)}
            sx={{ marginTop: theme.spacing(1), marginBottom: theme.spacing(2) }}
          />
          {directions.map((direction, index) => (
            <TextField
              // Objective rows are append-only and only the final row is removed.
              // biome-ignore lint/suspicious/noArrayIndexKey: The position is the objective identity.
              key={index}
              select
              fullWidth
              label={`Objective ${index + 1}`}
              value={direction}
              onChange={(event) => {
                const next = [...directions]
                next[index] = event.target.value as "minimize" | "maximize"
                setDirections(next)
              }}
              sx={{ marginBottom: theme.spacing(1) }}
            >
              <MenuItem value="minimize">Minimize</MenuItem>
              <MenuItem value="maximize">Maximize</MenuItem>
            </TextField>
          ))}
          <Button
            onClick={() => setDirections([...directions, "minimize"])}
            startIcon={<Add />}
          >
            Add objective
          </Button>
          {directions.length > 1 && (
            <Button onClick={() => setDirections(directions.slice(0, -1))}>
              Remove objective
            </Button>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={editing}>
            Cancel
          </Button>
          <Button
            onClick={() => void createStudy()}
            disabled={editing || studyName.trim() === ""}
            variant="contained"
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
