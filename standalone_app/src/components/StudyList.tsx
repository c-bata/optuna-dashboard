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
  DialogContentText,
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
  useCallback,
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
    editDisabledReason,
    dirty,
    reportError,
  } = useContext(StorageContext)
  const [studies, setStudies] = useState<Optuna.StudySummary[]>([])
  const [editing, setEditing] = useState(false)
  const [createStudyOpen, setCreateStudyOpen] = useState(false)
  const [studyName, setStudyName] = useState("")
  const [directionsInput, setDirectionsInput] = useState("minimize")
  const [studyToDelete, setStudyToDelete] =
    useState<Optuna.StudySummary | null>(null)
  const editable = storage !== null && editDisabledReason === undefined

  const [_studyFilterText, setStudyFilterText] = useState<string>("")
  const [sortBy, setSortBy] = useState<"id-asc" | "id-desc">("id-asc")
  const studyFilterText = useDeferredValue(_studyFilterText)
  const refreshStudies = useCallback(async () => {
    if (storage === null) {
      setStudies([])
      return
    }
    try {
      setStudies(await storage.getStudies())
    } catch (error) {
      reportError(error)
    }
  }, [reportError, storage])

  useEffect(() => {
    void refreshStudies()
  }, [refreshStudies])

  const createStudy = async () => {
    const directions = directionsInput
      .split(",")
      .map((direction) => direction.trim().toLowerCase())
    if (
      directions.length === 0 ||
      directions.some(
        (direction) => direction !== "minimize" && direction !== "maximize"
      )
    ) {
      reportError(new Error("Directions must be minimize or maximize"))
      return
    }
    setEditing(true)
    try {
      await applyEdit({
        kind: "createStudy",
        name: studyName,
        directions: directions as Optuna.StudyDirection[],
      })
      await refreshStudies()
      setCreateStudyOpen(false)
      setStudyName("")
      setDirectionsInput("minimize")
    } catch {
      // StorageProvider reports the actionable error.
    } finally {
      setEditing(false)
    }
  }

  const deleteStudy = async () => {
    if (studyToDelete === null) {
      return
    }
    setEditing(true)
    try {
      await applyEdit({ kind: "deleteStudy", studyId: studyToDelete.id })
      await refreshStudies()
      setStudyToDelete(null)
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
              {editable && (
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setCreateStudyOpen(true)}
                  disabled={editing}
                >
                  Create Study
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>
        {editDisabledReason !== undefined && (
          <Alert severity="info" sx={{ margin: theme.spacing(2) }}>
            Editing disabled: {editDisabledReason}
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
                {editable && (
                  <Tooltip title="Delete study">
                    <IconButton
                      aria-label={`Delete ${study.name}`}
                      onClick={() => setStudyToDelete(study)}
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
        open={createStudyOpen}
        onClose={() => !editing && setCreateStudyOpen(false)}
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
          <TextField
            fullWidth
            label="Directions"
            value={directionsInput}
            onChange={(event) => setDirectionsInput(event.target.value)}
            helperText="Use minimize or maximize, separated by commas."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateStudyOpen(false)} disabled={editing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void createStudy()}
            disabled={editing || studyName.trim() === ""}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={studyToDelete !== null}
        onClose={() => !editing && setStudyToDelete(null)}
      >
        <DialogTitle>Delete Study?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete &apos;{studyToDelete?.name}&apos; and all of its trials?
            {IS_VSCODE &&
              " If Auto Save is enabled, this may be saved immediately."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStudyToDelete(null)} disabled={editing}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void deleteStudy()}
            disabled={editing}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
