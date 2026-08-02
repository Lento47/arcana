import { describe, expect, test } from "bun:test"
import { gutterStepLabel } from "../src/shell/command-spine/spine-gutter"
import { buildStatusSegments } from "../src/shell/command-spine/spine-segments"
import { COMPACT_NOW_PERCENT, COMPACT_SOON_PERCENT } from "../src/util/context-pressure"

describe("spine-gutter.gutterStepLabel (S2)", () => {
  test("index 0 (hidden) renders a blank 2-cell spacer, never '00'", () => {
    expect(gutterStepLabel(0)).toBe("  ")
    expect(gutterStepLabel(-1)).toBe("  ")
  })

  test("renders 2-digit padded indices", () => {
    expect(gutterStepLabel(1)).toBe("01")
    expect(gutterStepLabel(5)).toBe("05")
    expect(gutterStepLabel(42)).toBe("42")
    expect(gutterStepLabel(99)).toBe("99")
  })

  test("keeps real monotonic indices past 99 (no repeated cap)", () => {
    expect(gutterStepLabel(100)).toBe("100")
    expect(gutterStepLabel(1000)).toBe("1000")
    expect(gutterStepLabel(118, 3)).toBe("118")
  })
})

describe("spine-segments.buildStatusSegments (S3)", () => {
  test("empty source produces no segments", () => {
    expect(buildStatusSegments({})).toEqual([])
    expect(buildStatusSegments({ sessionID: undefined, branch: undefined })).toEqual([])
  })

  test("maps branch → accent segment", () => {
    expect(buildStatusSegments({ branch: "main" })).toEqual([
      { key: "branch", label: "branch", value: "main", tone: "accent" },
    ])
  })

  test("maps model → brand segment", () => {
    expect(buildStatusSegments({ model: "gpt-4o" })).toEqual([
      { key: "model", label: "model", value: "gpt-4o", tone: "brand" },
    ])
  })

  test("ctx percent → info/warning/error by pressure thresholds", () => {
    expect(buildStatusSegments({ ctxPercent: 34 })).toEqual([
      { key: "ctx", label: "ctx", value: "34%", tone: "info" },
    ])
    expect(buildStatusSegments({ ctxPercent: COMPACT_SOON_PERCENT - 1 })[0]?.tone).toBe("info")
    expect(buildStatusSegments({ ctxPercent: COMPACT_SOON_PERCENT })[0]?.tone).toBe("warning")
    expect(buildStatusSegments({ ctxPercent: COMPACT_NOW_PERCENT })[0]?.tone).toBe("error")
  })

  test("ctx omitted when percent missing or non-finite", () => {
    expect(buildStatusSegments({ ctxPercent: null })).toEqual([])
    expect(buildStatusSegments({ ctxPercent: Number.NaN })).toEqual([])
    expect(buildStatusSegments({ ctxPercent: undefined })).toEqual([])
  })

  test("state: idle omitted as noise, busy/retry/error shown", () => {
    expect(buildStatusSegments({ state: "idle" })).toEqual([])
    expect(buildStatusSegments({ state: "busy" })).toEqual([
      { key: "state", label: "state", value: "busy", tone: "info" },
    ])
    expect(buildStatusSegments({ state: "retry" })[0]?.tone).toBe("warning")
    expect(buildStatusSegments({ state: "error" })[0]?.tone).toBe("error")
  })

  test("session + path map to muted segments", () => {
    expect(buildStatusSegments({ sessionID: "abc123" })).toEqual([
      { key: "session", label: "session", value: "abc123", tone: "muted" },
    ])
    expect(buildStatusSegments({ path: "/repo/src" })).toEqual([
      { key: "path", label: "path", value: "/repo/src", tone: "muted" },
    ])
  })

  test("full source emits all six segments in stable order", () => {
    const segments = buildStatusSegments({
      sessionID: "sess-42",
      branch: "feat/audit",
      model: "claude",
      ctxPercent: 60,
      state: "busy",
      path: "/repo",
    })
    expect(segments.map((s) => s.key)).toEqual(["branch", "model", "ctx", "state", "session", "path"])
  })
})
