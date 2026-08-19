import { describe, expect, test } from "bun:test"
import {
  classifyMutation,
  classifyPatch,
  singleMutationPermission,
} from "../../src/tool/mutation-permission"
import { enrichMetadata, analyzeDiff, DEFAULT_THRESHOLDS } from "../../src/tool/file-edit-guard"

function guard(oldContent: string, newContent: string, exists = true) {
  return enrichMetadata(analyzeDiff(oldContent, newContent), exists, DEFAULT_THRESHOLDS)
}

/** Many-line edit with a single changed line — below wholesale/large thresholds. */
function safeUpdate(): ReturnType<typeof guard> {
  const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n")
  const changed = lines.replace("line 50", "line 50 modified")
  return guard(lines, changed)
}

describe("mutation-permission", () => {
  test("classifyMutation recognises self-awareness paths", () => {
    expect(classifyMutation(".arcana/memory.md", guard("", "x", false)).selfAware).toBe(true)
    expect(classifyMutation(".opencode/settings.json", guard("", "x", false)).selfAware).toBe(true)
    expect(classifyMutation("notes.memory.md", guard("", "x", false)).selfAware).toBe(true)
  })

  test("permission-policy files are never self-aware", () => {
    expect(classifyMutation(".arcana/permissions.json", guard("", "x", false)).selfAware).toBe(false)
    expect(classifyMutation(".opencode/permissions.yaml", guard("", "x", false)).selfAware).toBe(false)
  })

  test("ordinary paths are not self-aware", () => {
    expect(classifyMutation("src/index.ts", safeUpdate()).selfAware).toBe(false)
    expect(classifyMutation("package.json", safeUpdate()).selfAware).toBe(false)
  })

  test("large self-awareness edits are destructive", () => {
    const small = safeUpdate()
    const large = guard("a\n".repeat(100), "b\n".repeat(100))
    expect(classifyMutation(".arcana/memory.md", small).destructive).toBe(false)
    expect(classifyMutation(".arcana/memory.md", large).destructive).toBe(true)
  })

  test("singleMutationPermission routes self-awareness to dedicated permission", () => {
    const result = singleMutationPermission(".arcana/memory.md", ".arcana/memory.md", guard("", "x", false))
    expect(result.permission).toBe("self_awareness")
    expect(result.always).toEqual([".arcana/memory.md"])
    expect(result.metadata.self_awareness).toBe(true)
  })

  test("singleMutationPermission requires approval for destructive self-awareness edits", () => {
    const large = guard("a\n".repeat(100), "b\n".repeat(100))
    const result = singleMutationPermission(".arcana/memory.md", ".arcana/memory.md", large)
    expect(result.permission).toBe("self_awareness")
    expect(result.always).toEqual(["*"])
  })

  test("singleMutationPermission keeps dependency manifests on their own always path", () => {
    const result = singleMutationPermission("package.json", "package.json", safeUpdate())
    expect(result.permission).toBe("edit")
    expect(result.always).toEqual(["package.json"])
  })

  test("classifyPatch requires approval when any file is permission-policy", () => {
    const result = classifyPatch([
      { filePath: ".arcana/memory.md", guard: guard("", "x", false), type: "add" },
      { filePath: ".arcana/permissions.json", guard: guard("", "x", false), type: "add" },
    ])
    expect(result.selfAware).toBe(false)
    expect(result.permissionPolicy).toBe(true)
  })

  test("classifyPatch treats delete/move under self-awareness as destructive", () => {
    const result = classifyPatch([
      { filePath: ".arcana/memory.md", guard: guard("x", "", true), type: "delete" },
    ])
    expect(result.selfAware).toBe(true)
    expect(result.destructive).toBe(true)
  })

  test("classifyPatch allows safe multi-file self-awareness patch", () => {
    const result = classifyPatch([
      { filePath: ".arcana/memory.md", guard: guard("", "x", false), type: "add" },
      { filePath: ".opencode/plans.md", guard: safeUpdate(), type: "update" },
    ])
    expect(result.selfAware).toBe(true)
    expect(result.destructive).toBe(false)
    expect(result.permissionPolicy).toBe(false)
  })
})
