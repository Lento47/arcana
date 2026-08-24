// packages/arcana/src/agent/authority.ts
//
// CLI-runner binding to the Authority Kernel's process path (M1).
// Every OS process spawn in this agent runtime goes through gatedSpawn —
// direct node:child_process / Bun.spawn usage is CI-forbidden here
// (see docs/architecture/authority/).
//
// The grant store lives per-workspace at <cwd>/.arcana/authority.db,
// mirroring the engine's approvals.db placement. Principal/session follow
// the same conventions as run.ts session resolution.

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { authorizeProcess, type ProcessGateResult } from "@arcana/core/capability/process-gate"
import { authorizeFileMutation, type FileMutationResult } from "@arcana/core/capability/fs-gate"
import { authorizeNetwork, type NetworkGateResult } from "@arcana/core/capability/network-gate"
import { authorizeSecretUse, seedNamedSecretGrant } from "@arcana/core/capability/secret-gate"
import { authorizeNetwork, type NetworkGateResult } from "@arcana/core/capability/network-gate"

let resolved: { dbPath: string; sessionId: string } | null = null

function resolveGateTarget(): { dbPath: string; sessionId: string } {
  if (resolved) return resolved
  const cwd = process.cwd()
  const dir = join(cwd, ".arcana")
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* exists / race — sqlite will surface a real error if unusable */
  }
  const sessionId =
    (typeof process.env.ARCANA_SESSION_ID === "string" && process.env.ARCANA_SESSION_ID) ||
    `cli-${cwd.replace(/[^a-zA-Z0-9]+/g, "_").slice(-48)}`
  resolved = { dbPath: join(dir, "authority.db"), sessionId }
  return resolved
}

/**
 * Authorize-and-execute one process spawn through the Authority Kernel.
 * The child is created ONLY when the PDP allows this exact request.
 */
export function gatedSpawn(
  toolName: string,
  argv: string[],
  opts?: { cwd?: string; env?: Record<string, string | undefined> },
): Promise<ProcessGateResult> {
  const { dbPath, sessionId } = resolveGateTarget()
  return authorizeProcess(
    { dbPath, sessionId, principalId: "arcana-cli" },
    { toolName, argv, cwd: opts?.cwd, env: opts?.env },
  )
}

// ── Secret provisioning & mediated use ────────────────────────────────
// Values live ONLY in this registry (populated once from env at startup).
// Tool code resolves them exclusively via useSecret(), which mediates every
// access through the kernel — one receipt per use, fail-closed otherwise.

const secretValues = new Map<string, string>()
const provisioned = new Set<string>()

/** Names this runner provisions from the environment at startup. */
const MANAGED_SECRETS = ["ELEVENLABS_API_KEY", "FIRECRAWL_API_KEY"] as const

let secretsInitialized = false
async function ensureSecretsProvisioned(): Promise<void> {
  if (secretsInitialized) return
  const { dbPath, sessionId } = resolveGateTarget()
  for (const name of MANAGED_SECRETS) {
    const value = process.env[name]
    if (!value) continue
    secretValues.set(name, value)
    try {
      await seedNamedSecretGrant({ dbPath, sessionId, principalId: "arcana-cli" }, name)
      provisioned.add(name)
    } catch (e) {
      console.error(`[authority] secret grant seeding failed for ${name}`, e)
    }
  }
  secretsInitialized = true
}

/**
 * Mediated secret resolution for tool handlers. Returns undefined when the
 * secret is unregistered/unprovisioned — callers must degrade gracefully.
 */
export async function useSecret(name: string, toolName: string): Promise<string | undefined> {
  await ensureSecretsProvisioned()
  if (!provisioned.has(name)) return undefined
  const result = await authorizeSecretUse(
    { dbPath: resolveGateTarget().dbPath, sessionId: resolveGateTarget().sessionId, principalId: "arcana-cli" },
    { secretName: name, purpose: toolName },
    (n) => secretValues.get(n),
  )
  if (result.status === "EXECUTED") return result.value
  console.error(`[authority] secret.use denied: ${name} for ${toolName} (${result.status})`)
  return undefined
}

/** Stable per-workspace id used where a plain string tag is needed. */
export function workspaceTag(): string {
  return createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16)
}

/**
 * Authorize-and-execute one outbound network call through the kernel.
 * `perform` does the actual fetch (headers/keys stay caller-side) and returns
 * the HTTP status + a short receipt summary. No connection on DENY.
 */
export function gatedNetwork(
  toolName: string,
  url: string,
  perform: () => Promise<{ httpStatus: number; summary: string }>,
  opts?: { method?: string },
): Promise<NetworkGateResult> {
  const { dbPath, sessionId } = resolveGateTarget()
  return authorizeNetwork(
    { dbPath, sessionId, principalId: "arcana-cli" },
    { toolName, url, method: opts?.method },
    perform,
  )
}

/**
 * Authorize-and-execute one file mutation through the kernel.
 * `perform` runs only on ALLOW; denials leave the filesystem untouched.
 */
export async function gatedFileMutation(
  toolName: string,
  req: { filePath: string; content?: string; oldString?: string },
  perform: () => string,
): Promise<FileMutationResult> {
  const { dbPath, sessionId } = resolveGateTarget()
  return authorizeFileMutation(
    { dbPath, sessionId, principalId: "arcana-cli" },
    { toolName, ...req },
    perform,
  )
}

/** Render a gate result as tool-output text (model-visible), preserving denials verbatim. */
export function formatGateResult(r: ProcessGateResult): string {
  switch (r.status) {
    case "EXECUTED": {
      const out = r.stdout.replace(/\r?\n$/, "")
      const err = r.stderr.replace(/\r?\n$/, "")
      return err ? `${out}\n[stderr] ${err}` : out
    }
    case "DENIED":
      return [
        `DENIED by Authority Kernel (${r.reasons.map((x) => x.code).join(", ") || "UNKNOWN"}):`,
        ...r.reasons.map((x) => `- ${x.message}`),
      ].join("\n")
    case "APPROVAL_REQUIRED":
      return `APPROVAL_REQUIRED: ${r.message}`
    default:
      return `${r.status}: ${"detail" in r ? r.detail : ""}`
  }
}
