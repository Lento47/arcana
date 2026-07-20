/**
 * Workspace trust (ARC-SEC-I02).
 *
 * Opening a project must not execute project-controlled code (plugins, custom
 * tools, agents/commands from disk, local MCP, npm install under project
 * config dirs) until the user trusts the workspace.
 *
 * Storage: ~/.arcana/workspace-trust.json (or ARCANA_HOME / Path.data).
 * Escape hatches:
 *   ARCANA_DISABLE_WORKSPACE_TRUST=1  — legacy open mode (all workspaces)
 *   ARCANA_TRUST_WORKSPACE=1          — treat current process as trusted (CI)
 */
import { createHash } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join, resolve, sep, relative } from "node:path"

export type TrustStatus = "trusted" | "untrusted" | "stale"

export type TrustRecord = {
  fingerprint: string
  trustedAt: string
}

export type TrustDecision = {
  status: TrustStatus
  worktree: string
  allowsExecutable: boolean
  reason: string
  fingerprint: string
  storedFingerprint?: string
}

type TrustFile = {
  version: 1
  workspaces: Record<string, TrustRecord>
}

/** Subdirs under .arcana / .opencode that can hold executable content. */
const EXECUTABLE_SUBDIRS = [
  "plugin",
  "plugins",
  "tool",
  "tools",
  "agent",
  "agents",
  "command",
  "commands",
] as const

const CONFIG_BASENAMES = ["arcana.json", "arcana.jsonc", "opencode.json", "opencode.jsonc"] as const

function truthy(key: string): boolean {
  const v = process.env[key]?.toLowerCase()
  return v === "true" || v === "1" || v === "yes" || v === "on"
}

export function workspaceTrustDisabled(): boolean {
  return truthy("ARCANA_DISABLE_WORKSPACE_TRUST")
}

export function workspaceTrustForced(): boolean {
  return truthy("ARCANA_TRUST_WORKSPACE")
}

function dataRoot(): string {
  const home = process.env.ARCANA_HOME?.trim() || process.env.ARCANA_TEST_HOME?.trim() || join(homedir(), ".arcana")
  return home
}

function trustFilePath(): string {
  return join(dataRoot(), "workspace-trust.json")
}

export function normalizeWorktree(worktree: string): string {
  const abs = resolve(worktree)
  try {
    return realpathSync(abs)
  } catch {
    return abs
  }
}

function readTrustFile(): TrustFile {
  const path = trustFilePath()
  try {
    if (!existsSync(path)) return { version: 1, workspaces: {} }
    const raw = JSON.parse(readFileSync(path, "utf8")) as TrustFile
    if (!raw || raw.version !== 1 || typeof raw.workspaces !== "object") {
      return { version: 1, workspaces: {} }
    }
    return raw
  } catch {
    return { version: 1, workspaces: {} }
  }
}

function writeTrustFile(file: TrustFile): void {
  const path = trustFilePath()
  mkdirSync(dataRoot(), { recursive: true })
  writeFileSync(path, JSON.stringify(file, null, 2), { encoding: "utf8", mode: 0o600 })
}

function hashText(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function walkFiles(dir: string, out: string[], depth = 0): void {
  if (depth > 6) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue
    const full = join(dir, name)
    let lst
    try {
      lst = lstatSync(full)
    } catch {
      continue
    }
    // Do not follow symlinks when fingerprinting (audit: ignore project symlinks).
    if (lst.isSymbolicLink()) continue
    if (lst.isDirectory()) {
      walkFiles(full, out, depth + 1)
      continue
    }
    if (lst.isFile()) {
      out.push(`${full}|${lst.size}|${lst.mtimeMs}`)
    }
  }
}

/**
 * Fingerprint of executable surfaces under a worktree.
 * Changes invalidate prior trust (stale).
 */
export function computeExecutableFingerprint(worktree: string): string {
  const root = normalizeWorktree(worktree)
  const parts: string[] = []

  for (const baseName of [".arcana", ".opencode"]) {
    const base = join(root, baseName)
    if (!existsSync(base)) continue
    for (const sub of EXECUTABLE_SUBDIRS) {
      walkFiles(join(base, sub), parts)
    }
    for (const cfg of CONFIG_BASENAMES) {
      const p = join(base, cfg)
      if (!existsSync(p)) continue
      try {
        if (lstatSync(p).isSymbolicLink()) continue
        parts.push(`cfg:${relative(root, p)}:${hashText(readFileSync(p, "utf8"))}`)
      } catch {
        /* skip */
      }
    }
  }

  // Project-root config files (arcana.json at worktree root)
  for (const cfg of CONFIG_BASENAMES) {
    const p = join(root, cfg)
    if (!existsSync(p)) continue
    try {
      if (lstatSync(p).isSymbolicLink()) continue
      parts.push(`rootcfg:${cfg}:${hashText(readFileSync(p, "utf8"))}`)
    } catch {
      /* skip */
    }
  }

  parts.sort()
  return hashText(parts.join("\n") || "empty")
}

