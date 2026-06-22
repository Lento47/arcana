/**
 * Sandbox — a SOFT, application-level guardrail for `--sandbox`, NOT OS isolation.
 *
 * What it actually enforces (in the agent tool loop, runner.ts):
 *   - file tools (read/write/edit/apply_patch): path must resolve inside `root`
 *   - web tools (web_fetch/web_search): blocked unless network is enabled
 *
 * What it does NOT do (do not rely on it for containment):
 *   - shell/bash is NOT jailed — a bash command can read/write/network anywhere
 *   - no chroot/container/process isolation; no memory/CPU enforcement
 *
 * For untrusted code, use real OS-level isolation. See vault note [[sandbox]].
 */
import { mkdirSync, existsSync, realpathSync } from "node:fs"
import { join, resolve, isAbsolute, sep } from "node:path"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"

export type SandboxConfig = {
  root: string        // filesystem root — all paths must be within this
  network: boolean    // false = block all outbound network
  networkAllow?: string[] // domains to allow even when network=false
  maxMemoryMB: number
  toolTimeoutMs: number
}

export function createSandbox(root?: string): SandboxConfig {
  const dir = root ?? join(tmpdir(), `arcana-sandbox-${randomUUID().slice(0, 8)}`)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return {
    root: resolve(dir),
    network: false,
    maxMemoryMB: 256,
    toolTimeoutMs: 30_000,
  }
}

/**
 * True only if `target` is the root itself or sits strictly under it.
 * Uses a path-separator boundary — a bare `startsWith(root)` would let a sibling
 * like `/tmp/sb-evil` pass the check for root `/tmp/sb` (sandbox escape).
 */
function contains(root: string, target: string): boolean {
  if (target === root) return true
  return target.startsWith(root.endsWith(sep) ? root : root + sep)
}

/** Check if a path is within the sandbox root. Resolves symlinks. */
export function isInSandbox(sandbox: SandboxConfig, filepath: string): boolean {
  const root = sandbox.root
  try {
    return contains(root, realpathSync(resolve(filepath)))
  } catch {
    // Path doesn't exist yet — resolve absolute and check containment.
    // NOTE: a non-existent path whose parent is a symlink out of the sandbox is
    // not caught here (realpath only resolves existing components) — see vault.
    return contains(root, resolve(filepath))
  }
}

/** Reject paths outside sandbox. Returns error string or null if allowed. */
export function checkSandboxPath(sandbox: SandboxConfig, filepath: string, operation: string): string | null {
  if (isInSandbox(sandbox, filepath)) return null
  return `Sandbox: ${operation} blocked for path outside sandbox root: ${filepath}`
}

/** Check if network is allowed for a given URL. */
export function checkSandboxNetwork(sandbox: SandboxConfig, url: string): string | null {
  if (sandbox.network) return null
  if (sandbox.networkAllow) {
    try {
      const host = new URL(url).hostname
      if (sandbox.networkAllow.some((a) => host === a || host.endsWith("." + a))) return null
    } catch {}
  }
  return `Sandbox: network blocked (--sandbox disables outbound network). Allow with --sandbox-net.`
}
