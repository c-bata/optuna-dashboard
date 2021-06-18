import React from "react"
import Enzyme from "enzyme"
import Adapter from "enzyme-adapter-react-16"
import { mount } from "enzyme"

global.URL.createObjectURL = jest.fn()

import { TrialTable } from "../../optuna_dashboard/static/components/StudyDetail"
import {
  DataGridColumn,
  descendingComparator,
} from "../../optuna_dashboard/static/components/DataGrid"

Enzyme.configure({ adapter: new Adapter() })
const trials = [
  {
    trial_id: 1,
    study_id: 0,
    number: 0,
    state: "Complete" as TrialState,
    values: [-1],
    intermediate_values: [],
    datetime_start: new Date("2021-06-15T00:00:00"),
    datetime_complete: new Date("2021-06-15T00:00:01"),
    params: [
      { name: "x", value: "1" },
      { name: "y", value: "2" },
    ],
    user_attrs: [],
    system_attrs: [],
  },
  {
    trial_id: 2,
    study_id: 0,
    number: 1,
    state: "Complete" as TrialState,
    values: [-2],
    intermediate_values: [],
    datetime_start: new Date("2021-06-15T00:00:01"),
    datetime_complete: new Date("2021-06-15T00:00:02"),
    params: [
      { name: "x", value: "2" },
      { name: "y", value: "1" },
    ],
    user_attrs: [],
    system_attrs: [],
  },
]

const study_direction: StudyDirection = "minimize" as StudyDirection

const study_detail = {
  name: "study_0",
  directions: [study_direction],
  datetime_start: new Date("2021-06-15T00:00:00"),
  best_trial: trials[1],
  trials: trials,
  intersection_search_space: [
    {
      name: "x",
      type: "UniformDistribution",
      attributes: { low: -3, high: 3 },
    },
    {
      name: "y",
      type: "UniformDistribution",
      attributes: { low: -3, high: 3 },
    },
  ],
  union_search_space: [
    {
      name: "x",
      type: "UniformDistribution",
      attributes: { low: -3, high: 3 },
    },
    {
      name: "y",
      type: "UniformDistribution",
      attributes: { low: -3, high: 3 },
    },
  ],
}

test("Trial table correctly rendered the trial list", () => {
  const trial_table_component = mount(<TrialTable studyDetail={study_detail} />)
  const head_cells = trial_table_component
    .find("ForwardRef(TableHead)")
    .find("WithStyles(ForwardRef(TableCell))")

  const columns: DataGridColumn<Trial>[] = trial_table_component
    .find("DataGrid")
    .prop("columns")

  for (let i = 0; i < head_cells.length; i++) {
    const head_cell = head_cells.at(i)
    const h_k = parseInt(head_cell.key())
    if (!isNaN(h_k) && "sortable" in columns[h_k]) {
      const sort_label = head_cell.find("ForwardRef(TableSortLabel)")
      expect(sort_label.prop("direction")).toEqual("asc")
      sort_label.simulate("click")
      if (h_k > 0) {
        // Click twice as these are not active by default.
        sort_label!.simulate("click")
      }
      const sort_label_clicked = trial_table_component
        .find("ForwardRef(TableHead)")
        .find("WithStyles(ForwardRef(TableCell))")
        .at(i)
        .find("ForwardRef(TableSortLabel)")
      expect(sort_label_clicked.prop("direction")).toEqual("desc")

      const trials_presented: Trial[] = []
      trial_table_component
        .find("ForwardRef(TableBody)")
        .find("DataGridRow")
        .forEach((c) => {
          trials_presented.push(c.prop("row") as Trial)
        })
      const less = columns[h_k]?.less
      const trials_sorted = [...trials_presented]
      trials_sorted.sort((a: Trial, b: Trial) => {
        if (less) {
          return less(a, b)
        }
        return descendingComparator(a, b, columns, h_k)
      })
      expect(
        trials_sorted.length === trials_presented.length &&
          trials_sorted
            .map((t) => t.trial_id)
            .every((v, i) => v === trials_presented.map((t) => t.trial_id)[i])
      ).toBe(true)
    }
  }
})
