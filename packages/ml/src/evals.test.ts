import { describe, expect, test } from "bun:test"
import { runMlEvals } from "./evals.js"

describe("Arcana ML eval fixtures", () => {
  test("all checked fixtures pass", async () => {
    const result = await runMlEvals()

    expect(result.failed).toBe(0)
    expect(result.passed).toBe(result.total)
  })
})
