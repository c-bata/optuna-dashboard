import * as plotly from "plotly.js-dist"
import React, { FC, useEffect, useState } from "react"
import {
  Grid,
  FormControl,
  FormLabel,
  MenuItem,
  Select,
  Typography,
} from "@material-ui/core"
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles"

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    title: {
      margin: "1em 0",
    },
    formControl: {
      marginBottom: theme.spacing(2),
      marginRight: theme.spacing(5),
    },
  })
)

const plotDomId = "graph-parallel-coordinate"

export const GraphParallelCoordinate: FC<{
  study: StudyDetail | null
}> = ({ study = null }) => {
  const classes = useStyles()
  const [objectiveId, setObjectiveId] = useState<number>(0)

  const handleObjectiveChange = (
    event: React.ChangeEvent<{ value: unknown }>
  ) => {
    setObjectiveId(event.target.value as number)
  }

  useEffect(() => {
    if (study !== null) {
      plotCoordinate(study, objectiveId)
    }
  }, [study, objectiveId])

  return (
    <Grid container direction="row">
      <Grid item xs={3}>
        <Grid container direction="column">
          <Typography variant="h6" className={classes.title}>
            Parallel cooridinate
          </Typography>
          {study !== null && study.directions.length !== 1 ? (
            <FormControl component="fieldset" className={classes.formControl}>
              <FormLabel component="legend">Objective ID:</FormLabel>
              <Select value={objectiveId} onChange={handleObjectiveChange}>
                {study.directions.map((d, i) => (
                  <MenuItem value={i} key={i}>
                    {i}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
        </Grid>
      </Grid>

      <Grid item xs={9}>
        <div id={plotDomId} />
      </Grid>
    </Grid>
  )
}

const plotCoordinate = (study: StudyDetail, objectiveId: number) => {
  if (document.getElementById(plotDomId) === null) {
    return
  }

  const layout: Partial<plotly.Layout> = {
    margin: {
      l: 50,
      t: 50,
      r: 50,
      b: 0,
    },
  }

  if (study.trials.length === 0) {
    plotly.react(plotDomId, [], layout)
    return
  }

  const filteredTrials = study.trials.filter(
    (t) =>
      t.state === "Complete" ||
      (t.state === "Pruned" && t.values && t.values.length > 0)
  )

  // Intersection param names
  const objectiveValues: number[] = filteredTrials.map(
    (t) => t.values![objectiveId]
  )
  const dimensions = [
    {
      label: "Objective value",
      values: objectiveValues,
      range: [Math.min(...objectiveValues), Math.max(...objectiveValues)],
    },
  ]
  study.intersection_search_space.forEach((s) => {
    const valueStrings = filteredTrials.map((t) => {
      const param = t.params.find((p) => p.name === s.name)
      return param!.value
    })
    const isnum = valueStrings.every((v) => {
      return !isNaN(parseFloat(v))
    })
    if (isnum) {
      const values: number[] = valueStrings.map((v) => parseFloat(v))
      dimensions.push({
        label: s.name,
        values: values,
        range: [Math.min(...values), Math.max(...values)],
      })
    } else {
      // categorical
      const vocabSet = new Set<string>(valueStrings)
      const vocabArr = Array.from<string>(vocabSet)
      const values: number[] = valueStrings.map((v) =>
        vocabArr.findIndex((vocab) => v === vocab)
      )
      const tickvals: number[] = vocabArr.map((v, i) => i)
      dimensions.push({
        label: s.name,
        values: values,
        range: [Math.min(...values), Math.max(...values)],
        // @ts-ignore
        tickvals: tickvals,
        ticktext: vocabArr,
      })
    }
  })
  const plotData: Partial<plotly.PlotData>[] = [
    {
      type: "parcoords",
      // @ts-ignore
      dimensions: dimensions,
    },
  ]

  plotly.react(plotDomId, plotData, layout)
}
