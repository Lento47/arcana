/**
 * S9 — composer pulse-gating tests (audit finding S9: 200ms pulse interval
 * ran forever, even idle — 5 Hz render-thread wakeups).
 *
 * The pulse lifecycle is Solid-runtime (createEffect start/stop), so the
 * testable surface is: the pure gating predicate pulseActive + source-level
 * contracts that the interval is gated (no persistent onMount interval) and
 * the shell's state pass is typed (no `as any`).
 *
 * M3 prerequisite note: the SDK `SessionStatus` union is idle|retry|busy
 * (types.gen.ts:672) — there is NO "thinking" status to emit, so gating on
 * the existing "working" chain suffices; M3 is not a hard prerequisite.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pulseActive } from "../src/shell/command-spine/spine-prompt"

const promptSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-prompt.tsx"),
  "utf8",
)
const shellSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"),
  "utf8",
)

describe("pulseActive (M3-narrowed gating predicate)", () => {
  test("active while working", () => {
    expect(pulseActive("working")).toBe(true)
  })

  test("stopped in idle and stop", () => {
    expect(pulseActive("idle")).toBe(false)
    expect(pulseActive("stop")).toBe(false)
  })
})

describe("S9 source contract", () => {
  test("no persistent onMount interval remains", () => {
    expect(promptSrc).not.toContain("Persistent pulse")
    expect(promptSrc).not.toMatch(/onMount\(/)
  })

  test("interval lifecycle is effect-gated on state", () => {
    expect(promptSrc).toContain("createEffect")
    expect(promptSrc).toContain("setInterval")
    expect(promptSrc).toContain("clearInterval(pulseTimer)")
    expect(promptSrc).toContain("pulseActive(props.state())")
  })

  test("shell passes the state accessor typed, not as any", () => {
    expect(shellSrc).toContain("state={runState}")
    expect(shellSrc).not.toContain("state={runState as any}")
  })
})

describe("M3 dead-branch contract", () => {
  test("thinking palette branch deleted — only working pulses", () => {
    expect(promptSrc).not.toContain('props.state() === "thinking"')
  })

  test("state prop union narrowed to the real statuses", () => {
    expect(promptSrc).toContain('state: () => "idle" | "working" | "stop"')
  })
})
