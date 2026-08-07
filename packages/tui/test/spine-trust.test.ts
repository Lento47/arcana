import { describe, expect, test } from "bun:test"
import { buildTrustStatus, eventGapFromTrace } from "../src/shell/command-spine/spine-trust"

describe("PR6 trust-first header model", () => {
  test("healthy when connected, trace complete, proof valid, no gaps", () => {
    const trust = buildTrustStatus({
      syncStatus: "complete",
      streamActive: true,
      trace: "COMPLETE",
      integrity: "VALID",
      proofLevel: "P3",
      pendingApprovals: 1,
    })
    expect(trust.state).toBe("healthy")
    expect(trust.workspaceTrusted).toBe(true)
    expect(trust.authorityActionsDisabled).toBe(false)
    expect(trust.pendingApprovals).toBe(1)
    expect(trust.proofLevel).toBe("P3")
  })

  test("degraded + authority disabled when the trace has a gap", () => {
    const trust = buildTrustStatus({
      syncStatus: "complete",
      streamActive: true,
      trace: "DEGRADED",
      integrity: "VALID",
      pendingApprovals: 0,
      eventGap: { from: 441, to: 447 },
    })
    expect(trust.state).toBe("degraded")
    expect(trust.workspaceTrusted).toBe(false)
    expect(trust.authorityActionsDisabled).toBe(true)
    expect(trust.eventGap).toEqual({ from: 441, to: 447 })
  })

  test("invalid or unverified proof disables authority actions", () => {
    for (const integrity of ["INVALID", "UNVERIFIED"] as const) {
      const trust = buildTrustStatus({
        syncStatus: "complete",
        streamActive: true,
        trace: "COMPLETE",
        integrity,
        pendingApprovals: 0,
      })
      expect(trust.state).toBe("degraded")
      expect(trust.authorityActionsDisabled).toBe(true)
    }
  })

  test("disconnected while bootstrap is loading", () => {
    const trust = buildTrustStatus({
      syncStatus: "loading",
      streamActive: false,
      trace: "COMPLETE",
      integrity: "VALID",
      pendingApprovals: 0,
    })
    expect(trust.state).toBe("disconnected")
    expect(trust.authorityActionsDisabled).toBe(true)
  })

  test("eventGapFromTrace derives missing range from expected/recorded counts", () => {
    expect(
      eventGapFromTrace({ trace: "COMPLETE", expectedCriticalEvents: 2, recordedCriticalEvents: 2 }),
    ).toBeUndefined()
    expect(
      eventGapFromTrace({ trace: "DEGRADED", expectedCriticalEvents: 447, recordedCriticalEvents: 440 }),
    ).toEqual({ from: 441, to: 447 })
    expect(eventGapFromTrace({ trace: "UNAVAILABLE" })).toBeUndefined()
  })
})
