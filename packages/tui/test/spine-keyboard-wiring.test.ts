import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const shellSource = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"),
  "utf8",
)
const authorityActionsSource = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/use-authority-actions.ts"),
  "utf8",
)

/**
 * Source-contract guards for the F-24..F-28 keyboard wiring inside the
 * Command Spine shell. The pure policies are covered in
 * spine-keyboard-policy.test.ts; these guards pin the shell to them so the
 * bindings cannot drift back to inline conditions.
 */
describe("spine keyboard wiring source contract (F-24..F-28)", () => {
  test("F-24: v on a non-approval row shows guidance toast instead of failing silently", () => {
    expect(shellSource).toContain("No approval to inspect")
    expect(shellSource).toContain("use o for entry details")
    expect(shellSource).toContain("toast.show")
  })

  test("F-25: Esc leave-composer binding is wired through the inert policy and never interrupts", () => {
    expect(shellSource).toContain("Leave composer and activate spine keys (never interrupts)")
    expect(shellSource).toContain("spineEscInert")
    expect(shellSource).toContain("blurComposer()")
  })

  test("F-26: every spine Esc binding routes through spineEscInert (gates + submitting disable them)", () => {
    // Leave-composer, return-to-composer, and close-inspector bindings all gate on it.
    const occurrences = shellSource.split("spineEscInert(").length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
    // The approval action policy moved into the extracted authority-actions
    // hook (PR5 split); the shell delegates through authority.approvalActionBindingsEnabled().
    expect(authorityActionsSource).toContain("approvalActionBindingsEnabledPolicy")
    expect(shellSource).toContain("gatesOpen: gatesOpen()")
  })

  test("F-27: navigation binding routes through spineNavigationEnabled (no gate input)", () => {
    expect(shellSource).toContain("spineNavigationEnabled({")
    expect(shellSource).toContain("composerFocused: composerFocused()")
  })

  test("F-28: v on a focused permission gate opens the read-only PermissionInspector", () => {
    expect(shellSource).toContain("<PermissionInspector request={gate} />")
    expect(shellSource).toContain("focusedGateRequest()")
    expect(shellSource).toContain("blurComposer()")
  })

  test("F-23: approval inspect/approve/deny bindings exist on the approval layer", () => {
    expect(shellSource).toContain('desc: "Approve once"')
    expect(shellSource).toContain('desc: "Deny approval"')
    expect(shellSource).toContain('desc: "Inspect approval"')
    expect(shellSource).toContain("priority: 2")
  })
})
