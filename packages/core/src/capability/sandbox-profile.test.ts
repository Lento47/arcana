// packages/core/src/capability/sandbox-profile.test.ts
//
// S5 sandbox profiles — platform translation + authority-env stripping.

import { describe, expect, it } from "bun:test"
import {
  buildSandboxProfile,
  withSandboxProfile,
  type SandboxPlatform,
} from "./sandbox-profile"
import type { SpawnExecutor, SpawnResult } from "./spawn-executor"

const budget = { maxMemoryMB: 512, toolTimeoutMs: 10_000 }

describe("S5 sandbox profiles", () => {
  it("linux profile wraps argv with an address-space ulimit and exec", () => {
    const p = buildSandboxProfile(budget, "linux")
    const wrapped = p.apply(["bun", "script.ts"])
    expect(wrapped[0]).toBe("/bin/sh")
    expect(wrapped[2]).toContain("ulimit -v")
    // 512MB → 524288 KB
    expect(wrapped[2]).toContain("524288")
    expect(wrapped.slice(4)).toEqual(["bun", "script.ts"])
  })

  it("linux ulimit math floors to KB correctly", () => {
    const p = buildSandboxProfile({ maxMemoryMB: 1, toolTimeoutMs: 1000 }, "linux")
    expect(p.apply(["x"])[2]).toContain("ulimit -v 1024;")
  })

  it("win32/darwin profiles do not pretend to wrap (honesty contract)", () => {
    for (const plat of ["win32", "darwin"] as SandboxPlatform[]) {
      const p = buildSandboxProfile(budget, plat)
      expect(p.apply(["run", "me"])).toEqual(["run", "me"])
      expect(p.enforcement().gaps.length).toBeGreaterThan(0)
    }
  })

  it("every platform strips ARCANA_* and NODE_OPTIONS from child env", () => {
    for (const plat of ["linux", "darwin", "win32"] as SandboxPlatform[]) {
      const p = buildSandboxProfile(budget, plat)
      const out = p.sanitizeEnv({
        PATH: "/usr/bin",
        ARCANA_KERNEL_PIPE: "\\\\.\\pipe\\kernel",
        ARCANA_TRANSPORT: "ipc",
        NODE_OPTIONS: "--require pwn.js",
        HOME: "/home/u",
      })!
      expect(out.PATH).toBe("/usr/bin")
      expect(out.HOME).toBe("/home/u")
      expect(out["ARCANA_KERNEL_PIPE"]).toBeUndefined()
      expect(out["ARCANA_TRANSPORT"]).toBeUndefined()
      expect(out["NODE_OPTIONS"]).toBeUndefined()
      expect(p.sanitizeEnv(undefined)).toBeUndefined()
    }
  })

  it("withSandboxProfile composes over a base executor (argv + env transformed)", async () => {
    let seenArgv: string[] | null = null
    let seenEnv: Record<string, string> | undefined
    const base: SpawnExecutor = (_argv, opts) => {
      seenArgv = _argv
      seenEnv = opts?.env
      return { exitCode: 0, stdout: "", stderr: "" } as SpawnResult
    }
    const wrapped = withSandboxProfile(base, budget, "linux")
    const r = (await wrapped(["tool", "--flag"], { env: { ARCANA_KERNEL_PIPE: "x", A: "b" } })) as SpawnResult
    expect(r.exitCode).toBe(0)
    expect(seenArgv![0]).toBe("/bin/sh")
    expect(seenEnv).toEqual({ A: "b" })
  })

  it("enforcement reports never overclaim", () => {
    for (const plat of ["linux", "darwin", "win32"] as SandboxPlatform[]) {
      const report = buildSandboxProfile(budget, plat).enforcement()
      expect(report.enforced.length).toBeGreaterThan(0)
      // The universal honesty clause: every platform admits timeout is the caller's job.
      expect(report.gaps.join(" ")).toMatch(/timeout/i)
    }
  })
})
