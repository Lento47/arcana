import { describe, expect, test } from "bun:test"
import { isPermissionPolicyPath, isSelfAwarenessPath } from "../../src/tool/file-edit-guard"

describe("file-edit-guard self-awareness", () => {
  test("recognizes self-awareness paths", () => {
    expect(isSelfAwarenessPath(".arcana/memory.md")).toBe(true)
    expect(isSelfAwarenessPath(".arcana/backups/foo.bak")).toBe(true)
    expect(isSelfAwarenessPath(".opencode/settings.json")).toBe(true)
    expect(isSelfAwarenessPath("notes.memory.md")).toBe(true)
    expect(isSelfAwarenessPath("~/.arcana/config.json")).toBe(true)
    expect(isSelfAwarenessPath("C:\\Users\\x\\.arcana\\config.json")).toBe(true)
  })

  test("rejects non-self-awareness paths", () => {
    expect(isSelfAwarenessPath("src/index.ts")).toBe(false)
    expect(isSelfAwarenessPath("package.json")).toBe(false)
    expect(isSelfAwarenessPath("README.md")).toBe(false)
    expect(isSelfAwarenessPath("~/.ssh/config")).toBe(false)
  })

  test("permission-policy paths are not self-awareness", () => {
    expect(isSelfAwarenessPath(".arcana/permissions.json")).toBe(false)
    expect(isSelfAwarenessPath(".opencode/permissions.json")).toBe(false)
    expect(isPermissionPolicyPath(".arcana/permissions.json")).toBe(true)
    expect(isPermissionPolicyPath(".opencode/permissions.json")).toBe(true)
    expect(isPermissionPolicyPath("~/.arcana/permission.json")).toBe(true)
    expect(isPermissionPolicyPath("src/index.ts")).toBe(false)
    expect(isPermissionPolicyPath(".arcana/memory.md")).toBe(false)
  })
})
