/**
 * D-6A-L: Linux Workload Identity Tests
 * Run with: bun run packages/core/src/crypto/run-linux-identity-tests.ts
 *
 * Tests /proc parsing, cgroup v1/v2 fixtures, TOCTOU stability.
 * Live tests require WSL or Linux.
 */

import {
  parseProcStat,
  parseCgroup,
  verifyLinuxObservationStable,
  type LinuxWorkloadObservation,
  type LinuxCgroupEvidence,
} from "./workload-identity-linux"

// ─── Test Harness ────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ═══════════════════════════════════════════════════════════════════════
// 1. /proc/stat PARSING
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ D-6A-L /proc/stat Parsing ═══")

console.log("normal process")
{
  // Standard format: pid (comm) state ppid ... starttime (field 19 after comm)
  const stat = "1234 (bash) S 1000 1234 1234 34816 1234 4194304 123 0 0 0 0 0 0 0 20 0 1 0 12345678 ..."
  const result = parseProcStat(stat)
  assert(result !== undefined, "parsed")
  assertEqual(result!.ppid, 1000, "ppid")
  assertEqual(result!.starttime, "12345678", "starttime")
}

console.log("process with spaces in comm")
{
  const stat = "5678 (my process name) R 1000 5678 5678 34816 5678 4194304 100 0 0 0 0 0 0 0 20 0 1 0 98765432 ..."
  const result = parseProcStat(stat)
  assert(result !== undefined, "parsed with spaces")
  assertEqual(result!.ppid, 1000, "ppid")
  assertEqual(result!.starttime, "98765432", "starttime")
}

console.log("process with parentheses in comm")
{
  const stat = "9999 (process (with) parens) S 1 9999 9999 34816 9999 4194304 50 0 0 0 0 0 0 0 20 0 1 0 11111111 ..."
  const result = parseProcStat(stat)
  assert(result !== undefined, "parsed with parens")
  assertEqual(result!.ppid, 1, "ppid (init)")
  assertEqual(result!.starttime, "11111111", "starttime")
}

console.log("kernel thread (comm = kworker)")
{
  const stat = "100 (kworker/0:1) S 2 100 100 0 -1 69238816 0 0 0 0 0 0 0 0 20 0 1 0 55555555 ..."
  const result = parseProcStat(stat)
  assert(result !== undefined, "parsed kernel thread")
  assertEqual(result!.ppid, 2, "ppid (kthreadd)")
}

console.log("malformed stat — no closing paren")
{
  const stat = "1234 (broken"
  const result = parseProcStat(stat)
  assertEqual(result, undefined, "returns undefined")
}

console.log("malformed stat — too few fields after comm")
{
  const stat = "1234 (x) S 1000"
  const result = parseProcStat(stat)
  assertEqual(result, undefined, "returns undefined for too few fields")
}

console.log("single-character comm")
{
  const stat = "1 (init) S 0 1 1 0 -1 4194304 100 0 0 0 0 0 0 0 20 0 1 0 100 ..."
  const result = parseProcStat(stat)
  assert(result !== undefined, "parsed single-char comm")
  assertEqual(result!.ppid, 0, "ppid is 0 (no parent)")
}

// ═══════════════════════════════════════════════════════════════════════
// 2. CGROUP PARSING — v2
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ D-6A-L Cgroup v2 Parsing ═══")

console.log("host process (user service)")
{
  const content = "0::/user.slice/user-1000.slice/session-2.scope"
  const result = parseCgroup(content)
  assertEqual(result.version, 2, "version")
  assertEqual(result.paths.length, 1, "1 path")
  assertEqual(result.paths[0], "/user.slice/user-1000.slice/session-2.scope", "path")
  assertEqual(result.probableRuntime, undefined, "no container runtime")
  assertEqual(result.containerId, undefined, "no container ID")
  assertEqual(result.authoritative, false, "descriptive only")
}

console.log("systemd system service")
{
  const content = "0::/system.slice/sshd.service"
  const result = parseCgroup(content)
  assertEqual(result.version, 2, "version")
  assertEqual(result.paths[0], "/system.slice/sshd.service", "path")
}

console.log("root cgroup")
{
  const content = "0::/"
  const result = parseCgroup(content)
  assertEqual(result.version, 2, "version")
  assertEqual(result.paths[0], "/", "root path")
}

console.log("empty cgroup path")
{
  const content = "0::"
  const result = parseCgroup(content)
  assertEqual(result.version, 2, "version")
  assertEqual(result.paths.length, 0, "empty paths")
}

