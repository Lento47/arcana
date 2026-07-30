/**
 * D-6A-L: Linux Workload Identity Collector Tests
 * Run with: bun run packages/core/src/crypto/run-linux-identity-tests.ts
 *
 * Tests /proc parsing with captured fixtures.
 * Live Linux tests require WSL or Linux CI.
 */

import {
  parseProcStat,
  verifyLinuxObservationStable,
  type LinuxWorkloadObservation,
} from "./workload-identity-linux"

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
// /proc/<pid>/stat parsing
// ═══════════════════════════════════════════════════════════════════════

console.log("Parse /proc/stat: normal process")
{
  // Typical: 1234 (bash) S 1000 1234 1234 0 -1 4194304 ...
  // Field 3 = state, field 4 = ppid, field 22 = starttime
  const stat = "1234 (bash) S 1000 1234 1234 0 -1 4194304 1234 0 0 0 0 0 0 0 20 0 1 0 5000 12345 100 18446744073709551615"
  const result = parseProcStat(stat)
  assert(result !== undefined, "parses successfully")
  assertEqual(result!.ppid, 1000, "PPID is 1000")
  assertEqual(result!.starttime, "5000", "starttime is 5000")
}

console.log("Parse /proc/stat: process with spaces in name")
{
  // "my process name" with spaces
  const stat = "5678 (my process name) R 1000 5678 5678 0 -1 4194304 500 0 0 0 0 0 0 0 20 0 1 0 6000 20000 50 18446744073709551615"
  const result = parseProcStat(stat)
  assert(result !== undefined, "parses with spaces in name")
  assertEqual(result!.ppid, 1000, "PPID correct")
  assertEqual(result!.starttime, "6000", "starttime correct")
}

console.log("Parse /proc/stat: process with parentheses in name")
{
  // Process name contains parens: "test (foo)"
  const stat = "9999 (test (foo)) S 100 9999 9999 0 -1 4194304 100 0 0 0 0 0 0 0 20 0 1 0 7000 30000 60 18446744073709551615"
  const result = parseProcStat(stat)
  assert(result !== undefined, "parses with parens in name")
  assertEqual(result!.ppid, 100, "PPID correct")
  assertEqual(result!.starttime, "7000", "starttime correct")
}

console.log("Parse /proc/stat: kernel thread (kthreadd)")
{
  // PID 2: kthreadd
  const stat = "2 (kthreadd) S 0 0 0 0 -1 2129920 0 0 0 0 0 0 0 0 20 0 1 0 10 0 0 18446744073709551615"
  const result = parseProcStat(stat)
  assert(result !== undefined, "parses kthreadd")
  assertEqual(result!.ppid, 0, "PPID is 0 (init)")
}

console.log("Parse /proc/stat: malformed input")
{
  assert(parseProcStat("") === undefined, "empty string returns undefined")
  assert(parseProcStat("invalid") === undefined, "invalid string returns undefined")
  assert(parseProcStat("1234 (") === undefined, "incomplete paren returns undefined")
}

console.log("Parse /proc/stat: process with very long name")
{
  const longName = "a".repeat(200)
  const stat = `1234 (${longName}) S 1000 1234 1234 0 -1 4194304 100 0 0 0 0 0 0 0 20 0 1 0 8000 40000 70 18446744073709551615`
  const result = parseProcStat(stat)
  assert(result !== undefined, "parses long name")
  assertEqual(result!.ppid, 1000, "PPID correct")
}

// ═══════════════════════════════════════════════════════════════════════
// TOCTOU stability
// ═══════════════════════════════════════════════════════════════════════

console.log("TOCTOU: identical observation is stable")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    parentPid: 1000, parentStartTicks: "1000",
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs })
  assert(result.stable === true, "identical observation is stable")
}

console.log("TOCTOU: PID change detected")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs, pid: 9999 })
  assert(result.stale === false && result.reason.includes("PID"), "PID change detected")
}

console.log("TOCTOU: PID reuse detected (start time change)")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs, processStartTicks: "9999" })
  assert(result.stale === false && result.reason.includes("start time"), "PID reuse detected")
}

console.log("TOCTOU: executable inode change detected")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs, executableInode: "999999" })
  assert(result.stale === false && result.reason.includes("inode"), "inode change detected")
}

console.log("TOCTOU: executable digest change detected")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs, executableDigest: "EVIL" })
  assert(result.stale === false && result.reason.includes("digest"), "digest change detected")
}

console.log("TOCTOU: UID change detected")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs, uid: 0 })
  assert(result.stale === false && result.reason.includes("UID"), "UID change detected")
}

console.log("TOCTOU: mount namespace change detected")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs, mountNamespace: "mnt:[4026539999]" })
  assert(result.stale === false && result.reason.includes("mount namespace"), "mount namespace change detected")
}

console.log("TOCTOU: PID namespace change detected")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs, pidNamespace: "pid:[4026539999]" })
  assert(result.stale === false && result.reason.includes("PID namespace"), "PID namespace change detected")
}

console.log("TOCTOU: user namespace change detected")
{
  const obs: LinuxWorkloadObservation = {
    pid: 1234, processStartTicks: "5000",
    executablePath: "/usr/bin/bun", executableDigest: "abc123",
    executableDevice: "2049", executableInode: "123456",
    uid: 1000, gid: 1000,
    mountNamespace: "mnt:[4026531840]", pidNamespace: "pid:[4026531836]",
    userNamespace: "user:[4026531837]",
  }

  const result = verifyLinuxObservationStable(obs, { ...obs, userNamespace: "user:[4026539999]" })
  assert(result.stale === false && result.reason.includes("user namespace"), "user namespace change detected")
}

// ═══════════════════════════════════════════════════════════════════════

console.log(`\n═══════════════════════════════════════════`)
console.log(`Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`)
if (failures.length > 0) {
  console.log(`\nFailures:`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log(`✓ All tests passed`)
}
