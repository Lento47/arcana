import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  allowsExecutableConfigDir,
  computeExecutableFingerprint,
  evaluateWorkspaceTrust,
  isUserScopedConfigDir,
  revokeWorkspaceTrust,
  stripExecutableConfig,
  trustWorkspace,
} from "../../src/workspace/trust"

describe("workspace trust (ARC-SEC-I02)", () => {
  let root: string
  let prevHome: string | undefined
  let prevDisable: string | undefined
  let prevForce: string | undefined

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "arcana-trust-"))
    prevHome = process.env.ARCANA_HOME
    prevDisable = process.env.ARCANA_DISABLE_WORKSPACE_TRUST
    prevForce = process.env.ARCANA_TRUST_WORKSPACE
    process.env.ARCANA_HOME = join(root, "home")
    delete process.env.ARCANA_DISABLE_WORKSPACE_TRUST
    delete process.env.ARCANA_TRUST_WORKSPACE
  })

  afterEach(() => {
    if (prevHome === undefined) delete process.env.ARCANA_HOME
    else process.env.ARCANA_HOME = prevHome
    if (prevDisable === undefined) delete process.env.ARCANA_DISABLE_WORKSPACE_TRUST
    else process.env.ARCANA_DISABLE_WORKSPACE_TRUST = prevDisable
    if (prevForce === undefined) delete process.env.ARCANA_TRUST_WORKSPACE
    else process.env.ARCANA_TRUST_WORKSPACE = prevForce
    rmSync(root, { recursive: true, force: true })
  })

  test("new workspace is untrusted", () => {
    const ws = join(root, "proj")
    mkdirSync(ws, { recursive: true })
    const d = evaluateWorkspaceTrust(ws)
    expect(d.status).toBe("untrusted")
    expect(d.allowsExecutable).toBe(false)
  })

  test("trust then allows executable", () => {
    const ws = join(root, "proj2")
    mkdirSync(join(ws, ".arcana", "plugin"), { recursive: true })
    writeFileSync(join(ws, ".arcana", "plugin", "evil.ts"), "export default {}")
    const before = evaluateWorkspaceTrust(ws)
    expect(before.allowsExecutable).toBe(false)

    const trusted = trustWorkspace(ws)
    expect(trusted.status).toBe("trusted")
    expect(trusted.allowsExecutable).toBe(true)
    expect(evaluateWorkspaceTrust(ws).allowsExecutable).toBe(true)
  })

  test("fingerprint change marks trust stale", () => {
    const ws = join(root, "proj3")
    mkdirSync(join(ws, ".arcana", "plugin"), { recursive: true })
    writeFileSync(join(ws, ".arcana", "plugin", "a.ts"), "export const a = 1")
    trustWorkspace(ws)
    expect(evaluateWorkspaceTrust(ws).status).toBe("trusted")

    writeFileSync(join(ws, ".arcana", "plugin", "b.ts"), "export const b = 2")
    const stale = evaluateWorkspaceTrust(ws)
    expect(stale.status).toBe("stale")
    expect(stale.allowsExecutable).toBe(false)
  })

  test("revoke removes trust", () => {
    const ws = join(root, "proj4")
    mkdirSync(ws, { recursive: true })
    trustWorkspace(ws)
    expect(revokeWorkspaceTrust(ws)).toBe(true)
    expect(evaluateWorkspaceTrust(ws).status).toBe("untrusted")
  })

  test("ARCANA_DISABLE_WORKSPACE_TRUST opens all", () => {
    process.env.ARCANA_DISABLE_WORKSPACE_TRUST = "1"
    const ws = join(root, "open")
    mkdirSync(ws, { recursive: true })
    expect(evaluateWorkspaceTrust(ws).allowsExecutable).toBe(true)
  })

  test("stripExecutableConfig removes plugin and local mcp", () => {
    const stripped = stripExecutableConfig({
      model: "gpt",
      plugin: ["evil@1"],
      agent: { bad: {} },
      mcp: {
        localy: { type: "local", command: ["node", "x.js"] },
        remote: { type: "remote", url: "https://example.com" },
      },
      theme: "dragon",
    })
    expect(stripped.model).toBe("gpt")
    expect(stripped.theme).toBe("dragon")
    expect(stripped.plugin).toBeUndefined()
    expect(stripped.agent).toBeUndefined()
    expect((stripped.mcp as any).localy).toBeUndefined()
    expect((stripped.mcp as any).remote).toBeDefined()
  })

  test("user-scoped config dirs always allow executable", () => {
    const home = process.env.ARCANA_HOME!
    mkdirSync(join(home, "nested"), { recursive: true })
    expect(isUserScopedConfigDir(home, home)).toBe(true)
    expect(isUserScopedConfigDir(join(root, "proj", ".arcana"), home)).toBe(false)
    // User data root always allows executable even when project worktree is untrusted.
    expect(allowsExecutableConfigDir(home, join(root, "proj"))).toBe(true)
  })

  test("fingerprint is stable for empty workspace", () => {
    const ws = join(root, "empty")
    mkdirSync(ws, { recursive: true })
    expect(computeExecutableFingerprint(ws)).toBe(computeExecutableFingerprint(ws))
  })
})
