import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { gitAddArgs, gitCommitArgs, gitDiffArgs, resolveSandboxScriptPath } from "./tools.js"

describe("agent Git tool command arguments", () => {
  test("builds git diff argv with an end-of-options marker before a file", () => {
    expect(gitDiffArgs({ staged: true, file: 'src/a"; rm -rf . #.ts' })).toEqual([
      "diff",
      "--staged",
      "--",
      'src/a"; rm -rf . #.ts',
    ])
  })

  test("stages paths as literal argv entries", () => {
    expect(gitAddArgs('src/a.ts --upload-pack=evil README.md')).toEqual([
      "add",
      "--",
      "src/a.ts",
      "--upload-pack=evil",
      "README.md",
    ])
  })

  test("passes commit messages as one literal argument", () => {
    const message = 'fix: close quote" && git push --force origin master && echo "'
    expect(gitCommitArgs(message)).toEqual(["commit", "-m", message])
  })

  test("defaults git add to the current tree through argv", () => {
    expect(gitAddArgs(undefined)).toEqual(["add", "--", "."])
  })
})

describe("env_write sandbox path (ARC-SEC-I05)", () => {
  const root = join("/tmp", "arcana-sandbox-test")

  test("accepts a plain basename", () => {
    const p = resolveSandboxScriptPath(root, "analyze.py")
    expect(p.endsWith("analyze.py")).toBe(true)
    expect(p.includes("..")).toBe(false)
  })

  test("strips directory components and keeps basename only", () => {
    const p = resolveSandboxScriptPath(root, "nested/evil.py")
    expect(p.endsWith("evil.py")).toBe(true)
    expect(p.includes("nested")).toBe(false)
  })

  test("rejects absolute paths", () => {
    expect(() => resolveSandboxScriptPath(root, "/etc/passwd")).toThrow(/absolute/)
    expect(() => resolveSandboxScriptPath(root, "C:\\Windows\\system.ini")).toThrow(/absolute/)
  })

  test("rejects parent traversal", () => {
    expect(() => resolveSandboxScriptPath(root, "../escape.py")).toThrow(/traversal/)
    expect(() => resolveSandboxScriptPath(root, "foo/../../escape.py")).toThrow(/traversal/)
  })

  test("rejects empty and null-byte names", () => {
    expect(() => resolveSandboxScriptPath(root, "")).toThrow(/required/)
    expect(() => resolveSandboxScriptPath(root, "x\0y.py")).toThrow(/invalid/)
  })
})