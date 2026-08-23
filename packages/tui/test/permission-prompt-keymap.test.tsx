import { describe, expect, test } from "bun:test"
import {
  PERMISSION_DECISION_LAYER_PRIORITY,
  canRememberPermission,
  createPermissionOptionBindings,
  createPermissionRejectBindings,
  permissionDecisionOptions,
} from "../src/routes/session/permission"
import type { PermissionRequest } from "@arcana/sdk/v2"

describe("PermissionPrompt keymap layer", () => {
  const contractRequest: PermissionRequest = {
    id: "per_contract",
    sessionID: "ses_contract",
    permission: "contract.accept",
    patterns: ["ses_contract"],
    metadata: { kind: "contract_admission", objective: "Fix permission persistence" },
    always: ["*"],
  }

  test("base-mode decision priority stays above command-spine disclosure", () => {
    expect(PERMISSION_DECISION_LAYER_PRIORITY).toBe(10)
  })

  test("Enter confirms the selected permission exactly once", () => {
    const submitted: string[] = []
    let selected = "once"
    const bindings = createPermissionOptionBindings({
      keys: ["once", "always", "reject"],
      selected: () => selected,
      select: (next) => {
        selected = next
      },
      submit: (next) => submitted.push(next),
    })

    const enter = bindings.find((binding) => binding.key === "return")
    expect(enter?.preventDefault).toBe(true)
    enter?.cmd()
    expect(submitted).toEqual(["once"])
  })

  test("arrow selection and reject confirmation use explicit callbacks", () => {
    let selected = "once"
    let confirmed = 0
    let cancelled = 0
    const options = createPermissionOptionBindings({
      keys: ["once", "always", "reject"],
      selected: () => selected,
      select: (next) => {
        selected = next
      },
      submit: () => {},
    })

    options.find((binding) => binding.key === "right")?.cmd()
    options.find((binding) => binding.key === "right")?.cmd()
    expect(selected).toBe("reject")

    const reject = createPermissionRejectBindings({
      confirm: () => confirmed++,
      cancel: () => cancelled++,
    })
    const enter = reject.find((binding) => binding.key === "return")
    expect(enter?.preventDefault).toBe(true)
    enter?.cmd()
    reject.find((binding) => binding.key === "escape")?.cmd()
    expect({ confirmed, cancelled }).toEqual({ confirmed: 1, cancelled: 1 })
  })

  test("contract admission defaults Enter to confirmed persistent activation", () => {
    expect(canRememberPermission(contractRequest)).toBe(true)
    expect(permissionDecisionOptions(contractRequest)).toEqual({
      always: "Always activate",
      once: "Activate once",
      reject: "Decline",
    })
    expect(Object.keys(permissionDecisionOptions({ ...contractRequest, always: [] }))).toEqual(["once", "reject"])
  })
})