// ═══════════════════════════════════════════════════════════════════════
// 3. CGROUP PARSING — v1
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ D-6A-L Cgroup v1 Parsing ═══")

console.log("Docker container")
{
  const content = [
    "12:perf_event:/docker/abc123def456789012345678901234567890123456789012345678901234abcd",
    "11:memory:/docker/abc123def456789012345678901234567890123456789012345678901234abcd",
    "10:cpu,cpuacct:/docker/abc123def456789012345678901234567890123456789012345678901234abcd",
    "9:cpuset:/docker/abc123def456789012345678901234567890123456789012345678901234abcd",
  ].join("\n")
  const result = parseCgroup(content)
  assertEqual(result.version, 1, "version")
  assert(result.paths.length === 4, "4 paths")
  assertEqual(result.probableRuntime, "DOCKER", "detected Docker")
  assert(result.containerId !== undefined, "container ID extracted")
  assert(result.containerId!.length === 64, "container ID is 64 hex chars")
  assertEqual(result.authoritative, false, "descriptive only")
}

console.log("containerd container")
{
  const content = [
    "11:memory:/containerd/abc123def456789012345678901234567890123456789012345678901234abcd",
    "10:cpu,cpuacct:/containerd/abc123def456789012345678901234567890123456789012345678901234abcd",
  ].join("\n")
  const result = parseCgroup(content)
  assertEqual(result.version, 1, "version")
  assertEqual(result.probableRuntime, "CONTAINERD", "detected containerd")
}

console.log("podman container")
{
  const content = [
    "11:memory:/podman/abc123def456789012345678901234567890123456789012345678901234abcd",
  ].join("\n")
  const result = parseCgroup(content)
  assertEqual(result.version, 1, "version")
  assertEqual(result.probableRuntime, "PODMAN", "detected podman")
}

console.log("Kubernetes pod")
{
  const content = [
    "11:memory:/kubepods/besteffort/podabc123/def456",
    "10:cpu,cpuacct:/kubepods/besteffort/podabc123/def456",
  ].join("\n")
  const result = parseCgroup(content)
  assertEqual(result.version, 1, "version")
  assertEqual(result.probableRuntime, "KUBERNETES", "detected Kubernetes")
}

console.log("multiple controllers")
{
  const content = [
    "11:memory:/user.slice",
    "10:cpu,cpuacct:/user.slice",
    "9:cpuset:/user.slice",
    "8:blkio:/user.slice",
    "7:devices:/user.slice",
  ].join("\n")
  const result = parseCgroup(content)
  assertEqual(result.version, 1, "version")
  assertEqual(result.paths.length, 5, "5 paths")
  assertEqual(result.probableRuntime, undefined, "no container runtime")
}

console.log("empty/root cgroup v1")
{
  const content = "10:cpu,cpuacct:/"
  const result = parseCgroup(content)
  assertEqual(result.version, 1, "version")
  assertEqual(result.paths[0], "/", "root path")
}

console.log("malformed entry — no second colon")
{
  const content = "10 malformed"
  const result = parseCgroup(content)
  assertEqual(result.version, 1, "version (fallback)")
  assertEqual(result.paths.length, 0, "no paths from malformed")
}

console.log("empty content")
{
  const content = ""
  const result = parseCgroup(content)
  // Empty content has 0 lines, isV2 check: lines.length === 1 && startsWith("0::") → false → v1
  assertEqual(result.version, 1, "version (fallback)")
  assertEqual(result.paths.length, 0, "no paths")
}

console.log("docker-compose with container name in path")
{
  const content = "11:memory:/docker/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  const result = parseCgroup(content)
  assertEqual(result.probableRuntime, "DOCKER", "Docker")
  assert(result.containerId !== undefined, "container ID")
  assert(result.containerId!.length === 64, "64 hex chars")
}

// ═══════════════════════════════════════════════════════════════════════
// 4. TOCTOU STABILITY — field changes
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ D-6A-L TOCTOU Stability ═══")

function makeObservation(overrides?: Partial<LinuxWorkloadObservation>): LinuxWorkloadObservation {
  return {
    pid: 1234,
    processStartTicks: "12345678",
    executablePath: "/usr/bin/bash",
    executableDigest: "abc123",
    executableDevice: "100",
    executableInode: "500",
    uid: 1000,
    gid: 1000,
    parentPid: 1,
    parentStartTicks: "100",
    parentExecutableDigest: "def456",
    mountNamespace: "mnt:[4026531840]",
    pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
    cgroupPath: "0::/user.slice",
    securityLabel: "unconfined",
    ...overrides,
  }
}

const baseObs = makeObservation()

