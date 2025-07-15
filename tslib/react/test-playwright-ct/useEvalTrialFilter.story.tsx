import React from "react"
import * as Optuna from "@optuna/types"
import { useEvalTrialFilter } from "../src/hooks/useEvalTrialFilter"

// Test component that uses the hook and renders iframe
export function TestWrapperWithIframe() {
  const [, renderIframe] = useEvalTrialFilter()
  return <div>{renderIframe()}</div>
}

// Test component that uses the hook and exposes filter function to window
export function TestWrapperWithFilter() {
  const [filter, renderIframe] = useEvalTrialFilter()
  
  // Expose the filter function to window for testing
  if (typeof window !== 'undefined') {
    ;(window as any).filterFunc = filter
  }
  
  return <div>{renderIframe()}</div>
}

// Test component that only exposes filter function without iframe
export function TestWrapperFilterOnly() {
  const [filter] = useEvalTrialFilter()
  
  // Expose the filter function to window for testing
  if (typeof window !== 'undefined') {
    ;(window as any).filterFunc = filter
  }
  
  return <div>No iframe</div>
}

// Mock trial data that will be used in tests
export const mockTrials: Optuna.Trial[] = [
  {
    trial_id: 1,
    study_id: 1,
    number: 0,
    state: "Complete",
    values: [0.1],
    params: [
      {
        name: "x",
        param_internal_value: 0.1,
        param_external_type: "float",
        param_external_value: "0.1",
        distribution: {
          type: "FloatDistribution",
          low: 0,
          high: 10,
          step: null,
          log: false,
        },
      },
    ],
    intermediate_values: [],
    user_attrs: [],
    datetime_start: new Date("2023-01-01T00:00:00Z"),
    datetime_complete: new Date("2023-01-01T00:01:00Z"),
    constraints: [],
  },
  {
    trial_id: 2,
    study_id: 1,
    number: 1,
    state: "Complete",
    values: [0.5],
    params: [
      {
        name: "x",
        param_internal_value: 0.1,
        param_external_type: "float",
        param_external_value: "0.1",
        distribution: {
          type: "FloatDistribution",
          low: 0,
          high: 10,
          step: null,
          log: false,
        },
      },
    ],
    intermediate_values: [],
    user_attrs: [],
    datetime_start: new Date("2023-01-01T00:00:00Z"),
    datetime_complete: new Date("2023-01-01T00:01:00Z"),
    constraints: [],
  },
  {
    trial_id: 3,
    study_id: 1,
    number: 2,
    state: "Complete",
    values: [0.9],
    params: [
      {
        name: "x",
        param_internal_value: 0.1,
        param_external_type: "float",
        param_external_value: "0.1",
        distribution: {
          type: "FloatDistribution",
          low: 0,
          high: 10,
          step: null,
          log: false,
        },
      },
    ],
    intermediate_values: [],
    user_attrs: [],
    datetime_start: new Date("2023-01-01T00:00:00Z"),
    datetime_complete: new Date("2023-01-01T00:01:00Z"),
    constraints: [],
  },
]
