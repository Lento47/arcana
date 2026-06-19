/**
 * Sandbox — filesystem, network, and shell isolation for safe autonomous operation.
 * Enforceable via --sandbox flag. Restricts file access, network, and shell commands
 * to a configurable root directory.
 */
import { mkdirSync, existsSync, realpathSync } from "node:fs"
import { join, resolve, isAbsolute } from "node:path"
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

/** Check if a path is within the sandbox root. Resolves symlinks. */
export function isInSandbox(sandbox: SandboxConfig, filepath: string): boolean {
  try {
    const resolved = realpathSync(resolve(filepath))
    return resolved.startsWith(sandbox.root)
  } catch {
    // Path doesn't exist yet — resolve absolute and check prefix
    const absolute = resolve(filepath)
    return absolute.startsWith(sandbox.root)
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
