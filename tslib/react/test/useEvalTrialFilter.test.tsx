import * as Optuna from "@optuna/types"
import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useEvalTrialFilter } from "../src/hooks/useEvalTrialFilter"

describe("useEvalTrialFilter Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const distribution: Optuna.FloatDistribution = {
    type: "FloatDistribution",
    low: 0,
    high: 10,
    step: null,
    log: false,
  }
  const mockTrials: Optuna.Trial[] = [
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
          distribution,
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
          distribution,
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
          distribution,
        },
      ],
      intermediate_values: [],
      user_attrs: [],
      datetime_start: new Date("2023-01-01T00:00:00Z"),
      datetime_complete: new Date("2023-01-01T00:01:00Z"),
      constraints: [],
    },
  ]

  test("renders iframe sandbox with correct attributes", () => {
    const TestWrapper = () => {
      const [, renderIframe] = useEvalTrialFilter()
      return <div>{renderIframe()}</div>
    }

    render(<TestWrapper />)

    const iframe = document.querySelector("iframe")
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts")
    expect(iframe).toHaveStyle("display: none")
    expect(iframe).toHaveAttribute("srcdoc")
  })

  test("filtering works with valid JavaScript function", async () => {
    let filterFunc: ((
      trials: Optuna.Trial[],
      filterFuncStr: string
    ) => Promise<Optuna.Trial[]>) | null = null

    const TestWrapper = () => {
      const [filter, renderIframe] = useEvalTrialFilter()
      filterFunc = filter
      return <div>{renderIframe()}</div>
    }
    render(<TestWrapper />)

    // Wait for iframe to be ready
    await waitFor(() => {
      expect(document.querySelector("iframe")).toBeInTheDocument()
    })
    expect(filterFunc).not.toBeNull()

    // Call the filter function
    const resultPromise = filterFunc!(
      mockTrials,
      "(trial) => trial.values[0] > 0.3"
    )

    // Simulate iframe response
    const messageEvent = new MessageEvent("message", {
      data: {
        type: "result",
        filteredTrials: mockTrials.filter((t) => t.values !== undefined && t.values[0] > 0.3),
      },
    })

    window.dispatchEvent(messageEvent)

    const result = await resultPromise
    expect(result).toHaveLength(2)
    expect(result[0].trial_id).toBe(2)
    expect(result[1].trial_id).toBe(3)
  })

  test("handles JavaScript execution errors", async () => {
    let filterFunc: ((
      trials: Optuna.Trial[],
      filterFuncStr: string
    ) => Promise<Optuna.Trial[]>) | null = null

    const TestWrapper = () => {
      const [filter, renderIframe] = useEvalTrialFilter()
      filterFunc = filter
      return <div>{renderIframe()}</div>
    }
    render(<TestWrapper />)

    // Wait for iframe to be ready
    await waitFor(() => {
      expect(document.querySelector("iframe")).toBeInTheDocument()
    })
    expect(filterFunc).not.toBeNull()

    // Call the filter function
    const resultPromise = filterFunc!(mockTrials, "invalid javascript")

    // Simulate iframe error response
    const messageEvent = new MessageEvent("message", {
      data: {
        type: "result",
        filteredTrials: [],
        error: "SyntaxError: Unexpected token",
      },
    })
    window.dispatchEvent(messageEvent)
    await expect(resultPromise).rejects.toBe("SyntaxError: Unexpected token")
  })

  test("rejects when iframe is not ready", async () => {
    let filterFunc: ((
      trials: Optuna.Trial[],
      filterFuncStr: string
    ) => Promise<Optuna.Trial[]>) | null = null

    const TestWrapper = () => {
      const [filter] = useEvalTrialFilter()
      filterFunc = filter
      return <div>No iframe</div>
    }
    render(<TestWrapper />)
    expect(filterFunc).not.toBeNull()

    const resultPromise = filterFunc!(mockTrials, "(trial) => true")
    await expect(resultPromise).rejects.toThrow("Sandbox iframe is not ready")
  })

  test("cleans up event listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener")

    const TestWrapper = () => {
      const [, renderIframe] = useEvalTrialFilter()
      return <div>{renderIframe()}</div>
    }

    const { unmount } = render(<TestWrapper />)

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "message",
      expect.any(Function)
    )
  })
})
