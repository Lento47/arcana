/**
 * E5: external CLI launch declaration.
 *
 * Honest enforcement-level contract for `arcana launch <runtime>`: the
 * current implementation is A1 (process supervision + evidence capture),
 * NOT a sandbox. Every launch records the declared boundary and its known
 * bypasses so no enforcement claim is implied.
 */

export type LaunchRuntime = "codex" | "claude" | "gemini"

export const LAUNCH_RUNTIMES: readonly LaunchRuntime[] = ["codex", "claude", "gemini"]

export type LaunchDeclaration = {
  runtime: LaunchRuntime
  level: "A1"
  protocolVersion: string
  boundariesCovered: string[]
  knownBypasses: string[]
  operatingSystems: string[]
}

export function launchDeclaration(runtime: LaunchRuntime): LaunchDeclaration {
  return {
    runtime,
    level: "A1",
    protocolVersion: "1.0-draft",
    boundariesCovered: [
      "process supervision (spawn, cwd, exit status, duration)",
      "durable launch evidence record (JSON)",
      "session/workspace identity binding (directory-scoped)",
    ],
    knownBypasses: [
      "no OS-level sandbox (filesystem/network/process/secret constraints)",
      "effects performed by the runtime outside Arcana supervision are not governed",
      "PTY/terminal-mediated effects are not intercepted",
    ],
    operatingSystems: ["windows", "linux", "macos"],
  }
}
