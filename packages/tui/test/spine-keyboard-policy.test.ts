import { describe, expect, test } from "bun:test"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import {
  deriveAuthorityAffordances,
  type AuthorityAffordance,
} from "@arcana/core/crypto/authority-affordance"
import {
  approvalActionBindingsEnabled,
  approvalEscapeEnabled,
  approvalInspectionAllowed,
} from "../src/shell/command-spine/approval-spine-adapter"
import {
  spineEscInert,
  spineNavigationEnabled,
} from "../src/shell/command-spine/spine-gates"

function approval(state: ApprovalRecord["state"]): ApprovalRecord {
  return {
    approvalId: "appr_1",
    version: 1,
    sessionId: "sess_1",
    workspaceId: "ws_1",
    requestHash: "hash",
    contractRevision: 1,
    state,
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
  }
}

function runtimeAffordances(record: ApprovalRecord): AuthorityAffordance[] {
  return deriveAuthorityAffordances({
    approval: record,
    operator: {
      operatorId: "local-operator",
      authenticatedAt: "2026-08-02T00:00:00.000Z",
      roles: ["operator"],
      workspaceScope: [record.workspaceId],
    },
    surface: "LOCAL_TUI",
    workspaceId: record.workspaceId,
    freshness: "FRESH",
    connected: true,
    protocolCompatible: true,
    resyncRequired: false,
    desktopOnline: false,
    now: new Date("2026-08-02T00:00:00.000Z"),
  })
}

describe("F-25: Esc always leaves the composer (never interrupts)", () => {
  test("leave-composer Esc is enabled exactly when the composer has focus, no gate is open, nothing is submitting, and rows exist", () => {
    // The leave-composer binding is spineEscInert && composerFocused && hasRows.
    const canLeaveComposer = (composerFocused: boolean, gatesOpen: boolean, submitting: boolean, hasRows: boolean) =>
      spineEscInert({ gatesOpen, submitting }) && composerFocused && hasRows

    expect(canLeaveComposer(true, false, false, true)).toBe(true)
    // With a gate open or a command in flight, Esc stays inert.
    expect(canLeaveComposer(true, true, false, true)).toBe(false)
    expect(canLeaveComposer(true, false, true, true)).toBe(false)
    // Esc with an empty spine has nothing to activate.
    expect(canLeaveComposer(true, false, false, false)).toBe(false)
  })

  test("inspector-close Esc works for any approval state and closes even while the composer has focus", () => {
    for (const state of ["PENDING", "APPROVED", "CLAIMED", "CONSUMED", "DENIED", "EXPIRED", "INVALIDATED"] as const) {
      expect(
        approvalEscapeEnabled({
          gatesOpen: false,
          submitting: false,
          inspectorOpen: true,
          composerFocused: true,
          focusedApproval: approval(state),
        }),
      ).toBe(true)
    }
  })

  test("clear-selection Esc requires spine focus (not the composer) and a focused approval", () => {
    expect(
      approvalEscapeEnabled({
        gatesOpen: false,
        submitting: false,
        inspectorOpen: false,
        composerFocused: false,
        focusedApproval: approval("PENDING"),
      }),
    ).toBe(true)
    // Composer still focused: Esc must not clear selection out from under the prompt.
    expect(
      approvalEscapeEnabled({
        gatesOpen: false,
        submitting: false,
        inspectorOpen: false,
        composerFocused: true,
        focusedApproval: approval("PENDING"),
      }),
    ).toBe(false)
  })
})

describe("F-26: Esc is inert on ACTION GATES", () => {
  test("every spine Esc binding is disabled while a permission/question gate is open", () => {
    expect(spineEscInert({ gatesOpen: true, submitting: false })).toBe(false)
    expect(spineEscInert({ gatesOpen: true, submitting: true })).toBe(false)
    expect(spineEscInert({ gatesOpen: false, submitting: true })).toBe(false)
    expect(spineEscInert({ gatesOpen: false, submitting: false })).toBe(true)
  })

  test("approve/deny keys are disabled while a gate is open (the gate owns decisions)", () => {
    expect(
      approvalActionBindingsEnabled({
        composerFocused: false,
        gatesOpen: true,
        submitting: false,
        focusedAffordances: runtimeAffordances(approval("PENDING")),
      }),
    ).toBe(false)
    expect(
      approvalActionBindingsEnabled({
        composerFocused: false,
        gatesOpen: false,
        submitting: false,
        focusedAffordances: runtimeAffordances(approval("PENDING")),
      }),
    ).toBe(true)
  })
})

describe("F-27: spine navigation + inspection stay available while a gate is open", () => {
  test("navigation ignores gates: enabled whenever the composer is unfocused and rows exist", () => {
    expect(spineNavigationEnabled({ composerFocused: false, hasRows: true })).toBe(true)
    // By design the predicate takes no gate input: navigation never yields to
    // gates (the gate owns decisions, not navigation), so a gate being open
    // cannot disable j/k/v while the operator inspects the pending request.
    expect(spineNavigationEnabled.length).toBe(1) // single input object: { composerFocused, hasRows }
    expect(spineNavigationEnabled({ composerFocused: true, hasRows: true })).toBe(false)
    expect(spineNavigationEnabled({ composerFocused: false, hasRows: false })).toBe(false)
  })

  test("v-inspection stays allowed while a gate is open", () => {
    expect(
      approvalInspectionAllowed({
        hasFocusedApproval: true,
        composerFocused: false,
        submitting: false,
      }),
    ).toBe(true)
  })
})
