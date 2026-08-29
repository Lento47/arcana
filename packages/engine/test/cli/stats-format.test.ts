import { expect, test } from "bun:test"
import { formatStats, statsFrameWidth, type SessionStats } from "../../src/cli/cmd/stats"

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
