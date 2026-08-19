import { describe, expect, test } from "bun:test"
import {
  analyzeDiff,
  classifyGuard,
  DEFAULT_THRESHOLDS,
  enrichMetadata,
  guardWarning,
  isPermissionPolicyPath,
  isSelfAwarenessPath,
} from "../../src/tool/file-edit-guard"

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

describe("analyzeDiff", () => {
  test("counts additions and deletions", () => {
    const stats = analyzeDiff("a\nb\nc", "a\nB\nc\nd")
    // A changed line is reported as one deletion + one addition by diffLines.
    expect(stats.additions).toBe(3)
    expect(stats.deletions).toBe(2)
    expect(stats.totalChanged).toBe(5)
    expect(stats.totalLines).toBe(4)
  })

  test("detects consecutive additions", () => {
    const stats = analyzeDiff("a\nb", "a\n1\n2\n3\n4\nb")
    expect(stats.maxConsecutiveAdditions).toBe(4)
    expect(stats.maxConsecutiveDeletions).toBe(0)
  })

  test("detects consecutive deletions", () => {
    const stats = analyzeDiff("a\n1\n2\n3\n4\nb", "a\nb")
    expect(stats.maxConsecutiveDeletions).toBe(4)
    expect(stats.maxConsecutiveAdditions).toBe(0)
  })

  test("counts unchanged prefix and suffix", () => {
    const stats = analyzeDiff("a\nb\nc\nd\ne", "a\nb\nX\nd\ne")
    expect(stats.unchangedPrefixLines).toBe(2)
    expect(stats.unchangedSuffixLines).toBe(2)
  })

  test("counts hunks", () => {
    const stats = analyzeDiff("a\nb\nc\nd\ne\nf", "a\nB\nc\nd\nE\nf")
    expect(stats.hunkCount).toBe(2)
  })
})

describe("classifyGuard", () => {
  test("classifies wholesale replacement", () => {
    const oldContent = "line\n".repeat(100)
    const newContent = "other\n".repeat(95)
    const stats = analyzeDiff(oldContent, newContent)
    const result = classifyGuard(stats, {
      filePath: "src/index.ts",
      existingFile: true,
      thresholds: DEFAULT_THRESHOLDS,
    })
    expect(result.rules).toContain("WHOLESALE_REPLACEMENT")
  })

  test("classifies large change", () => {
    const oldContent = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n")
    const newContent = oldContent.replace("line 50", "line 50 modified\nextra line")
    const stats = analyzeDiff(oldContent, newContent)
    const result = classifyGuard(stats, {
      filePath: "src/index.ts",
      existingFile: true,
      thresholds: DEFAULT_THRESHOLDS,
    })
    expect(result.rules).not.toContain("LARGE_CHANGE")
  })

  test("classifies block deletion", () => {
    const oldContent = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n")
    const removed = Array.from({ length: 25 }, (_, i) => `line ${i + 5}`).join("\n") + "\n"
    const newContent = oldContent.replace(removed, "")
    const stats = analyzeDiff(oldContent, newContent)
    const result = classifyGuard(stats, {
      filePath: "src/index.ts",
      existingFile: true,
      thresholds: DEFAULT_THRESHOLDS,
    })
    expect(result.rules).toContain("BLOCK_DELETION")
  })

  test("classifies block insertion", () => {
    const oldContent = "line 1\nline 2"
    const newContent = "line 1\n" + "inserted\n".repeat(35) + "line 2"
    const stats = analyzeDiff(oldContent, newContent)
    const result = classifyGuard(stats, {
      filePath: "src/index.ts",
      existingFile: true,
      thresholds: DEFAULT_THRESHOLDS,
    })
    expect(result.rules).toContain("BLOCK_INSERTION")
  })

  test("flags permission policy edits", () => {
    const stats = analyzeDiff("{}", "{ \"x\": 1 }")
    const result = classifyGuard(stats, {
      filePath: ".arcana/permissions.json",
      existingFile: true,
      thresholds: DEFAULT_THRESHOLDS,
    })
    expect(result.rules).toContain("PERMISSION_POLICY_EDIT")
  })

  test("flags manifest edits", () => {
    const stats = analyzeDiff('"a"', '"b"')
    const result = classifyGuard(stats, {
      filePath: "package.json",
      existingFile: true,
      thresholds: DEFAULT_THRESHOLDS,
      isDependencyManifest: true,
    })
    expect(result.rules).toContain("MANIFEST_EDIT")
  })

  test("self-awareness destructive rewrite", () => {
    const stats = analyzeDiff("a\n".repeat(100), "b\n".repeat(100))
    const result = classifyGuard(stats, {
      filePath: ".arcana/memory.md",
      existingFile: true,
      thresholds: DEFAULT_THRESHOLDS,
    })
    expect(result.rules).toContain("SELF_AWARENESS_DESTRUCTIVE")
  })

  test("file delete and move rules", () => {
    const stats = analyzeDiff("x", "")
    expect(classifyGuard(stats, { filePath: "a.txt", existingFile: true, type: "delete", thresholds: DEFAULT_THRESHOLDS }).rules).toContain("FILE_DELETE")
    expect(classifyGuard(stats, { filePath: "a.txt", existingFile: true, type: "move", thresholds: DEFAULT_THRESHOLDS }).rules).toContain("FILE_MOVE")
  })
})

describe("guardWarning", () => {
  test("mentions block deletion", () => {
    const oldContent = "a\n" + Array.from({ length: 25 }, (_, i) => String(i + 1)).join("\n") + "\nb"
    const stats = analyzeDiff(oldContent, "a\nb")
    const guard = enrichMetadata(stats, true, DEFAULT_THRESHOLDS)
    guard.guard_rules = classifyGuard(stats, { filePath: "x.ts", existingFile: true, thresholds: DEFAULT_THRESHOLDS }).rules
    const warning = guardWarning(stats, guard)
    expect(warning).toContain("BLOCK DELETION")
  })

  test("mentions permission policy", () => {
    const stats = analyzeDiff("{}", "{ \"x\": 1 }")
    const guard = enrichMetadata(stats, true, DEFAULT_THRESHOLDS)
    guard.guard_rules = classifyGuard(stats, { filePath: ".arcana/permissions.json", existingFile: true, thresholds: DEFAULT_THRESHOLDS }).rules
    const warning = guardWarning(stats, guard)
    expect(warning).toContain("PERMISSION POLICY")
  })
})
