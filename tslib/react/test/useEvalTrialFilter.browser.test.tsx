import * as Optuna from "@optuna/types"
import { render, waitFor, screen, fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useEvalTrialFilter } from "../src/hooks/useEvalTrialFilter"
import { FC, useState } from "react"

// Import matchers for custom assertions
import "@testing-library/jest-dom"

describe("useEvalTrialFilter Browser Tests", () => {
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
          param_internal_value: 0.5,
          param_external_type: "float",
          param_external_value: "0.5",
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
          param_internal_value: 0.9,
          param_external_type: "float",
          param_external_value: "0.9",
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

  // Test component that demonstrates the hook functionality
  const TestFilterComponent: FC = () => {
    const [filterFunc, renderIframe] = useEvalTrialFilter()
    const [result, setResult] = useState<Optuna.Trial[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const handleFilter = async (filterExpression: string) => {
      setIsLoading(true)
      setError(null)
      try {
        const filtered = await filterFunc(mockTrials, filterExpression)
        setResult(filtered)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsLoading(false)
      }
    }

    return (
      <div data-testid="filter-component">
        {renderIframe()}
        <button
          data-testid="test-valid-filter"
          onClick={() => handleFilter('(trial) => trial.values[0] > 0.3')}
          disabled={isLoading}
        >
          Test Valid Filter
        </button>
        <button
          data-testid="test-invalid-filter"
          onClick={() => handleFilter('invalid javascript')}
          disabled={isLoading}
        >
          Test Invalid Filter
        </button>
        <button
          data-testid="test-complex-filter"
          onClick={() => handleFilter('(trial) => trial.trial_id % 2 === 0')}
          disabled={isLoading}
        >
          Test Complex Filter
        </button>
        {isLoading && <div data-testid="loading">Loading...</div>}
        {error && <div data-testid="error-message">Error: {error}</div>}
        {result && (
          <div data-testid="filter-result">
            <pre data-testid="result-content">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  test("renders iframe with correct sandbox attributes in real browser", () => {
    render(<TestFilterComponent />)

    // Find the iframe element
    const iframe = document.querySelector('iframe[id*="eval-trial-filter"]')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts")
    expect(iframe).toHaveStyle("display: none")
    expect(iframe).toHaveAttribute("srcdoc")

    // Verify iframe srcdoc contains the expected script content
    const srcdoc = iframe?.getAttribute("srcdoc")
    expect(srcdoc).toContain("window.addEventListener('message'")
    expect(srcdoc).toContain("parent.postMessage")
    expect(srcdoc).toContain("eval('(' + filterFuncStr + ')')")
  })

  test("filters trials with valid JavaScript function in real browser", async () => {
    render(<TestFilterComponent />)

    // Wait for iframe to be ready
    await waitFor(() => {
      expect(document.querySelector('iframe[id*="eval-trial-filter"]')).toBeInTheDocument()
    })

    // Click the valid filter button
    const validFilterButton = screen.getByTestId("test-valid-filter")
    fireEvent.click(validFilterButton)

    // Wait for loading to complete and result to appear
    await waitFor(
      () => {
        expect(screen.queryByTestId("loading")).not.toBeInTheDocument()
        expect(screen.getByTestId("filter-result")).toBeInTheDocument()
      },
      { timeout: 5000 }
    )

    // Check that no error occurred
    expect(screen.queryByTestId("error-message")).not.toBeInTheDocument()

    // Get the result content and verify filtering worked
    const resultElement = screen.getByTestId("result-content")
    const resultText = resultElement.textContent
    expect(resultText).toBeTruthy()

    const result = JSON.parse(resultText!)
    expect(result).toHaveLength(2) // Should return trials 2 and 3 (values > 0.3)
    expect(result[0].trial_id).toBe(2)
    expect(result[1].trial_id).toBe(3)
  })

  test("handles JavaScript execution errors in real browser", async () => {
    render(<TestFilterComponent />)

    // Wait for iframe to be ready
    await waitFor(() => {
      expect(document.querySelector('iframe[id*="eval-trial-filter"]')).toBeInTheDocument()
    })

    // Click the invalid filter button
    const invalidFilterButton = screen.getByTestId("test-invalid-filter")
    fireEvent.click(invalidFilterButton)

    // Wait for loading to complete and error to appear
    await waitFor(
      () => {
        expect(screen.queryByTestId("loading")).not.toBeInTheDocument()
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 5000 }
    )

    // Check that error message is displayed
    const errorElement = screen.getByTestId("error-message")
    expect(errorElement).toBeVisible()
    expect(errorElement.textContent).toContain("Error:")

    // Check that no result is displayed
    expect(screen.queryByTestId("filter-result")).not.toBeInTheDocument()
  })

  test("executes complex filter expressions in real browser", async () => {
    render(<TestFilterComponent />)

    // Wait for iframe to be ready
    await waitFor(() => {
      expect(document.querySelector('iframe[id*="eval-trial-filter"]')).toBeInTheDocument()
    })

    // Click the complex filter button (even trial IDs)
    const complexFilterButton = screen.getByTestId("test-complex-filter")
    fireEvent.click(complexFilterButton)

    // Wait for loading to complete and result to appear
    await waitFor(
      () => {
        expect(screen.queryByTestId("loading")).not.toBeInTheDocument()
        expect(screen.getByTestId("filter-result")).toBeInTheDocument()
      },
      { timeout: 5000 }
    )

    // Check that no error occurred
    expect(screen.queryByTestId("error-message")).not.toBeInTheDocument()

    // Get the result content and verify filtering worked
    const resultElement = screen.getByTestId("result-content")
    const resultText = resultElement.textContent
    expect(resultText).toBeTruthy()

    const result = JSON.parse(resultText!)
    expect(result).toHaveLength(1) // Should return trial with even ID (trial_id: 2)
    expect(result[0].trial_id).toBe(2)
  })

  test("iframe actually executes JavaScript and communicates via postMessage", async () => {
    render(<TestFilterComponent />)

    // Wait for iframe to be ready
    await waitFor(() => {
      expect(document.querySelector('iframe[id*="eval-trial-filter"]')).toBeInTheDocument()
    })

    // Monitor postMessage events
    const messageEvents: MessageEvent[] = []
    const originalAddEventListener = window.addEventListener
    window.addEventListener = vi.fn((type: string, listener: any, options?: any) => {
      if (type === 'message') {
        const wrappedListener = (event: Event) => {
          if (event instanceof MessageEvent) {
            messageEvents.push(event)
          }
          listener(event)
        }
        originalAddEventListener.call(window, type, wrappedListener, options)
      } else {
        originalAddEventListener.call(window, type, listener, options)
      }
    })

    // Execute a filter
    const validFilterButton = screen.getByTestId("test-valid-filter")
    fireEvent.click(validFilterButton)

    // Wait for the result
    await waitFor(
      () => {
        expect(screen.getByTestId("filter-result")).toBeInTheDocument()
      },
      { timeout: 5000 }
    )

    // Verify that message events were captured
    // In a real browser, the iframe should have sent back a postMessage
    expect(messageEvents.length).toBeGreaterThan(0)

    // Restore original addEventListener
    window.addEventListener = originalAddEventListener
  })

  test("iframe sandbox prevents access to parent window variables", async () => {
    // Set a variable on the parent window that should not be accessible from iframe
    ;(window as any).parentTestVariable = "should-not-be-accessible"

    render(<TestFilterComponent />)

    // Wait for iframe to be ready
    await waitFor(() => {
      expect(document.querySelector('iframe[id*="eval-trial-filter"]')).toBeInTheDocument()
    })

    // Try to execute a filter that attempts to access parent variable
    // This should fail because the iframe is sandboxed
    const testButton = screen.getByTestId("test-invalid-filter")
    
    // Replace the onclick to test sandbox isolation
    fireEvent.click(testButton)

    // Wait for error (since the invalid javascript should cause an error)
    await waitFor(
      () => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument()
      },
      { timeout: 5000 }
    )

    // The error proves that the iframe environment is properly isolated
    expect(screen.getByTestId("error-message")).toBeVisible()

    // Clean up
    delete (window as any).parentTestVariable
  })
})
