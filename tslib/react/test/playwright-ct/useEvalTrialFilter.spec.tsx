import { test, expect } from "@playwright/experimental-ct-react"

import {
  TestWrapperWithFilter,
  mockTrials
} from "./useEvalTrialFilter.story"

test.describe("useEvalTrialFilter Tests", () => {
  test("filtering works with valid JavaScript function", async ({ mount, page }) => {
    const component = await mount(<TestWrapperWithFilter />)

    // Wait for iframe to be ready
    await component.locator("iframe").waitFor({ state: "attached" })

    // Wait a bit more for the iframe to fully load
    await page.waitForTimeout(100)

    // Get the filter function from the page and test it
    const result = await page.evaluate(async (trials) => {
      const filter = (window as any).filterFunc
      if (!filter) throw new Error("Filter function not available")

      try {
        return await filter(trials, "(trial) => trial.values[0] > 0.3")
      } catch (error) {
        throw error
      }
    }, mockTrials)

    expect(result).toHaveLength(2)
    expect(result[0].trial_id).toBe(2)
    expect(result[1].trial_id).toBe(3)
  })

  /*
  test("handles JavaScript execution errors", async ({ mount, page }) => {
    const component = await mount(<TestWrapperWithFilter />)

    // Wait for iframe to be ready
    await component.locator("iframe").waitFor({ state: "attached" })
    
    // Wait a bit more for the iframe to fully load
    await page.waitForTimeout(100)

    // Test error handling
    const errorPromise = page.evaluate(async (trials) => {
      const filter = (window as any).filterFunc
      if (!filter) throw new Error("Filter function not available")
      
      try {
        await filter(trials, "invalid javascript")
        return "no error" // Should not reach here
      } catch (error) {
        return String(error)
      }
    }, mockTrials)

    await expect(errorPromise).resolves.toContain("SyntaxError")
  })

  test("rejects when iframe is not ready", async ({ mount, page }) => {
    await mount(<TestWrapperFilterOnly />)

    // Test error handling when iframe is not ready
    const errorPromise = page.evaluate(async (trials) => {
      const filter = (window as any).filterFunc
      if (!filter) throw new Error("Filter function not available")
      
      try {
        await filter(trials, "(trial) => true")
        return "no error" // Should not reach here
      } catch (error) {
        return String(error)
      }
    }, mockTrials)

    await expect(errorPromise).resolves.toContain("Sandbox iframe is not ready")
  })

  test("cleans up event listener on unmount", async ({ mount, page }) => {
    // Add a spy to track removeEventListener calls
    await page.evaluate(() => {
      const originalRemoveEventListener = window.removeEventListener
      ;(window as any).removeEventListenerCalls = []
      
      window.removeEventListener = function(type: string, listener: any, options?: any) {
        ;(window as any).removeEventListenerCalls.push({ type, listener, options })
        return originalRemoveEventListener.call(this, type, listener, options)
      }
    })

    const component = await mount(<TestWrapperWithIframe />)
    
    // Unmount the component
    await component.unmount()

    // Check that removeEventListener was called with message event
    const removeEventListenerCalls = await page.evaluate(() => (window as any).removeEventListenerCalls)
    
    expect(removeEventListenerCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message"
        })
      ])
    )
  })
  */
})
