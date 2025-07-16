import { expect } from "vitest"

// For browser mode, we need to manually extend expect
// Import the matchers directly to avoid import issues
import * as matchers from "@testing-library/jest-dom/matchers"

// Extend Vitest's expect with Testing Library matchers
expect.extend(matchers)

// Global setup for browser environment
if (typeof window !== "undefined") {
  // Browser-specific setup
  globalThis.expect = expect
}

declare module "vitest" {
  interface Assertion<T = any> extends jest.Matchers<void, T> {}
}
