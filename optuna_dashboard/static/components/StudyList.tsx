import React, { FC, useEffect } from "react"
import { useRecoilValue } from "recoil"
import { Link } from "react-router-dom"
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles"

import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import TextField from "@material-ui/core/TextField";
import DialogActions from "@material-ui/core/DialogActions";
import Menu from "@material-ui/core/Menu";
import FormControl from "@material-ui/core/FormControl";
import FormLabel from "@material-ui/core/FormLabel";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Checkbox from "@material-ui/core/Checkbox";
import AppBar from "@material-ui/core/AppBar";
import Card from "@material-ui/core/Card";
import Typography from "@material-ui/core/Typography";
import Container from "@material-ui/core/Container";
import Toolbar from "@material-ui/core/Toolbar";
import Grid from "@material-ui/core/Grid";
import Box from "@material-ui/core/Box";
import IconButton from "@material-ui/core/IconButton";
import Select from "@material-ui/core/Select";
import MenuItem from "@material-ui/core/MenuItem";
import Add from "@material-ui/icons/Add"
import AddBox from "@material-ui/icons/AddBox"
import Delete from "@material-ui/icons/Delete"
import Refresh from "@material-ui/icons/Refresh"
import Remove from "@material-ui/icons/Remove"

import { actionCreator } from "../action"
import { DataGrid, DataGridColumn } from "./DataGrid"
import { studySummariesState } from "../state"

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      margin: theme.spacing(2),
    },
    grow: {
      flexGrow: 1,
    },
    objectiveButton: {
      marginRight: theme.spacing(1),
    },
  })
)

