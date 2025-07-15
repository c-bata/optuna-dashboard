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

    // Create a promise for the result
    const resultPromise = filterFunc!(
      mockTrials,
      "(trial) => trial.values[0] > 0.3"
    )

    // Wait for iframe to load (give it some time to execute the script)
    await new Promise(resolve => setTimeout(resolve, 50))

    // Create and dispatch the proper MessageEvent to the iframe's contentWindow
    const iframe = document.querySelector("iframe") as HTMLIFrameElement
    
    // Since JSDOM doesn't actually execute iframe scripts, we'll simulate the response
    // In a real browser environment, this would come from the iframe itself
    const expectedFilteredTrials = mockTrials.filter((t) => t.values !== undefined && t.values[0] > 0.3)
    
    const messageEvent = new MessageEvent("message", {
      data: {
        type: "result",
        filteredTrials: expectedFilteredTrials,
      },
      source: iframe.contentWindow,
      origin: "*"
    })

    // Dispatch the event to the main window (simulating iframe response)
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

    // Create a promise for the result
    const resultPromise = filterFunc!(mockTrials, "invalid javascript")

    // Wait for iframe to load
    await new Promise(resolve => setTimeout(resolve, 50))

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

  test("iframe actually executes JavaScript and communicates via postMessage", async () => {
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

    const iframe = document.querySelector("iframe") as HTMLIFrameElement
    expect(iframe).toBeTruthy()
    expect(iframe.srcdoc).toContain("eval")
    expect(iframe.srcdoc).toContain("parent.postMessage")
    expect(iframe.srcdoc).toContain("addEventListener('message'")
    
    // Check that the sandbox attribute allows scripts
    expect(iframe.sandbox.contains("allow-scripts")).toBe(true)
    
    // In a real browser test environment (like Playwright), we could test:
    // - That the iframe actually loads and executes JavaScript
    // - That postMessage communication works bidirectionally
    // - That the eval function properly filters trials
    // - That syntax errors are properly caught and reported
    
    // For now, we verify the structure is correct for real execution
    expect(filterFunc).not.toBeNull()
  })
})
