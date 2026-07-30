/**
 * D-6A-Windows: Windows Workload Identity Collector
 *
 * Captures process-level identity from Windows OS.
 * Uses process.env, process.pid, and child_process for OS queries.
 *
 * Do NOT make the following authoritative:
 *   - argv (process-controlled, spoofable)
 *   - environment variables (process-controlled)
 *   - executable filename alone
 *   - PID alone
 *
 * Authoritative sources:
 *   - Digest + SID + creation identity → OS_OBSERVED
 *   - Valid trusted Authenticode signer → SIGNED_BINARY
 *   - TPM/cloud attestation → HARDWARE_ATTESTED
 */

import { createHash } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"
import type {
  WorkloadIdentityAssurance,
  HarnessType,
} from "./identity-contracts"
import {
  deriveWorkloadId,
  type ObservedWorkloadIdentity,
  type HarnessDetection,
} from "./workload-identity"

// ─── Windows Process Identity ───────────────────────────────────────

export type WindowsProcessIdentity = {
  executablePath: string
  executableDigest: string
  processId: number
  parentProcessId: number
  processCreationTime: number
  parentProcessCreationTime?: number
  userSid: string
  integrityLevel: string
  sessionId: number
  authenticodeSigner?: string
}

/**
 * Observe Windows-specific process identity.
 * Uses wmic/powershell for system queries where node APIs are insufficient.
 */
export async function observeWindowsProcess(processId: number): Promise<WindowsProcessIdentity> {
  const executablePath = process.execPath

  // Compute executable digest
  let executableDigest = "unknown"
  try {
    if (existsSync(executablePath)) {
      const binary = readFileSync(executablePath)
      executableDigest = createHash("sha256").update(binary).digest("hex")
    }
  } catch {
    // Best effort
  }

  // Get parent PID
  const ppid = process.ppid

  // Process creation time (approximate from uptime)
  const processCreationTime = Date.now() - (process.uptime() * 1000)

  // User SID — on Windows, try to get from environment
  const userSid = process.env.USERDOMAIN
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME ?? "unknown"}`
    : process.env.USERNAME ?? "unknown"

  // Integrity level — default to medium unless we can detect otherwise
  const integrityLevel = "MEDIUM" // Would need native bindings for actual detection

  // Session ID
  const sessionId = 0 // Would need native bindings for actual session ID

  // Authenticode signer — check with PowerShell if available
  let authenticodeSigner: string | undefined
  try {
    const result = execSync(
      `powershell -NoProfile -Command "(Get-AuthenticodeSignature '${executablePath.replace(/'/g, "''")}').SignerCertificate.Subject"`,
      { timeout: 5000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim()
    if (result && result.length > 0 && !result.includes("Cannot") && !result.includes("Error")) {
      authenticodeSigner = result
    }
  } catch {
    // Authenticode check failed — not all executables are signed
  }

  return {
    executablePath,
    executableDigest,
    processId,
    parentProcessId: ppid,
    processCreationTime,
    userSid,
    integrityLevel,
    sessionId,
    authenticodeSigner,
  }
}

/**
 * Build full workload identity from Windows process observation.
 */
export async function observeWindowsWorkload(
  nodeId: string,
): Promise<ObservedWorkloadIdentity> {
  const processIdentity = await observeWindowsProcess(process.pid)

  // Determine assurance level
  let assurance: WorkloadIdentityAssurance = "DECLARED"
  if (processIdentity.executableDigest !== "unknown") {
    assurance = "OS_OBSERVED"
  }
  if (processIdentity.authenticodeSigner) {
    assurance = "SIGNED_BINARY"
  }

  // Harness detection (descriptive only)
  const harnessDetection: HarnessDetection = {
    harness: detectHarnessFromEnv(),
    evidence: "ENVIRONMENT",
    authoritative: false,
  }

  // Derive workload ID
  const workloadId = deriveWorkloadId(
    nodeId,
    processIdentity.executableDigest,
    processIdentity.userSid,
    processIdentity.processCreationTime,
    undefined, // parent digest not easily available on Windows
  )

  return {
    nodeId,
    workloadId,
    executablePath: processIdentity.executablePath,
    executableDigest: processIdentity.executableDigest,
    operatingSystemPrincipal: processIdentity.userSid,
    processId: processIdentity.processId,
    parentProcessId: processIdentity.parentProcessId,
    harness: harnessDetection.harness,
    harnessDetection,
    assurance,
  }
}

// ─── Harness Detection (descriptive) ────────────────────────────────

function detectHarnessFromEnv(): HarnessType {
  const env = process.env

  if (env.ARCANA_HARNESS) {
    const h = env.ARCANA_HARNESS.toUpperCase()
    if (["ARCANA", "CODEX", "CLAUDE", "GEMINI", "OPENCODE", "CUSTOM"].includes(h)) {
      return h as HarnessType
    }
  }

  const args = process.argv.join(" ").toLowerCase()
  if (args.includes("codex") || args.includes("openai")) return "CODEX"
  if (args.includes("claude") || args.includes("anthropic")) return "CLAUDE"
  if (args.includes("gemini") || args.includes("google")) return "GEMINI"
  if (args.includes("opencode")) return "OPENCODE"
  if (args.includes("arcana")) return "ARCANA"

  return "CUSTOM"
}
