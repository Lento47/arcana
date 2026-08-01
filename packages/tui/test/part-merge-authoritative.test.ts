import { describe, expect, test } from "bun:test"
import { shouldKeepLocalAuthoritative } from "../src/util/part-merge"

const NOW = 1_000_000
const SILENCE = 5_000

function textPart(id: string, text: string, completed = false) {
  return { id, type: "text", text, completed }
}

function toolPart(id: string, status: string) {
  return { id, type: "tool", state: { status } }
}

describe("shouldKeepLocalAuthoritative (P12.4)", () => {
  test("frozen local prefix is replaced by the remote superset", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: textPart("p1", "## QoS Review: arcana-proxy AI LLM Traffic (Full Summary)", true),
      current: textPart("p1", "## Qo"),
      lastEventAt: NOW - 60_000, // silent for a minute
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(false)
    expect(decision.converged).toBe(true)
  })

  test("terminal remote tool state beats local running", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: toolPart("t1", "completed"),
      current: toolPart("t1", "running"),
      lastEventAt: NOW - 500, // recently touched — must NOT protect it
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(false)
    expect(decision.converged).toBe(true)
  })

  test("local running tool state beats terminal... never: remote terminal wins even when local is fresh", () => {
    // Same as above but local touched 100ms ago: liveness is not a tie-breaker
    // against terminal authoritative state.
    const decision = shouldKeepLocalAuthoritative({
      rest: toolPart("t1", "error"),
      current: toolPart("t1", "running"),
      lastEventAt: NOW - 100,
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(false)
  })

  test("local running tool state is kept when remote is not terminal (REST behind)", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: toolPart("t1", "running"),
      current: toolPart("t1", "completed"),
      lastEventAt: NOW - 100,
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(true)
    expect(decision.converged).toBe(false)
  })

  test("live local append wins temporarily over the shorter REST snapshot", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: textPart("p2", "hello worl"),
      current: textPart("p2", "hello world"),
      lastEventAt: NOW - 100, // live
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(true)
    expect(decision.converged).toBe(false)
  })

  test("stale local append loses to remote", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: textPart("p2", "hello worl"),
      current: textPart("p2", "hello world"),
      lastEventAt: NOW - 60_000, // silent
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(false)
    expect(decision.converged).toBe(false)
  })

  test("divergent text with completed remote message: remote wins", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: textPart("p3", "A completely different completed answer", true),
      current: textPart("p3", "A stale partial"),
      lastEventAt: NOW - 60_000,
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(false)
    expect(decision.converged).toBe(true)
  })

  test("divergent text while both stream: keep local, report non-convergence", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: textPart("p4", "remote text path"),
      current: textPart("p4", "local text path"),
      lastEventAt: NOW - 100, // live
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(true)
    expect(decision.converged).toBe(false)
  })

  test("identical text: keep local, converged", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: textPart("p5", "same"),
      current: textPart("p5", "same"),
      lastEventAt: NOW - 60_000,
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(true)
    expect(decision.converged).toBe(true)
  })

  test("no local part: remote wins, converged", () => {
    const decision = shouldKeepLocalAuthoritative({
      rest: textPart("p6", "full"),
      current: undefined,
      lastEventAt: 0,
      now: NOW,
      silenceMs: SILENCE,
    })
    expect(decision.keepLocal).toBe(false)
    expect(decision.converged).toBe(true)
  })
})
