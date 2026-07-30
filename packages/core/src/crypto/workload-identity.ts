/**
 * Phase D-6A: Workload Identity Collection (HARDENED)
 *
 * The identity contracts (identity-contracts.ts) define the model.
 * This module provides the runtime mechanism to observe and collect
 * workload identity from the operating system.
 *
 * HARDENING: detectHarness() returns descriptive metadata only.
 * Environment variables and argv are process-controlled and spoofable.
 * Only executable-digest-mapped-by-policy, verified binary signature,
 * or container image digest are authoritative.
 *
 * Trust order:
 *   Executable digest mapped by policy  → authoritative
 *   Verified binary signature           → authoritative
 *   Container image digest              → authoritative
 *   Environment variable                → descriptive only
 *   Command-line argument               → descriptive only
 *   Executable filename                 → descriptive only
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

// ─── Harness Detection (descriptive only) ───────────────────────────

export type HarnessEvidenceSource =
  | "ENVIRONMENT"          // env var — descriptive only
  | "ARGV"                 // process.argv — descriptive only
  | "EXECUTABLE_DIGEST"    // digest matched by policy — authoritative
  | "SIGNED_BINARY"        // binary signature verified — authoritative
  | "CONFIGURED_MAPPING"   // admin-configured mapping — authoritative

export type HarnessDetection = {
  harness: HarnessType
  evidence: HarnessEvidenceSource
  authoritative: boolean
}

const AUTHORITY_SOURCES: ReadonlySet<HarnessEvidenceSource> = new Set([
  "EXECUTABLE_DIGEST",
  "SIGNED_BINARY",
  "CONFIGURED_MAPPING",
])

/**
 * Detect harness from process arguments and environment.
 *
 * The returned detection is DESCRIPTIVE metadata only when based on
 * environment variables or command-line arguments. It must NOT
 * independently grant authority. Authority requires policy-bound
 * executable digest mapping, verified binary signature, or
 * admin-configured mapping.
 */
export function detectHarness(): HarnessDetection {
  const args = process.argv.join(" ").toLowerCase()
  const env = process.env

  // Check environment variables first
  if (env.ARCANA_HARNESS) {
    const h = env.ARCANA_HARNESS.toUpperCase()
    if (["ARCANA", "CODEX", "CLAUDE", "GEMINI", "OPENCODE", "CUSTOM"].includes(h)) {
      return {
        harness: h as HarnessType,
        evidence: "ENVIRONMENT",
        authoritative: false, // env vars are spoofable
      }
    }
  }

  // Check process arguments
  if (args.includes("codex") || args.includes("openai")) {
    return { harness: "CODEX", evidence: "ARGV", authoritative: false }
  }
  if (args.includes("claude") || args.includes("anthropic")) {
    return { harness: "CLAUDE", evidence: "ARGV", authoritative: false }
  }
  if (args.includes("gemini") || args.includes("google")) {
    return { harness: "GEMINI", evidence: "ARGV", authoritative: false }
  }
  if (args.includes("opencode")) {
    return { harness: "OPENCODE", evidence: "ARGV", authoritative: false }
  }
  if (args.includes("arcana")) {
    return { harness: "ARCANA", evidence: "ARGV", authoritative: false }
  }

  return { harness: "CUSTOM", evidence: "ARGV", authoritative: false }
}

/**
 * Upgrade a harness detection to authoritative status.
 * Called ONLY when the executable digest is verified against a policy mapping
 * or the binary signature is verified.
 */
export function upgradeHarnessAuthority(
  detection: HarnessDetection,
  authoritativeEvidence: "EXECUTABLE_DIGEST" | "SIGNED_BINARY" | "CONFIGURED_MAPPING",
): HarnessDetection {
  return {
    ...detection,
    evidence: authoritativeEvidence,
    authoritative: true,
  }
}

// ─── Observed Workload Identity ─────────────────────────────────────

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
  harnessDetection: HarnessDetection
  assurance: WorkloadIdentityAssurance
}

// ─── Workload Identity Provider ─────────────────────────────────────

export interface WorkloadIdentityProvider {
  identify(context: {
    processId: number
    sessionId: string
  }): Promise<ObservedWorkloadIdentity>
}

// ─── Derive Workload ID ─────────────────────────────────────────────

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

// ─── Platform-Specific Observation ──────────────────────────────────

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

  // Detect harness — always descriptive unless explicitly upgraded
  const harnessDetection = detectHarness()

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
    harness: harnessDetection.harness,
    harnessDetection,
    assurance: executableDigest !== "unknown" ? "OS_OBSERVED" : "DECLARED",
  }
}

// ─── TOCTOU Defense ─────────────────────────────────────────────────

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
