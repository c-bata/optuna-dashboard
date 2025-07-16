import { expect } from "vitest"
import * as matchers from "@testing-library/jest-dom/matchers"

// Extend Vitest's expect with Testing Library matchers
expect.extend(matchers)

declare module "vitest" {
  interface Assertion<T = any> extends jest.Matchers<void, T> {}
}