export const StudyList: FC = () => {
  const classes = useStyles()

  const [
    newStudySelectionAnchorEl,
    setNewStudySelectionAnchorEl,
  ] = React.useState<null | HTMLElement>(null)
  const openNewStudySelection = Boolean(newStudySelectionAnchorEl)
  const [
    openNewSingleObjectiveStudyDialog,
    setOpenNewSingleObjectiveStudyDialog,
  ] = React.useState(false)
  const [
    openNewMultiObjectiveStudyDialog,
    setOpenNewMultiObjectiveStudyDialog,
  ] = React.useState(false)
  const [openDeleteStudyDialog, setOpenDeleteStudyDialog] = React.useState(
    false
  )
  const [deleteStudyID, setDeleteStudyID] = React.useState(-1)
  const [newStudyName, setNewStudyName] = React.useState("")

  const [maximize, setMaximize] = React.useState(false)
  const [directions, setDirections] = React.useState<StudyDirection[]>([
    "minimize",
  ])

  const action = actionCreator()
  const studies = useRecoilValue<StudySummary[]>(studySummariesState)

  const newStudyNameAlreadyUsed = studies.some(
    (v) => v.study_name === newStudyName
  )

  useEffect(() => {
    action.updateStudySummaries()
  }, [])

  const columns: DataGridColumn<StudySummary>[] = [
    {
      field: "study_id",
      label: "Study ID",
      sortable: true,
    },
    {
      field: "study_name",
      label: "Name",
      sortable: true,
      toCellValue: (i) => (
        <Link to={`${URL_PREFIX}/studies/${studies[i].study_id}`}>
          {studies[i].study_name}
        </Link>
      ),
    },
    {
      field: "directions",
      label: "Direction",
      sortable: false,
      toCellValue: (i) => studies[i].directions.join(),
    },
    {
      field: "best_trial",
      label: "Best value",
      sortable: false,
      toCellValue: (i) => {
        if (studies[i].directions.length !== 1) {
          return "-" // Multi-objective study does not hold best_trial attribute.
        }
        return studies[i].best_trial?.values?.[0] || null
      },
    },
    {
      field: "study_name",
      label: "",
      sortable: false,
      padding: "none",
      toCellValue: (i) => (
        <IconButton
          aria-label="delete study"
          size="small"
          color="inherit"
          onClick={(e) => {
            setDeleteStudyID(studies[i].study_id)
            setOpenDeleteStudyDialog(true)
          }}
        >
          <Delete />
        </IconButton>
      ),
    },
  ]

  const collapseAttrColumns: DataGridColumn<Attribute>[] = [
    { field: "key", label: "Key", sortable: true },
    { field: "value", label: "Value", sortable: true },
  ]

  const handleCloseNewSingleObjectiveStudyDialog = () => {
    setNewStudyName("")
    setOpenNewSingleObjectiveStudyDialog(false)
  }

  const handleCreateNewSingleObjectiveStudy = () => {
    const direction = maximize ? "maximize" : "minimize"
    action.createNewStudy(newStudyName, [direction])
    setOpenNewSingleObjectiveStudyDialog(false)
    setNewStudyName("")
  }

  const handleCloseNewMultiObjectiveStudyDialog = () => {
    setOpenNewMultiObjectiveStudyDialog(false)
    setNewStudyName("")
    setDirections(["minimize"])
  }

  const handleCreateNewMultiObjectiveStudy = () => {
    action.createNewStudy(newStudyName, directions)
    setOpenNewMultiObjectiveStudyDialog(false)
    setNewStudyName("")
    setDirections(["minimize"])
  }

  const handleCloseDeleteStudyDialog = () => {
    setOpenDeleteStudyDialog(false)
    setDeleteStudyID(-1)
  }

  const handleDeleteStudy = () => {
    action.deleteStudy(deleteStudyID)
    setOpenDeleteStudyDialog(false)
    setDeleteStudyID(-1)
  }

  const collapseBody = (index: number) => {
    return (
      <Grid container direction="row">
        <Grid item xs={6}>
          <Box margin={1}>
            <Typography variant="h6" gutterBottom component="div">
              Study user attributes
            </Typography>
            <DataGrid<Attribute>
              columns={collapseAttrColumns}
              rows={studies[index].user_attrs}
              keyField={"key"}
              dense={true}
              initialRowsPerPage={5}
              rowsPerPageOption={[5, 10, { label: "All", value: -1 }]}
            />
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box margin={1}>
            <Typography variant="h6" gutterBottom component="div">
              Study system attributes
            </Typography>
            <DataGrid<Attribute>
              columns={collapseAttrColumns}
              rows={studies[index].system_attrs}
              keyField={"key"}
              dense={true}
              initialRowsPerPage={5}
              rowsPerPageOption={[5, 10, { label: "All", value: -1 }]}
            />
          </Box>
        </Grid>
      </Grid>
    )
  }

  return (
    <div>
      <AppBar position="static">
        <Container>
          <Toolbar>
            <Typography variant="h6">{APP_BAR_TITLE}</Typography>
            <div className={classes.grow} />
            <IconButton
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={(e) => {
                action.updateStudySummaries("Success to reload")
              }}
              color="inherit"
            >
              <Refresh />
            </IconButton>
            <IconButton
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={(e) => {
                setNewStudySelectionAnchorEl(e.currentTarget)
              }}
              color="inherit"
            >
              <AddBox />
            </IconButton>
            <Menu
              id="menu-appbar"
              anchorEl={newStudySelectionAnchorEl}
              anchorOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
              keepMounted
              transformOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
              open={openNewStudySelection}
              onClose={(e) => {
                setNewStudySelectionAnchorEl(null)
              }}
            >
              <MenuItem
                onClick={(e) => {
                  setNewStudySelectionAnchorEl(null)
                  setOpenNewSingleObjectiveStudyDialog(true)
                }}
              >
                Single-objective
              </MenuItem>
              <MenuItem
                onClick={(e) => {
                  setNewStudySelectionAnchorEl(null)
                  setOpenNewMultiObjectiveStudyDialog(true)
                }}
              >
                Multi-objective
              </MenuItem>
            </Menu>
          </Toolbar>
        </Container>
      </AppBar>
      <Container>
        <Card className={classes.card}>
          <DataGrid<StudySummary>
            columns={columns}
            rows={studies}
            keyField={"study_id"}
            collapseBody={collapseBody}
            initialRowsPerPage={-1}
            rowsPerPageOption={[5, 10, { label: "All", value: -1 }]}
          />
        </Card>
      </Container>
      <Dialog
        open={openNewSingleObjectiveStudyDialog}
        onClose={(e) => {
          handleCloseNewSingleObjectiveStudyDialog()
        }}
        aria-labelledby="create-single-objective-study-form-dialog-title"
      >
        <DialogTitle id="create-single-objective-study-form-dialog-title">
          New single-objective study
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            To create a new study, please enter the study name here.
          </DialogContentText>
          <TextField
            autoFocus
            error={newStudyNameAlreadyUsed}
            helperText={
              newStudyNameAlreadyUsed ? `"${newStudyName}" is already used` : ""
            }
            label="Study name"
            type="text"
            onChange={(e) => {
              setNewStudyName(e.target.value)
            }}
            fullWidth
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={maximize}
                onChange={(e) => {
                  setMaximize(!maximize)
                }}
                color="primary"
              />
            }
            label="Set maximize direction (default: minimize)"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseNewSingleObjectiveStudyDialog}
            color="primary"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateNewSingleObjectiveStudy}
            color="primary"
            disabled={newStudyName === "" || newStudyNameAlreadyUsed}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={openNewMultiObjectiveStudyDialog}
        onClose={(e) => {
          handleCloseNewMultiObjectiveStudyDialog()
        }}
        aria-labelledby="create-multi-objective-study-form-dialog-title"
      >
        <DialogTitle id="create-multi-objective-study-form-dialog-title">
          New multi-objective study
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            To create a new study, please enter the study name and directions
            here.
          </DialogContentText>
          <TextField
            autoFocus
            error={newStudyNameAlreadyUsed}
            helperText={
              newStudyNameAlreadyUsed ? `"${newStudyName}" is already used` : ""
            }
            label="Study name"
            type="text"
            onChange={(e) => {
              setNewStudyName(e.target.value)
            }}
            fullWidth
          />
        </DialogContent>
        {directions.map((d, i) => (
          <DialogContent key={i}>
            <FormControl component="fieldset" fullWidth={true}>
              <FormLabel component="legend">Objective {i}:</FormLabel>
              <Select
                value={directions[i]}
                onChange={(e) => {
                  const newVal: StudyDirection[] = [...directions]
                  newVal[i] = e.target.value as StudyDirection
                  setDirections(newVal)
                }}
              >
                <MenuItem value="minimize">Minimize</MenuItem>
                <MenuItem value="maximize">Maximize</MenuItem>
              </Select>
            </FormControl>
          </DialogContent>
        ))}
        <DialogContent>
          <Button
            variant="outlined"
            startIcon={<Add />}
            className={classes.objectiveButton}
            onClick={(e) => {
              const newVal: StudyDirection[] = [...directions, "minimize"]
              setDirections(newVal)
            }}
          >
            Add
          </Button>
          <Button
            variant="outlined"
            startIcon={<Remove />}
            className={classes.objectiveButton}
            disabled={directions.length <= 1}
            onClick={(e) => {
              const newVal: StudyDirection[] = [...directions]
              newVal.pop()
              setDirections(newVal)
            }}
          >
            Remove
          </Button>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseNewMultiObjectiveStudyDialog}
            color="primary"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateNewMultiObjectiveStudy}
            color="primary"
            disabled={
              newStudyName === "" ||
              newStudyNameAlreadyUsed ||
              directions.length === 0
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={openDeleteStudyDialog}
        onClose={(e) => {
          handleCloseDeleteStudyDialog()
        }}
        aria-labelledby="delete-study-dialog-title"
      >
        <DialogTitle id="delete-study-dialog-title">Delete study</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete a study (id={deleteStudyID})?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteStudyDialog} color="primary">
            No
          </Button>
          <Button onClick={handleDeleteStudy} color="primary">
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
