import * as plotly from "plotly.js-dist"
import React, { ChangeEvent , FC, useEffect, useState } from "react"
import {
  Grid, 
  FormControl,
  FormLabel,
  InputLabel,
  MenuItem,
  Select
} from "@material-ui/core"
import { createStyles, makeStyles, Theme} from "@material-ui/core/styles"

const plotDomId = "graph-slice2"

const useStyles = makeStyles((theme: Theme) =>
createStyles({
  formControl :{
    marginBottom: theme.spacing(2)
  },
})
)

export const GraphSlice2: FC<{
    trials: Trial[]
}> = ({ trials = [] }) => {
    const classes = useStyles()
    const [xAxis, setXAxis] = useState<string>("x")
    const [objectiveId, setObjectiveId] = useState<number>(0)
  
    const handleObjectiveChange = (
      event: React.ChangeEvent<{ value: unknown}>
    ) => {
      setObjectiveId(event.target.value as number )
    }
  
    const handleXAxisChange = (
      e: ChangeEvent<{value: unknown}>) => {
      setXAxis(e.target.value as string)
    }
  
    useEffect(() => {
      plotSlice(trials, 0, xAxis)
    } ,
     [trials,
      objectiveId,
      xAxis
    ])
  
    let filteredTrials = trials.filter(
      (t) => t.state === "Complete" || t.state === "Pruned"
    )
    const objectiveValues: number[] = filteredTrials.map(
      (t) => t.values![objectiveId]
   )
  
   let paramNames = new Set<string>(trials[0].params.map((p) => p.name))
       filteredTrials.forEach((t) => {
         paramNames = new Set<string>(
          t.params.filter((p) => paramNames.has(p.name)).map((p) => p.name)
         )
      })
    let paramnames = Array.from(paramNames)
  
    return (    
      <Grid container direction="row">
        <Grid item xs = {3}>
          <Grid container direction="column">
            <FormControl component = "fieldset" className={classes.formControl}>
              <FormLabel component="legend">Objective ID:</FormLabel>
              <Select value={objectiveId} onChange={handleObjectiveChange}>
                {objectiveValues.map((x) => (
                  <MenuItem value={x} key={x}>
                    {x}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl component="fieldset" className={classes.formControl}>
              <InputLabel id="parameter">Parameter</InputLabel>
              <Select value={xAxis} onChange={handleXAxisChange}>
                {paramnames.map((x) => (
                  <MenuItem value = {x} key={x}>
                    {x}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        <Grid item xs={9}>
          <div id = {plotDomId} />
        </Grid>
      </Grid>  
    )
}

const plotSlice = (trials: Trial[], objectiveId: number, xAxis: string) => {
    if(document.getElementById(plotDomId) === null){
        return
    }
    
    const layout: Partial<plotly.Layout> = {
        title: "Slice",
        margin: {
          l: 50,
          r: 50,
          b: 0,
        },
    }

    if (trials.length === 0) {
        plotly.react(plotDomId, [], layout)
        return
    }

    let filteredTrials = trials.filter(
        (t) => t.state === "Complete" || t.state === "Pruned"
      )
        
    let paramNames = new Set<string>(trials[0].params.map((p) => p.name))
     filteredTrials.forEach((t) => {
       paramNames = new Set<string>(
        t.params.filter((p) => paramNames.has(p.name)).map((p) => p.name)
       )
    })

    const objectiveValues: number[] = filteredTrials.map(
        (t) => t.values![objectiveId]
    )

    if (paramNames.size === 0) {        
        plotly.react(plotDomId, [])
        return 
    }
    else{
        let trace: Partial<plotly.PlotData>[] =  [{
            type: "scatter",
            x:[],
            y:[],
            mode :"markers",
            xaxis : "x",
            marker:{
              color: "#185799"
            }
        }]
        let updatelayout: Partial<plotly.Layout> = {
            title: "Slice",
            margin: {
              l: 50,
              r: 50,
              b: 0,
            },
            xaxis : {
              title: "x",
              zerolinecolor: "white",
              zerolinewidth: 1.5,
              linecolor: "#f2f5fa",
              linewidth: 5,
              gridcolor: "#f2f5fa",
              gridwidth:1,
            },
            yaxis:{
              title:"Objective Values",
              zerolinecolor: "#f2f5fa",
              zerolinewidth: 2,
              linecolor: "#f2f5fa",
              linewidth: 5,
              gridcolor: "#f2f5fa",
              gridwidth:1
            },
            plot_bgcolor: "#E5ecf6",
            showlegend: false
        } 
        paramNames.forEach((paramName) => {
            const valueStrings = filteredTrials.map((t) => {
                const param = t.params.find((p) => p.name == paramName)
                return param!.value
              })
            const values: number[] = valueStrings.map((v) => parseFloat(v))
            if(paramName === xAxis){
                trace = [{
                    type: "scatter",
                    x: values,
                    y: objectiveValues,
                    mode: "markers",
                    xaxis: paramName,
                    marker: {
                        color: "#185799"
                    }
                }]
                updatelayout["xaxis"] = {
                    title: paramName
                }
                plotly.react(plotDomId, trace, updatelayout)
            }
        })
    }


}