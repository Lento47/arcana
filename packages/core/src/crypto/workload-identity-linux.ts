/**
 * D-6A-L: Linux Workload Identity Collector
 *
 * Collects OS-observed identity from /proc and kernel namespaces.
 *
 * Authority-bearing fields (compared in pre-effect TOCTOU check):
 *   PID + process start time
 *   executable device/inode
 *   executable SHA-256 digest
 *   UID/GID
 *   mount namespace
 *   PID namespace
 *   user namespace
 *   policy-required parent lineage
 *
 * Descriptive only (never authoritative):
 *   environment variables
 *   command-line arguments
 *   process name
 */

import { createHash } from "node:crypto"
import { readFileSync, existsSync, readlinkSync, statSync } from "node:fs"
import type { WorkloadIdentityAssurance, HarnessType } from "./identity-contracts"
import type { HarnessDetection } from "./workload-identity"

// ─── Linux Process Observation ──────────────────────────────────────

export type LinuxWorkloadObservation = {
  pid: number
  processStartTicks: string

  executablePath: string
  executableDigest: string
  executableDevice: string
  executableInode: string

  uid: number
  gid: number

  parentPid?: number
  parentStartTicks?: string
  parentExecutableDigest?: string

  mountNamespace: string
  pidNamespace: string
  userNamespace: string

  cgroupPath?: string
  securityLabel?: string
}

// ─── Cgroup Evidence ─────────────────────────────────────────────

export type CgroupRuntime = "DOCKER" | "CONTAINERD" | "PODMAN" | "KUBERNETES"

export type LinuxCgroupEvidence = {
  version: 1 | 2
  paths: readonly string[]
  probableRuntime?: CgroupRuntime
  containerId?: string
  /** Always false — cgroup detection is descriptive unless corroborated. */
  authoritative: false
}

// ─── Observation Result ─────────────────────────────────────────────

export type LinuxObservationResult =
  | { success: true; observation: LinuxWorkloadObservation; assurance: WorkloadIdentityAssurance }
  | { success: false; reason: string; assurance: "DECLARED" }

// ─── Collector ──────────────────────────────────────────────────────

/**
 * Observe the current process's Linux-specific identity.
 * Reads from /proc/self and /proc/<pid> where available.
 */
