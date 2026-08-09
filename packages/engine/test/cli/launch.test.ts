// E5 certification test: `arcana launch <runtime> --dry-run` must print the
// declared certification level with evidence and nonclaims. Runs the real CLI
// through the subprocess harness so the printed declaration is the production
// output, not a unit-test re-implementation.
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

describe("arcana launch declaration (E5)", () => {
  cliIt.live(
    "launch codex --dry-run prints the A1 declaration",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["launch", "codex", "--dry-run"])
        opencode.expectExit(r, 0, "launch codex --dry-run")
        expect(r.stdout).toContain("[arcana launch] codex")
        expect(r.stdout).toContain("certification level: A1")
        expect(r.stdout).toContain("test version:")
        expect(r.stdout).toContain("evidence:")
        expect(r.stdout).toContain("nonclaims:")
        expect(r.stdout).toContain("no sandbox claim")
        expect(r.stdout).toContain("no exact-effect PEP claim")
        expect(r.stdout).toContain("[dry-run] no process launched")
      }),
    60_000,
  )

  cliIt.live(
    "launch claude --dry-run prints the A1 declaration",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["launch", "claude", "--dry-run"])
        opencode.expectExit(r, 0, "launch claude --dry-run")
        expect(r.stdout).toContain("[arcana launch] claude")
        expect(r.stdout).toContain("certification level: A1")
        expect(r.stdout).toContain("test version:")
        expect(r.stdout).toContain("evidence:")
        expect(r.stdout).toContain("nonclaims:")
        expect(r.stdout).toContain("no sandbox claim")
        expect(r.stdout).toContain("no exact-effect PEP claim")
        expect(r.stdout).toContain("[dry-run] no process launched")
      }),
    60_000,
  )

  cliIt.live(
    "launch gemini --dry-run prints the A1 declaration",
    ({ opencode }) =>
      Effect.gen(function* () {
        const r = yield* opencode.spawn(["launch", "gemini", "--dry-run"])
        opencode.expectExit(r, 0, "launch gemini --dry-run")
        expect(r.stdout).toContain("[arcana launch] gemini")
        expect(r.stdout).toContain("certification level: A1")
        expect(r.stdout).toContain("test version:")
        expect(r.stdout).toContain("evidence:")
        expect(r.stdout).toContain("nonclaims:")
        expect(r.stdout).toContain("no sandbox claim")
        expect(r.stdout).toContain("no exact-effect PEP claim")
        expect(r.stdout).toContain("[dry-run] no process launched")
      }),
    60_000,
  )
})
