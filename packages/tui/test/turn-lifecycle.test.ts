import { describe, expect, test } from "bun:test"
import {
  buildTurnLifecycle,
  isAssistantSegmentStreaming,
  isSessionTurnActive,
  type TurnLifecycle,
} from "../src/shell/command-spine/turn-lifecycle"

function L(partial: Partial<TurnLifecycle>): TurnLifecycle {
  return {
    messageCompleted: false,
    messageFinished: false,
    sessionIdle: false,
    sessionTurnActive: true,
    isLatestAssistant: true,
    segmentSuperseded: false,
    partEnded: false,
    ...partial,
  }
}

describe("isSessionTurnActive", () => {
  test("busy and retry are active", () => {
    expect(isSessionTurnActive("busy")).toBe(true)
    expect(isSessionTurnActive("retry")).toBe(true)
  })

  test("idle and missing status are not active (engine default idle)", () => {
    expect(isSessionTurnActive("idle")).toBe(false)
    expect(isSessionTurnActive(undefined)).toBe(false)
    expect(isSessionTurnActive("")).toBe(false)
  })
})

describe("isAssistantSegmentStreaming", () => {
  test("mid-flight latest assistant streams only while turn active", () => {
    expect(isAssistantSegmentStreaming("plan", L({ sessionTurnActive: true }))).toBe(true)
    expect(isAssistantSegmentStreaming("ok", L({ sessionTurnActive: true }))).toBe(true)
    expect(isAssistantSegmentStreaming("think", L({ sessionTurnActive: true }))).toBe(true)
  })

  test("message.time.completed stops streaming", () => {
    expect(isAssistantSegmentStreaming("plan", L({ messageCompleted: true }))).toBe(false)
    expect(isAssistantSegmentStreaming("ok", L({ messageCompleted: true }))).toBe(false)
  })

  test("message.finish stops streaming even without completed", () => {
    expect(isAssistantSegmentStreaming("plan", L({ messageFinished: true }))).toBe(false)
    expect(isAssistantSegmentStreaming("ok", L({ messageFinished: true }))).toBe(false)
  })

  test("session idle + latest assistant stops writing (completed missing)", () => {
    expect(
      isAssistantSegmentStreaming(
        "plan",
        L({ sessionIdle: true, sessionTurnActive: false, isLatestAssistant: true, messageCompleted: false }),
      ),
    ).toBe(false)
  })

  test("missing session status stops writing (post-idle poll omits idle keys)", () => {
    // After engine idle, status map deletes the session; TUI poll leaves undefined.
    // That must not resurrect the writing shimmer.
    expect(
      isAssistantSegmentStreaming(
        "plan",
        L({ sessionTurnActive: false, sessionIdle: true, messageCompleted: false }),
      ),
    ).toBe(false)
  })

  test("older assistant never shows writing chrome", () => {
    expect(
      isAssistantSegmentStreaming(
        "plan",
        L({ isLatestAssistant: false, sessionTurnActive: true, messageCompleted: false }),
      ),
    ).toBe(false)
  })

  test("segment superseded stops plan/think streaming", () => {
    expect(isAssistantSegmentStreaming("plan", L({ segmentSuperseded: true }))).toBe(false)
    expect(isAssistantSegmentStreaming("think", L({ segmentSuperseded: true }))).toBe(false)
  })

  test("partEnded stops streaming", () => {
    expect(isAssistantSegmentStreaming("think", L({ partEnded: true }))).toBe(false)
  })
})

describe("buildTurnLifecycle", () => {
  test("reads completed finish idle part end", () => {
    const life = buildTurnLifecycle({
      message: { role: "assistant", time: { completed: 99 }, finish: "stop" },
      part: { time: { end: 50 } },
      segmentSuperseded: false,
      isLatestAssistant: true,
      sessionStatusType: "idle",
    })
    expect(life.messageCompleted).toBe(true)
    expect(life.messageFinished).toBe(true)
    expect(life.partEnded).toBe(true)
    expect(life.sessionIdle).toBe(true)
    expect(life.sessionTurnActive).toBe(false)
    expect(isAssistantSegmentStreaming("plan", life)).toBe(false)
  })

  test("busy session without completed still streams latest", () => {
    const life = buildTurnLifecycle({
      message: { role: "assistant", time: {} },
      segmentSuperseded: false,
      isLatestAssistant: true,
      sessionStatusType: "busy",
    })
    expect(life.sessionIdle).toBe(false)
    expect(life.sessionTurnActive).toBe(true)
    expect(isAssistantSegmentStreaming("plan", life)).toBe(true)
  })

  test("undefined session status is not active (no eternal writing)", () => {
    const life = buildTurnLifecycle({
      message: { role: "assistant", time: {} },
      segmentSuperseded: false,
      isLatestAssistant: true,
      sessionStatusType: undefined,
    })
    expect(life.sessionTurnActive).toBe(false)
    expect(life.sessionIdle).toBe(true)
    expect(isAssistantSegmentStreaming("plan", life)).toBe(false)
  })

  test("retry is an active turn", () => {
    const life = buildTurnLifecycle({
      message: { role: "assistant", time: {} },
      segmentSuperseded: false,
      isLatestAssistant: true,
      sessionStatusType: "retry",
    })
    expect(life.sessionTurnActive).toBe(true)
    expect(isAssistantSegmentStreaming("plan", life)).toBe(true)
  })
})