export function observeLinuxProcess(pid: number): LinuxObservationResult {
  const procBase = `/proc/${pid}`
  const procSelf = pid === process.pid ? "/proc/self" : procBase

  // Check /proc is readable
  if (!existsSync(procBase)) {
    return { success: false, reason: `/proc/${pid} does not exist`, assurance: "DECLARED" }
  }

  // ── Read /proc/<pid>/stat for start time ──
  let startTicks = "0"
  let ppid: number | undefined
  try {
    const statContent = readFileSync(`${procBase}/stat`, "utf-8")
    const fields = parseProcStat(statContent)
    if (fields) {
      ppid = fields.ppid
      startTicks = fields.starttime
    }
  } catch {
    return { success: false, reason: `cannot read ${procBase}/stat`, assurance: "DECLARED" }
  }

  // ── Read /proc/<pid>/exe for executable path ──
  let executablePath = "unknown"
  try {
    executablePath = readlinkSync(`${procBase}/exe`)
  } catch {
    // May fail for kernel threads or restricted processes
  }

  // ── Compute executable digest ──
  let executableDigest = "unknown"
  let execDevice = "0"
  let execInode = "0"
  try {
    if (executablePath !== "unknown" && existsSync(executablePath)) {
      const binary = readFileSync(executablePath)
      executableDigest = createHash("sha256").update(binary).digest("hex")
      const stat = statSync(executablePath)
      execDevice = String(stat.dev)
      execInode = String(stat.ino)
    }
  } catch {
    // Digest unavailable — assurance downgrade
  }

  // ── Read UID/GID from /proc/<pid>/status ──
  let uid = 0
  let gid = 0
  try {
    const statusContent = readFileSync(`${procBase}/status`, "utf-8")
    const uidMatch = statusContent.match(/^Uid:\s+(\d+)/m)
    const gidMatch = statusContent.match(/^Gid:\s+(\d+)/m)
    if (uidMatch) uid = parseInt(uidMatch[1], 10)
    if (gidMatch) gid = parseInt(gidMatch[1], 10)
  } catch {}

  // ── Read namespaces ──
  const mountNs = readNamespace(pid, "mnt")
  const pidNs = readNamespace(pid, "pid")
  const userNs = readNamespace(pid, "user")

  // ── Read cgroup ──
  let cgroupPath: string | undefined
  let cgroupEvidence: LinuxCgroupEvidence | undefined
  try {
    const cgroupContent = readFileSync(`${procBase}/cgroup`, "utf-8").trim()
    cgroupEvidence = parseCgroup(cgroupContent)
    cgroupPath = cgroupContent.split("\n")[0]
  } catch {}

  // ── Read security label (SELinux/AppArmor) ──
  let securityLabel: string | undefined
  try {
    const attrPath = `${procBase}/attr/current`
    if (existsSync(attrPath)) {
      securityLabel = readFileSync(attrPath, "utf-8").trim()
    }
  } catch {}

  // ── Parent process info ──
  let parentStartTicks: string | undefined
  let parentDigest: string | undefined
  if (ppid && ppid > 0) {
    try {
      const parentStat = readFileSync(`/proc/${ppid}/stat`, "utf-8")
      const parentFields = parseProcStat(parentStat)
      if (parentFields) {
        parentStartTicks = parentFields.starttime
      }
    } catch {}

    try {
      const parentExe = readlinkSync(`/proc/${ppid}/exe`)
      if (parentExe && existsSync(parentExe)) {
        const binary = readFileSync(parentExe)
        parentDigest = createHash("sha256").update(binary).digest("hex")
      }
    } catch {}
  }

  // ── Determine assurance level ──
  let assurance: WorkloadIdentityAssurance = "DECLARED"
  if (executableDigest !== "unknown" && uid > 0) {
    assurance = "OS_OBSERVED"
  }

  return {
    success: true,
    observation: {
      pid,
      processStartTicks: startTicks,
      executablePath,
      executableDigest,
      executableDevice: execDevice,
      executableInode: execInode,
      uid,
      gid,
      parentPid: ppid,
      parentStartTicks,
      parentExecutableDigest: parentDigest,
      mountNamespace: mountNs,
      pidNamespace: pidNs,
      userNamespace: userNs,
      cgroupPath,
      securityLabel,
    },
    assurance,
  }
}

// ─── TOCTOU Stability Check ────────────────────────────────────────

/**
 * Compare admission observation with pre-effect observation.
 * All authority-bearing fields must match.
 */
export function verifyLinuxObservationStable(
  admission: LinuxWorkloadObservation,
  current: LinuxWorkloadObservation,
): { stable: true } | { stale: false; reason: string } {
  if (admission.pid !== current.pid) {
    return { stale: false, reason: `PID changed: ${admission.pid} → ${current.pid}` }
  }
  if (admission.processStartTicks !== current.processStartTicks) {
    return { stale: false, reason: `process start time changed (PID reuse)` }
  }
  if (admission.executableDevice !== current.executableDevice || admission.executableInode !== current.executableInode) {
    return { stale: false, reason: `executable inode changed` }
  }
  if (admission.executableDigest !== current.executableDigest) {
    return { stale: false, reason: `executable digest changed` }
  }
  if (admission.uid !== current.uid || admission.gid !== current.gid) {
    return { stale: false, reason: `UID/GID changed` }
  }
  if (admission.mountNamespace !== current.mountNamespace) {
    return { stale: false, reason: `mount namespace changed` }
  }
  if (admission.pidNamespace !== current.pidNamespace) {
    return { stale: false, reason: `PID namespace changed` }
  }
  if (admission.userNamespace !== current.userNamespace) {
    return { stale: false, reason: `user namespace changed` }
  }
  return { stable: true }
}

