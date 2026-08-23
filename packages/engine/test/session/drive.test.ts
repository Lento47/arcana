import { describe, expect, test } from "bun:test"
import {
  DEFAULT_MAX_CONTINUATIONS,
  continuationsUsed,
  decideDrive,
  driveProgressFingerprint,
  isDriveAgent,
  noProgressContinuations,
  resolveDriveConfig,
  type DriveSnapshot,
} from "../../src/session/drive"

function snap(overrides: Partial<DriveSnapshot> = {}): DriveSnapshot {
  return {
    enabled: true,
    agent: "build",
    goalStatus: "in_progress",
    pendingQuestions: 0,
    pendingPermissions: 0,
    pendingApprovals: 0,
    cancelled: false,
    pepDeniedRequired: false,
    hadToolActivity: true,
    noProgressContinuations: 0,
    continuationsUsed: 0,
    maxContinuations: DEFAULT_MAX_CONTINUATIONS,
    ...overrides,
  }
}

describe("decideDrive", () => {
  test("continues while the goal is open and nothing is waiting", () => {
    expect(decideDrive(snap())).toEqual({ action: "continue", reason: "goal_open" })
  })

  test("does not drive explore / reviewer / plan", () => {
    expect(decideDrive(snap({ agent: "explore" }))).toEqual({ action: "stop", reason: "agent_exempt" })
    expect(decideDrive(snap({ agent: "reviewer" }))).toEqual({ action: "stop", reason: "agent_exempt" })
    expect(decideDrive(snap({ agent: "plan" }))).toEqual({ action: "stop", reason: "agent_exempt" })
  })

  test("drives general as well as build", () => {
    expect(isDriveAgent("general")).toBe(true)
    expect(decideDrive(snap({ agent: "general" })).action).toBe("continue")
  })

  test("pauses when a question, permission, or approval is pending", () => {
    expect(decideDrive(snap({ pendingQuestions: 1 }))).toEqual({ action: "stop", reason: "decision_required" })
    expect(decideDrive(snap({ pendingPermissions: 1 }))).toEqual({ action: "stop", reason: "decision_required" })
    expect(decideDrive(snap({ pendingApprovals: 1 }))).toEqual({ action: "stop", reason: "decision_required" })
  })

  test("stops on pure-text responses (no tool activity) even with an open goal", () => {
    const result = decideDrive(snap({ hadToolActivity: false }))
    expect(result).toEqual({ action: "stop", reason: "conversational" })
  })

  test("continues when the model invoked tools and the goal is open", () => {
    expect(decideDrive(snap({ hadToolActivity: true })).action).toBe("continue")
  })

  test("stops when the goal is complete, blocked, stale, or unset", () => {
    expect(decideDrive(snap({ goalStatus: "complete" }))).toEqual({ action: "stop", reason: "goal_complete" })
    expect(decideDrive(snap({ goalStatus: "complete_unverified" }))).toEqual({ action: "stop", reason: "goal_complete" })
    expect(decideDrive(snap({ goalStatus: "blocked" }))).toEqual({ action: "stop", reason: "goal_blocked" })
    expect(decideDrive(snap({ goalStatus: "stale" }))).toEqual({ action: "stop", reason: "goal_stale" })
    expect(decideDrive(snap({ goalStatus: "unset" }))).toEqual({ action: "stop", reason: "no_goal" })
  })

  test("stops at the continuation cap", () => {
    expect(decideDrive(snap({ continuationsUsed: 6 }))).toEqual({ action: "stop", reason: "exhausted" })
    expect(decideDrive(snap({ continuationsUsed: 5 })).action).toBe("continue")
  })

  test("stops after two identical progress boundaries", () => {
    expect(decideDrive(snap({ noProgressContinuations: 1 })).action).toBe("continue")
    expect(decideDrive(snap({ noProgressContinuations: 2 }))).toEqual({ action: "stop", reason: "no_progress" })
  })

  test("respects disabled, cancelled, and pep deny", () => {
    expect(decideDrive(snap({ enabled: false }))).toEqual({ action: "stop", reason: "disabled" })
    expect(decideDrive(snap({ cancelled: true }))).toEqual({ action: "stop", reason: "cancelled" })
    expect(decideDrive(snap({ pepDeniedRequired: true }))).toEqual({ action: "stop", reason: "pep_denied" })
  })
})

describe("resolveDriveConfig / continuationsUsed", () => {
  test("defaults to enabled with 6 continuations", () => {
    expect(resolveDriveConfig({})).toEqual({ enabled: true, maxContinuations: 6 })
    expect(resolveDriveConfig({ enabled: false, maxContinuations: 0 })).toEqual({
      enabled: false,
      maxContinuations: 6,
    })
    expect(resolveDriveConfig({ maxContinuations: 3 }).maxContinuations).toBe(3)
  })

  test("reads continuation count from session metadata", () => {
    expect(continuationsUsed(undefined)).toBe(0)
    expect(continuationsUsed({ __arcana_drive_continuations: 2 })).toBe(2)
    expect(continuationsUsed({ __arcana_drive_continuations: -1 })).toBe(0)
  })

  test("tracks semantic tool progress without depending on call ids", () => {
    const one = driveProgressFingerprint({
      goalStatus: "in_progress",
      tools: [{ tool: "read", status: "completed", input: { file: "a.ts" }, output: "same" }],
    })
    const two = driveProgressFingerprint({
      goalStatus: "in_progress",
      tools: [{ tool: "read", status: "completed", input: { file: "a.ts" }, output: "same" }],
    })
    const changed = driveProgressFingerprint({
      goalStatus: "in_progress",
      tools: [{ tool: "read", status: "completed", input: { file: "b.ts" }, output: "same" }],
    })
    expect(one).toBe(two)
    expect(changed).not.toBe(one)
    expect(noProgressContinuations({ __arcana_drive_no_progress: 2 })).toBe(2)
  })
})
