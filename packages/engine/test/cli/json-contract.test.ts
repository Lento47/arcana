// CLI JSON contract tests (docs/cli-json-contract.md).
//
// Each test spawns the real CLI with `--json` and asserts:
//   1. stdout parses as valid JSON (no tables, headers, ANSI, or progress),
//   2. exit code 0 on success, 1 on user/validation errors,
//   3. errors land on stderr, never stdout.
//
// Commands covered here are the read-only / deterministic leaves of the
// BLK-CLI-02 conversion (run, history, capability, doctor, models, providers,
// daemon, cron). Long-running commands (serve, gateway, cron start) and
// interactive-only commands are covered by the exit-code scheme in the
// handler-level tests; they are documented as exempt in the PR body.
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

function parseJson(stdout: string): unknown {
  return JSON.parse(stdout.trim())
}

describe("CLI --json contract", () => {
  cliIt.live(
    "history list --json emits a valid JSON array",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["history", "list", "--json"])
        opencode.expectExit(r, 0, "history list --json")
        const parsed = parseJson(r.stdout)
        expect(Array.isArray(parsed)).toBe(true)
      }),
    60_000,
  )

  cliIt.live(
    "history show --id <missing> --json exits 1 with the error on stderr only",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["history", "show", "--id", "does-not-exist", "--json"])
        opencode.expectExit(r, 1, "history show missing --json")
        expect(r.stdout.trim()).toBe("")
        expect(r.stderr).toContain("Session not found")
      }),
    60_000,
  )

  cliIt.live(
    "capability revoke --json exits 1 with a user error on unknown session",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn([
          "capability", "revoke", "session-does-not-exist", "grant-does-not-exist", "--json",
        ])
        opencode.expectExit(r, 1, "capability revoke missing --json")
        expect(r.stdout.trim()).toBe("")
      }),
    60_000,
  )

  cliIt.live(
    "doctor --json emits a valid JSON array of checks",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["doctor", "--json"])
        opencode.expectExit(r, 0, "doctor --json")
        const parsed = parseJson(r.stdout) as Array<{ label: string; ok: boolean; detail: string }>
        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed.length).toBeGreaterThan(0)
        for (const check of parsed) {
          expect(typeof check.label).toBe("string")
          expect(typeof check.ok).toBe("boolean")
          expect(typeof check.detail).toBe("string")
        }
      }),
    60_000,
  )

  cliIt.live(
    "models --json emits a valid JSON object keyed by provider",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["models", "--json"])
        opencode.expectExit(r, 0, "models --json")
        const parsed = parseJson(r.stdout) as Record<string, unknown>
        expect(typeof parsed).toBe("object")
        // The test provider config always wires test/test-model.
        expect(JSON.stringify(parsed)).toContain("test-model")
      }),
    60_000,
  )

  cliIt.live(
    "providers list --json emits credentials without secrets",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["providers", "list", "--json"])
        opencode.expectExit(r, 0, "providers list --json")
        const parsed = parseJson(r.stdout) as {
          credentials: Array<{ provider: string; name: string; type: string }>
          environment: Array<{ provider: string; envVar: string }>
        }
        expect(Object.keys(parsed).sort()).toEqual(["credentials", "environment"])
        expect(Array.isArray(parsed.credentials)).toBe(true)
        for (const cred of parsed.credentials) {
          expect(Object.keys(cred).sort()).toEqual(["name", "provider", "type"])
          expect(typeof cred.provider).toBe("string")
          expect(typeof cred.name).toBe("string")
          expect(typeof cred.type).toBe("string")
        }
        expect(Array.isArray(parsed.environment)).toBe(true)
        for (const item of parsed.environment) {
          // Environment-variable names are safe metadata; values must never be present.
          expect(Object.keys(item).sort()).toEqual(["envVar", "provider"])
          expect(typeof item.provider).toBe("string")
          expect(item.envVar).toMatch(/^[A-Z][A-Z0-9_]*$/)
        }
      }),
    60_000,
  )

  cliIt.live(
    "daemon status --json emits a valid status object",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["daemon", "status", "--json"])
        opencode.expectExit(r, 0, "daemon status --json")
        const parsed = parseJson(r.stdout) as { running: boolean; daemons: unknown[] }
        expect(typeof parsed.running).toBe("boolean")
        expect(Array.isArray(parsed.daemons)).toBe(true)
      }),
    60_000,
  )

  cliIt.live(
    "cron list --json emits a valid JSON array",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["cron", "list", "--json"])
        opencode.expectExit(r, 0, "cron list --json")
        const parsed = parseJson(r.stdout)
        expect(Array.isArray(parsed)).toBe(true)
      }),
    60_000,
  )
})