export function evaluateWorkspaceTrust(worktree: string): TrustDecision {
  const wt = normalizeWorktree(worktree)
  const fingerprint = computeExecutableFingerprint(wt)

  if (workspaceTrustDisabled()) {
    return {
      status: "trusted",
      worktree: wt,
      allowsExecutable: true,
      reason: "ARCANA_DISABLE_WORKSPACE_TRUST",
      fingerprint,
    }
  }

  if (workspaceTrustForced()) {
    return {
      status: "trusted",
      worktree: wt,
      allowsExecutable: true,
      reason: "ARCANA_TRUST_WORKSPACE",
      fingerprint,
    }
  }

  // Non-git / filesystem-root worktrees: still require trust for project dirs
  // under the directory itself — use directory path as key when worktree is root.
  const file = readTrustFile()
  const stored = file.workspaces[wt]
  if (!stored) {
    return {
      status: "untrusted",
      worktree: wt,
      allowsExecutable: false,
      reason: "workspace has not been trusted yet — run `arcana trust`",
      fingerprint,
    }
  }

  if (stored.fingerprint !== fingerprint) {
    return {
      status: "stale",
      worktree: wt,
      allowsExecutable: false,
      reason: "executable project config changed since trust — run `arcana trust` again",
      fingerprint,
      storedFingerprint: stored.fingerprint,
    }
  }

  return {
    status: "trusted",
    worktree: wt,
    allowsExecutable: true,
    reason: "trusted",
    fingerprint,
    storedFingerprint: stored.fingerprint,
  }
}

export function trustWorkspace(worktree: string): TrustDecision {
  const wt = normalizeWorktree(worktree)
  const fingerprint = computeExecutableFingerprint(wt)
  const file = readTrustFile()
  file.workspaces[wt] = {
    fingerprint,
    trustedAt: new Date().toISOString(),
  }
  writeTrustFile(file)
  return {
    status: "trusted",
    worktree: wt,
    allowsExecutable: true,
    reason: "trusted now",
    fingerprint,
    storedFingerprint: fingerprint,
  }
}

export function revokeWorkspaceTrust(worktree: string): boolean {
  const wt = normalizeWorktree(worktree)
  const file = readTrustFile()
  if (!file.workspaces[wt]) return false
  delete file.workspaces[wt]
  writeTrustFile(file)
  return true
}

export function listTrustedWorkspaces(): Array<{ worktree: string } & TrustRecord> {
  const file = readTrustFile()
  return Object.entries(file.workspaces).map(([worktree, rec]) => ({ worktree, ...rec }))
}

/**
 * User-global config roots always allow executable content (the user opted in
 * by placing files under their home / XDG config). Project roots need trust.
 */
export function isUserScopedConfigDir(
  dir: string,
  home = process.env.ARCANA_TEST_HOME?.trim() || process.env.ARCANA_HOME?.trim() || homedir(),
): boolean {
  const resolved = resolve(dir)
  // When ARCANA_HOME is the data root itself (~/.arcana), treat it as user-scoped.
  const candidates = [
    resolve(home),
    resolve(join(home, ".arcana")),
    resolve(join(home, ".opencode")),
    resolve(join(homedir(), ".arcana")),
    resolve(join(homedir(), ".opencode")),
    resolve(join(homedir(), ".config", "arcana")),
    resolve(join(homedir(), ".config", "opencode")),
  ]
  if (process.env.ARCANA_CONFIG_DIR?.trim()) {
    candidates.push(resolve(process.env.ARCANA_CONFIG_DIR.trim()))
  }
  for (const c of candidates) {
    if (resolved === c || resolved.startsWith(c + sep)) return true
  }
  return false
}

/**
 * Whether a config directory may load plugins/agents/commands/tools/npm.
 */
export function allowsExecutableConfigDir(dir: string, worktree: string, decision?: TrustDecision): boolean {
  if (isUserScopedConfigDir(dir)) return true
  const d = decision ?? evaluateWorkspaceTrust(worktree)
  return d.allowsExecutable
}

/**
 * Strip project config keys that can cause code execution or local process start.
 * Data-only keys (model, theme, permission, provider, server, …) are preserved.
 */
export function stripExecutableConfig<T extends Record<string, unknown>>(config: T): T {
  const next: Record<string, unknown> = { ...config }
  delete next.plugin
  // Agent / mode definitions from project JSON can rewrite prompts and tools.
  delete next.agent
  delete next.mode
  delete next.command
  delete next.instructions
  delete next.instruction

  if (next.mcp && typeof next.mcp === "object" && next.mcp !== null && !Array.isArray(next.mcp)) {
    const mcp: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(next.mcp as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue
      const entry = value as Record<string, unknown>
      // Local MCP spawns processes — always strip while untrusted.
      if (entry.type === "local") continue
      if (Array.isArray(entry.command)) continue
      mcp[key] = value
    }
    next.mcp = mcp
  }

  return next as T
}
