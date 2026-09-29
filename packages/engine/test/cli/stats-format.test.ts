import { expect, test } from "bun:test"
import { formatStats, statsFrameWidth, stepFinishUsage, type SessionStats } from "../../src/cli/cmd/stats"
import type { SessionV1 } from "@arcana/core/v1/session"

const sampleStats: SessionStats = {
  totalSessions: 12,
  totalMessages: 34,
  totalCost: 1.2,
  totalTokens: {
    input: 1000,
    output: 2000,
    reasoning: 300,
    cache: { read: 40, write: 50 },
  },
  toolUsage: { read: 10, "very-long-tool-name-that-needs-truncation": 2 },
  modelUsage: {
    "openrouter/free": {
      messages: 2,
      tokens: { input: 1000, output: 2000, cache: { read: 40, write: 50 } },
      cost: 0.2,
    },
  },
  dateRange: { earliest: 0, latest: 0 },
  days: 3,
  costPerDay: 0.4,
  tokensPerSession: 5,
  medianTokensPerSession: 6,
}

test("stepFinishUsage sums every step of a multi-step turn", () => {
  const step = (input: {
    input: number
    output: number
    reasoning?: number
    read?: number
    write?: number
    cost?: number
  }) =>
    ({
      type: "step-finish",
      cost: input.cost ?? 0,
      tokens: {
        input: input.input,
        output: input.output,
        reasoning: input.reasoning ?? 0,
        cache: { read: input.read ?? 0, write: input.write ?? 0 },
      },
    }) as unknown as SessionV1.Part

  const usage = stepFinishUsage([
    step({ input: 100, output: 40, reasoning: 10, read: 5, write: 3, cost: 10 }),
    step({ input: 120, output: 60, reasoning: 20, read: 7, write: 4, cost: 25 }),
  ])

  expect(usage).toEqual({
    tokens: { input: 220, output: 100, reasoning: 30, cache: { read: 12, write: 7 } },
    cost: 35,
  })
})

test("stepFinishUsage returns undefined when no step-finish parts exist", () => {
  expect(stepFinishUsage([])).toBeUndefined()
})

test("stats frame keeps every line inside the requested width", () => {
  const width = 40
  const output = formatStats(sampleStats, undefined, Infinity, width)

  expect(output).not.toContain("\u001b[")
  for (const line of output.split("\n")) {
    if (line.length === 0) continue
    expect(Bun.stringWidth(line)).toBe(width)
    expect(line.startsWith("┌") || line.startsWith("├") || line.startsWith("└") || line.startsWith("│")).toBe(true)
    expect(line.endsWith("┐") || line.endsWith("┤") || line.endsWith("┘") || line.endsWith("│")).toBe(true)
  }
})

test("stats frame width clamps invalid requests without producing NaN", () => {
  expect(statsFrameWidth(Number.NaN)).toBeGreaterThan(0)
  expect(statsFrameWidth(Number.POSITIVE_INFINITY)).toBeGreaterThan(0)
  expect(statsFrameWidth(10)).toBeGreaterThanOrEqual(20)
})
