import { describe, expect, test } from "bun:test"
import {
  buildTurnLifecycle,
  deriveComposerRunState,
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

describe("deriveComposerRunState", () => {
  const base = {
    hasQuestions: false,
    hasLocalPermissions: false,
    hasPermissions: false,
    pending: true,
  }

  test("distinguishes active work from provider retry backoff", () => {
    expect(deriveComposerRunState({ ...base, sessionStatusType: "busy" })).toBe("working")
    expect(deriveComposerRunState({ ...base, sessionStatusType: "retry" })).toBe("retrying")
    expect(deriveComposerRunState({ ...base, sessionStatusType: "idle" })).toBe("idle")
    expect(deriveComposerRunState({ ...base, sessionStatusType: undefined })).toBe("idle")
  })

  test("pending message is required for working chrome", () => {
    expect(deriveComposerRunState({ ...base, pending: false, sessionStatusType: "busy" })).toBe("idle")
  })

  test("operator gates take precedence over active work", () => {
    expect(deriveComposerRunState({ ...base, hasQuestions: true, sessionStatusType: "busy" })).toBe("stop")
    expect(deriveComposerRunState({ ...base, hasLocalPermissions: true, sessionStatusType: "busy" })).toBe("stop")
    expect(deriveComposerRunState({ ...base, hasPermissions: true, sessionStatusType: "busy" })).toBe("waiting")
    expect(deriveComposerRunState({ ...base, sessionStatusType: "waiting" })).toBe("waiting")
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

  test("explicit partEnded override wins over primary part.time.end", () => {
    // Multi-part plan/ok: primary may be closed while a later text part still streams.
    // Callers pass partEnded=false even when part.time.end is set.
    const stillOpen = buildTurnLifecycle({
      message: { role: "assistant", time: {} },
      part: { time: { end: 50 } },
      partEnded: false,
      segmentSuperseded: false,
      isLatestAssistant: true,
      sessionStatusType: "busy",
    })
    expect(stillOpen.partEnded).toBe(false)
    expect(isAssistantSegmentStreaming("plan", stillOpen)).toBe(true)

    const allClosed = buildTurnLifecycle({
      message: { role: "assistant", time: {} },
      part: { time: { end: 1 } },
      partEnded: true,
      segmentSuperseded: false,
      isLatestAssistant: true,
      sessionStatusType: "busy",
    })
    expect(allClosed.partEnded).toBe(true)
    expect(isAssistantSegmentStreaming("ok", allClosed)).toBe(false)
  })

  test("without override, part.time.end still drives partEnded", () => {
    const fromPart = buildTurnLifecycle({
      message: { role: "assistant", time: {} },
      part: { time: { end: 99 } },
      segmentSuperseded: false,
      isLatestAssistant: true,
      sessionStatusType: "busy",
    })
    expect(fromPart.partEnded).toBe(true)
    expect(isAssistantSegmentStreaming("think", fromPart)).toBe(false)
  })
})
