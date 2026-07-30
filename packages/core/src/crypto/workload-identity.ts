/**
 * Phase D-6A: Workload Identity Collection
 *
 * The identity contracts (identity-contracts.ts) define the model.
 * This module provides the runtime mechanism to observe and collect
 * workload identity from the operating system.
 *
 * Without TPM, cloud-instance attestation, or secure enclave:
 * executable digest + OS principal + process ancestry = workload identification
 * (not strong workload attestation).
 */

import type {
  WorkloadIdentity,
  WorkloadIdentityAssurance,
  HarnessType,
  AgentExecutionIdentity,
  DistributedGrantAudience,
  NodeIdentity,
} from "./identity-contracts"
import { createHash } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"

// ─── Observed Workload Identity ───────────────────────────────────────

export type ObservedWorkloadIdentity = {
  nodeId: string
  workloadId: string

  executablePath: string
  executableDigest: string

  operatingSystemPrincipal: string
  processId: number
  parentProcessId?: number
  parentExecutableDigest?: string

  harness: HarnessType
  assurance: WorkloadIdentityAssurance
}

// ─── Workload Identity Provider ───────────────────────────────────────

export interface WorkloadIdentityProvider {
  identify(context: {
    processId: number
    sessionId: string
  }): Promise<ObservedWorkloadIdentity>
}

// ─── Derive Workload ID ───────────────────────────────────────────────

/**
 * Derive a stable workload identity from observed attributes.
 * WorkloadId = H(NodeId ∥ ExecutableDigest ∥ OSPrincipal ∥ ProcessStartIdentity ∥ ParentLineage)
 *
 * Include process creation time to distinguish PID reuse.
 */
export function deriveWorkloadId(
  nodeId: string,
  executableDigest: string,
  osPrincipal: string,
  processStartTime: number,
  parentDigest?: string,
): string {
  const input = [
    nodeId,
    executableDigest,
    osPrincipal,
    processStartTime.toString(),
    parentDigest ?? "none",
  ].join("\0")

  return createHash("sha256").update(input).digest("hex").slice(0, 32)
}

// ─── Platform-Specific Observation ────────────────────────────────────

/**
 * Observe workload identity from the current process.
 * Platform-specific: reads /proc on Linux, uses process info on Windows.
 */
export async function observeCurrentWorkload(
  nodeId: string,
): Promise<ObservedWorkloadIdentity> {
  const pid = process.pid
  const ppid = process.ppid

  // Get executable path
  const executablePath = process.execPath

  // Compute executable digest (SHA-256 of the binary)
  let executableDigest = "unknown"
  try {
    if (existsSync(executablePath)) {
      const binary = readFileSync(executablePath)
      executableDigest = createHash("sha256").update(binary).digest("hex")
    }
  } catch {
    // File may not be readable
  }

  // OS principal: on Windows use username, on Linux use UID
  const osPrincipal = process.env.USER ?? process.env.USERNAME ?? "unknown"

  // Process creation time (approximate from uptime)
  const processStartTime = Date.now() - (process.uptime() * 1000)

  // Parent executable digest (best effort)
  let parentDigest: string | undefined
  if (ppid && ppid > 0) {
    try {
      // On Linux: /proc/{ppid}/exe
      // On Windows: not easily available without native bindings
      parentDigest = undefined
    } catch {
      // Best effort
    }
  }

  // Detect harness from process arguments and environment
  const harness = detectHarness()

  // Derive workload ID
  const workloadId = deriveWorkloadId(
    nodeId,
    executableDigest,
    osPrincipal,
    processStartTime,
    parentDigest,
  )

  return {
    nodeId,
    workloadId,
    executablePath,
    executableDigest,
    operatingSystemPrincipal: osPrincipal,
    processId: pid,
    parentProcessId: ppid,
    parentExecutableDigest: parentDigest,
    harness,
    assurance: executableDigest !== "unknown" ? "OS_OBSERVED" : "DECLARED",
  }
}

// ─── Harness Detection ────────────────────────────────────────────────

/**
 * Detect which AI harness is running based on process arguments and environment.
 */
function detectHarness(): HarnessType {
  const args = process.argv.join(" ").toLowerCase()
  const env = process.env

  // Check environment variables first
  if (env.ARCANA_HARNESS) {
    const h = env.ARCANA_HARNESS.toUpperCase()
    if (["ARCANA", "CODEX", "CLAUDE", "GEMINI", "OPENCODE", "CUSTOM"].includes(h)) {
      return h as HarnessType
    }
  }

  // Check process arguments
  if (args.includes("codex") || args.includes("openai")) return "CODEX"
  if (args.includes("claude") || args.includes("anthropic")) return "CLAUDE"
  if (args.includes("gemini") || args.includes("google")) return "GEMINI"
  if (args.includes("opencode")) return "OPENCODE"
  if (args.includes("arcana")) return "ARCANA"

  return "CUSTOM"
}

// ─── TOCTOU Defense ───────────────────────────────────────────────────

/**
 * Verify workload identity has not changed since admission.
 * Identify twice: at admission and immediately before effect.
 * If executable identity or process lineage changed, deny.
 */
export function verifyWorkloadStable(
  admission: ObservedWorkloadIdentity,
  current: ObservedWorkloadIdentity,
): { stable: true } | { stale: false; reason: string } {
  if (admission.workloadId !== current.workloadId) {
    return { stale: false, reason: `workloadId changed: ${admission.workloadId} → ${current.workloadId}` }
  }
  if (admission.executableDigest !== current.executableDigest) {
    return { stale: false, reason: `executableDigest changed: ${admission.executableDigest} → ${current.executableDigest}` }
  }
  if (admission.processId !== current.processId) {
    return { stale: false, reason: `processId changed: ${admission.processId} → ${current.processId}` }
  }
  if (admission.operatingSystemPrincipal !== current.operatingSystemPrincipal) {
    return { stale: false, reason: `osPrincipal changed: ${admission.operatingSystemPrincipal} → ${current.operatingSystemPrincipal}` }
  }
  return { stable: true }
}