console.log("identical observations are stable")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation())
  assert("stable" in result, "stable")
}

console.log("same PID, changed start ticks → MISMATCH")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ processStartTicks: "99999999" }))
  assert(!("stable" in result), "not stable")
  assert(!("stable" in result) && result.reason.includes("start time"), "reason mentions start time")
}

console.log("executable device/inode changed → MISMATCH")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ executableDevice: "200" }))
  assert(!("stable" in result), "not stable")
  assert(!("stable" in result) && result.reason.includes("inode"), "reason mentions inode")
}

console.log("executable digest changed → MISMATCH")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ executableDigest: "changed" }))
  assert(!("stable" in result), "not stable")
  assert(!("stable" in result) && result.reason.includes("digest"), "reason mentions digest")
}

console.log("UID/GID changed → MISMATCH")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ uid: 0 }))
  assert(!("stable" in result), "not stable")
  assert(!("stable" in result) && result.reason.includes("UID"), "reason mentions UID")
}

console.log("mount namespace changed → MISMATCH")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ mountNamespace: "mnt:[9999999999]" }))
  assert(!("stable" in result), "not stable")
  assert(!("stable" in result) && result.reason.includes("mount"), "reason mentions mount")
}

console.log("PID namespace changed → MISMATCH")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ pidNamespace: "pid:[9999999999]" }))
  assert(!("stable" in result), "not stable")
  assert(!("stable" in result) && result.reason.includes("PID namespace"), "reason mentions PID namespace")
}

console.log("user namespace changed → MISMATCH")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ userNamespace: "user:[9999999999]" }))
  assert(!("stable" in result), "not stable")
  assert(!("stable" in result) && result.reason.includes("user namespace"), "reason mentions user namespace")
}

console.log("PID changed → MISMATCH")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ pid: 5678 }))
  assert(!("stable" in result), "not stable")
  assert(!("stable" in result) && result.reason.includes("PID"), "reason mentions PID")
}

console.log("cgroupPath change is NOT checked (descriptive)")
{
  // cgroup path is not authority-bearing
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ cgroupPath: "0::/docker/..." }))
  assert("stable" in result, "stable (cgroup is descriptive)")
}

console.log("securityLabel change is NOT checked (descriptive)")
{
  const result = verifyLinuxObservationStable(baseObs, makeObservation({ securityLabel: "container_t" }))
  assert("stable" in result, "stable (security label is descriptive)")
}

// ═══════════════════════════════════════════════════════════════════════
// 5. LIVE LINUX (WSL) — if /proc/self exists
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ D-6A-L Live Linux (WSL) ═══")

import { existsSync } from "node:fs"

if (existsSync("/proc/self")) {
  console.log("/proc/self exists — running live tests")

  // Import the actual collector
  const { observeLinuxProcess } = require("./workload-identity-linux")

  console.log("observe current process")
  {
    const result = observeLinuxProcess(process.pid)
    assert(result.success === true, "observation succeeds")
    if (result.success) {
      assertEqual(result.observation.pid, process.pid, "PID matches")
      assert(result.observation.processStartTicks !== "0", "start ticks collected")
      assert(result.observation.executablePath !== "unknown", "executable path resolved")
      assert(result.observation.executableDigest !== "unknown", "digest computed")
      assert(result.observation.uid > 0, "UID is non-zero")
      assert(result.observation.mountNamespace !== "unknown", "mount namespace collected")
      assert(result.observation.pidNamespace !== "unknown", "PID namespace collected")
      assert(result.observation.userNamespace !== "unknown", "user namespace collected")
      assert(result.assurance === "OS_OBSERVED", "assurance is OS_OBSERVED")
    }
  }

  console.log("observe twice — same process is stable")
  {
    const obs1 = observeLinuxProcess(process.pid)
    const obs2 = observeLinuxProcess(process.pid)
    if (obs1.success && obs2.success) {
      const result = verifyLinuxObservationStable(obs1.observation, obs2.observation)
      assert("stable" in result, "stable across re-reads")
    }
  }

  console.log("observe non-existent PID → fail closed")
  {
    const result = observeLinuxProcess(999999999)
    assert(result.success === false, "fails closed")
    assert(result.assurance === "DECLARED", "assurance is DECLARED")
  }
} else {
  console.log("/proc/self not available — skipping live tests (Windows native)")
}

// ═══════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════════════════")
console.log(`D-6A-L Linux Identity: ${passed} passed, ${failed} failed`)
if (failures.length) {
  console.log("\nFailed:")
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
console.log("═══════════════════════════════════════════════════════════════════")

if (failed > 0) process.exit(1)
