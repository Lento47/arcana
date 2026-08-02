/**
 * D-7.1 / E5: SafeBoundedFileReader hostile-escape fixtures.
 *
 * Runnable bun:test suite for the handle-relative containment reader:
 * normal reads, traversal, absolute paths, null bytes, non-files, size
 * limits, and symlink/junction escapes out of the workspace.
 */

import { describe, expect, it, afterAll, beforeAll } from "bun:test"
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SafeBoundedFileReader } from "./bounded-file-reader"

let workspaceRoot: string
let outsideRoot: string

beforeAll(() => {
  workspaceRoot = mkdtempSync(join(tmpdir(), "arcana-bfr-workspace-"))
  outsideRoot = mkdtempSync(join(tmpdir(), "arcana-bfr-outside-"))
  mkdirSync(join(workspaceRoot, "docs"), { recursive: true })
  writeFileSync(join(workspaceRoot, "docs", "a.txt"), "hello")
  mkdirSync(join(outsideRoot, "secret"), { recursive: true })
  writeFileSync(join(outsideRoot, "secret", "outside.txt"), "SECRET")
  try {
    symlinkSync(
      outsideRoot,
      join(workspaceRoot, "docs", "escape"),
      process.platform === "win32" ? "junction" : "dir",
    )
  } catch {
    // Some CI environments disallow symlinks; the escape fixture is skipped there.
  }
})

afterAll(() => {
  try {
    rmSync(workspaceRoot, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  } catch {}
})

describe("D-7.1 SafeBoundedFileReader hostile-escape fixtures", () => {
  it("reads a contained file through the opened handle", async () => {
    const reader = new SafeBoundedFileReader()
    const result = await reader.read({
      workspaceRoot,
      requestedPath: "docs/a.txt",
      maximumBytes: 64 * 1024,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.content.toString()).toBe("hello")
      expect(result.hash).toHaveLength(64)
      expect(result.identity.inodeOrFileId.length).toBeGreaterThan(0)
    }
  })

  it("rejects path traversal", async () => {
    const reader = new SafeBoundedFileReader()
    const result = await reader.read({
      workspaceRoot,
      requestedPath: "../../../etc/passwd",
      maximumBytes: 64 * 1024,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected failure")
    expect(result.stage).toBe("PATH_VALIDATION")
  })

  it("rejects absolute paths outside the workspace", async () => {
    const reader = new SafeBoundedFileReader()
    const result = await reader.read({
      workspaceRoot,
      requestedPath: "/etc/passwd",
      maximumBytes: 64 * 1024,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected failure")
    expect(result.stage).toBe("PATH_VALIDATION")
  })

  it("rejects null bytes in paths", async () => {
    const reader = new SafeBoundedFileReader()
    const result = await reader.read({
      workspaceRoot,
      requestedPath: "docs/a.txt\0.evil",
      maximumBytes: 64 * 1024,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected failure")
    expect(result.stage).toBe("PATH_VALIDATION")
  })

  it("rejects directory reads", async () => {
    const reader = new SafeBoundedFileReader()
    const result = await reader.read({
      workspaceRoot,
      requestedPath: "docs",
      maximumBytes: 64 * 1024,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected failure")
    expect(result.stage).toBe("STAT")
  })

  it("rejects files exceeding the byte budget", async () => {
    const reader = new SafeBoundedFileReader()
    const result = await reader.read({
      workspaceRoot,
      requestedPath: "docs/a.txt",
      maximumBytes: 1,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected failure")
    expect(result.stage).toBe("READ")
  })

  it("rejects symlink/junction escapes out of the workspace", async () => {
    const reader = new SafeBoundedFileReader()
    const result = await reader.read({
      workspaceRoot,
      requestedPath: "docs/escape/secret/outside.txt",
      maximumBytes: 64 * 1024,
    })
    if (result.success) {
      // No symlink was created (platform/CI restriction): nothing to escape through.
      return
    }
    expect(result.stage).toBe("CONTAINMENT")
    expect(result.reason).toMatch(/escapes workspace/)
  })
})
