// packages/core/src/capability/sandbox-profile.ts
//
// Authority Kernel S5 — OS-native spawn restriction profiles. Translates a
// sandbox budget into platform-enforceable spawn restrictions, wrapped around
// any SpawnExecutor (local Bun or S4 IPC client). enforcement() reports what
// IS and IS NOT enforced per platform; application-level path/network guards
// are a separate layer.

import type { SpawnExecutor } from "./spawn-executor"

export interface SandboxBudget {
  /** Optional per-process address-space cap inherited by children on Linux. */
  maxMemoryMB?: number
  /** Wall-clock budget — reported in enforcement(), enforced by the caller. */
  toolTimeoutMs: number
}

export type SandboxPlatform = "linux" | "darwin" | "win32"

export interface SandboxEnforcementReport {
  enforced: string[]
  gaps: string[]
}

export interface SandboxSpawnProfile {
  platform: SandboxPlatform
  /**
   * Wrap argv so the OS applies the profile before the payload runs.
   * Returns argv unchanged when the platform has no native wrapper.
   */
  apply(argv: string[]): string[]
  /**
   * Remove authority-bearing variables from the child environment.
   * A sandboxed child must NEVER inherit ARCANA_* (kernel pipe = direct
   * unmediated kernel reachability) or NODE_OPTIONS (code injection vector).
   */
  sanitizeEnv(env: Record<string, string> | undefined): Record<string, string> | undefined
  enforcement(): SandboxEnforcementReport
}

const STRIPPED_ENV_PREFIXES = ["ARCANA_"]
const STRIPPED_ENV_KEYS = new Set(["NODE_OPTIONS"])

function sanitizeEnvFactory(platform: SandboxPlatform) {
  return (env: Record<string, string> | undefined): Record<string, string> | undefined => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(env ?? process.env)) {
      const key = platform === "win32" ? k.toUpperCase() : k
      if (STRIPPED_ENV_KEYS.has(key)) continue
      if (STRIPPED_ENV_PREFIXES.some((p) => key.startsWith(p))) continue
      if (typeof v === "string") out[k] = v
    }
    return out
  }
}

/** Linux: hard address-space ceiling applied by the kernel before exec. */
function linuxApply(argv: string[], maxMemoryMB: number): string[] {
  const kb = Math.max(1, Math.floor((maxMemoryMB * 1024 * 1024) / 1024))
  // `exec "$@"` replaces the shell AFTER limits are set — one process, no
  // extra PID in the tree, limits inherited by the payload.
  const script = `ulimit -Sv ${kb} && ulimit -Hv ${kb} && exec "$@"`
  return ["/bin/sh", "-c", script, "sh", ...argv]
}

export function buildSandboxProfile(
  budget: SandboxBudget,
  platform: SandboxPlatform = (process.platform as SandboxPlatform) ?? "linux",
): SandboxSpawnProfile {
  if (budget.maxMemoryMB !== undefined && (!Number.isFinite(budget.maxMemoryMB) || budget.maxMemoryMB <= 0)) {
    throw new Error("maxMemoryMB must be a finite positive number")
  }
  switch (platform) {
    case "linux":
      return {
        platform,
        apply: (argv) => budget.maxMemoryMB === undefined ? [...argv] : linuxApply(argv, budget.maxMemoryMB),
        sanitizeEnv: sanitizeEnvFactory(platform),
        enforcement: () => ({
          enforced: [
            ...(budget.maxMemoryMB === undefined ? [] : [`per-process address-space ≤ ${budget.maxMemoryMB}MB (hard ulimit, inherited by children)`]),
            "ARCANA_* / NODE_OPTIONS stripped from child env",
          ],
          gaps: [
            ...(budget.maxMemoryMB === undefined ? ["no memory limit configured"] : ["address-space limit is per process, not aggregate tree memory"]),
            `wall-clock timeout (${budget.toolTimeoutMs}ms) must be enforced by the spawn CALLER`,
            "filesystem/network containment requires namespaces or a jailer (bubblewrap/firejail) — future work",
          ],
        }),
      }
    case "darwin":
      return {
        platform,
        apply: (argv) => [...argv],
        sanitizeEnv: sanitizeEnvFactory(platform),
        enforcement: () => ({
          enforced: ["ARCANA_* / NODE_OPTIONS stripped from child env"],
          gaps: [
            `no memory limit (sandbox-exec(1) is deprecated; needs App Sandbox or Endpoint Security)`,
            `wall-clock timeout (${budget.toolTimeoutMs}ms) must be enforced by the spawn CALLER`,
            "filesystem/network containment not provided",
          ],
        }),
      }
    case "win32":
      return {
        platform,
        apply: (argv) => [...argv],
        sanitizeEnv: sanitizeEnvFactory(platform),
        enforcement: () => ({
          enforced: ["ARCANA_* / NODE_OPTIONS stripped from child env"],
          gaps: [
            "no Job Object assignment without a native addon — memory/CPU/process-tree limits NOT enforced",
            `wall-clock timeout (${budget.toolTimeoutMs}ms) must be enforced by the spawn CALLER`,
            "filesystem/network containment not provided (restricted tokens are future work)",
          ],
        }),
      }
    default:
      throw new Error(`unsupported sandbox platform: ${platform}`)
  }
}

/**
 * Compose a base executor with a sandbox profile: argv wrapped, env sanitized.
 * Works identically over the local Bun executor and the S4 IPC executor.
 */
export function withSandboxProfile(base: SpawnExecutor, budget: SandboxBudget, platform?: SandboxPlatform): SpawnExecutor {
  const profile = buildSandboxProfile(budget, platform)
  return (argv, opts) =>
    base(profile.apply(argv), {
      ...opts,
      env: profile.sanitizeEnv(opts?.env),
    })
}

export * as SandboxProfile from "./sandbox-profile"