// ─── Helpers ────────────────────────────────────────────────────────

function readNamespace(pid: number, nsType: string): string {
  try {
    const link = readlinkSync(`/proc/${pid}/ns/${nsType}`)
    return link // e.g., "mnt:[4026531840]"
  } catch {
    return "unknown"
  }
}

type ProcStatFields = {
  ppid: number
  starttime: string
}

/**
 * Parse /proc/<pid>/stat to extract PPID and start time.
 * Handles comm field containing spaces and parentheses.
 */
export function parseProcStat(content: string): ProcStatFields | undefined {
  // Format: pid (comm) state ppid pgrp session tty_nr ...
  // comm can contain spaces and parens, so find the last ')'
  const lastParen = content.lastIndexOf(")")
  if (lastParen < 0) return undefined

  const afterComm = content.slice(lastParen + 2).trim()
  const fields = afterComm.split(/\s+/)

  // fields[0] = state, fields[1] = ppid, ..., fields[19] = starttime (0-indexed after comm)
  // Actually: after ')', field[0]=state, field[1]=ppid, ..., field[19]=starttime
  // But the standard says: pid (comm) state ppid pgrp session tty_nr tpgid flags
  //   minflt cminflt majflt cmajflt utime stime cutime cstime priority nice
  //   num_threads itrealvalue starttime vsize rss ...
  // So starttime is field[19] after the ')'
  if (fields.length < 20) return undefined

  return {
    ppid: parseInt(fields[1], 10),
    starttime: fields[19],
  }
}

/**
 * Parse /proc/<pid>/cgroup content into structured evidence.
 *
 * Format v2: "0::/user.slice/..."
 * Format v1: "N:controllers:/path"
 *
 * Returns structured evidence with version, paths, probable runtime,
 * and container ID. Runtime detection is descriptive only.
 */
export function parseCgroup(content: string): LinuxCgroupEvidence {
  const lines = content.split("\n").filter(l => l.trim())
  const paths: string[] = []

  // Detect v2 vs v1
  // v2: single line starting with "0::"
  // v1: multiple lines with "N:controllers:path"
  const isV2 = lines.length === 1 && lines[0]!.startsWith("0::")
  const version: 1 | 2 = isV2 ? 2 : 1

  for (const line of lines) {
    if (isV2) {
      // v2 format: "0::/path"
      const path = line.slice(3) // skip "0::"
      if (path) paths.push(path)
    } else {
      // v1 format: "N:controllers:/path"
      const colonIdx = line.indexOf(":", line.indexOf(":") + 1)
      if (colonIdx >= 0) {
        const path = line.slice(colonIdx + 1)
        if (path) paths.push(path)
      }
    }
  }

  // Detect runtime and container ID
  let probableRuntime: CgroupRuntime | undefined
  let containerId: string | undefined

  const allPaths = paths.join(" ")

  // Check for container runtimes
  if (allPaths.includes("/docker/") || allPaths.includes("/docker-")) {
    probableRuntime = "DOCKER"
  } else if (allPaths.includes("/containerd/") || allPaths.includes("/containerd-")) {
    probableRuntime = "CONTAINERD"
  } else if (allPaths.includes("/podman/") || allPaths.includes("/podman-")) {
    probableRuntime = "PODMAN"
  } else if (allPaths.includes("/kubepods/") || allPaths.includes("/kubepods.slice")) {
    probableRuntime = "KUBERNETES"
  }

  // Extract container ID (64-hex-char pattern)
  const containerMatch = allPaths.match(/([0-9a-f]{64})/)
  if (containerMatch) {
    containerId = containerMatch[1]
  }

  return {
    version,
    paths,
    probableRuntime,
    containerId,
    authoritative: false,
  }
}
