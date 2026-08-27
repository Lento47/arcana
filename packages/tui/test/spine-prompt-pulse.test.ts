/**
 * S9 — composer pulse-gating tests (audit finding S9: 200ms pulse interval
 * ran forever, even idle — 5 Hz render-thread wakeups).
 *
 * The pulse lifecycle is Solid-runtime (createEffect start/stop), so the
 * testable surface is: the pure gating predicate pulseActive + source-level
 * contracts that the interval is gated (no persistent onMount interval) and
 * the shell's state pass is typed (no `as any`).
 *
 * Permission/approval waits are explicit non-animated states; only active
 * model work may drive the pulse interval.
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
const composerSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-composer.tsx"),
  "utf8",
)
const motionSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-motion.tsx"),
  "utf8",
)

describe("pulseActive (M3-narrowed gating predicate)", () => {
  test("active while working", () => {
    expect(pulseActive("working")).toBe(true)
    expect(pulseActive("retrying")).toBe(true)
  })

  test("stopped in idle, waiting, and stop", () => {
    expect(pulseActive("idle")).toBe(false)
    expect(pulseActive("waiting")).toBe(false)
    expect(pulseActive("stop")).toBe(false)
  })
})

describe("S9 source contract", () => {
  test("no persistent onMount interval remains", () => {
    expect(promptSrc).not.toContain("Persistent pulse")
    expect(promptSrc).not.toMatch(/onMount\(/)
  })

  test("one shared interval is gated by the dominant motion cue", () => {
    expect(promptSrc).not.toContain("setInterval")
    expect(motionSrc).toContain("createEffect")
    expect(motionSrc).toContain("setInterval")
    expect(motionSrc).toContain("clearInterval(timer)")
    expect(motionSrc).toContain("props.activeCue() !== undefined")
  })

  test("shell passes the state accessor typed, not as any", () => {
    expect(shellSrc).toContain("state={runState}")
    expect(shellSrc).not.toContain("state={runState as any}")
  })

  test("composer lead owns the left edge and frame receives rail-adjusted width", () => {
    expect(promptSrc).toContain("<SpineRail")
    expect(promptSrc).toContain("glyph={markerGlyph()}")
    expect(promptSrc).toContain('return "✶"')
    expect(promptSrc).toContain("const phase = motion?.phase() ?? 0")
    expect(promptSrc).toContain("spineRailWidth(props.layout())")
    expect(promptSrc).toContain("contentWidth={promptContentWidth()}")
    expect(promptSrc).toContain("contentWidth?: number")
    expect(shellSrc).toContain("contentWidth={viewportWidth()}")
  })

  test("idle operator hint row collapses instead of reserving blank height", () => {
    expect(composerSrc).toContain("const hasOperatorCue = () =>")
    expect(composerSrc).toContain("<Show when={hasOperatorCue()}>")
  })
})

describe("M3 dead-branch contract", () => {
  test("thinking palette branch deleted — working/retrying pulses", () => {
    expect(promptSrc).not.toContain('props.state() === "thinking"')
  })

  test("state prop uses the shared lifecycle union including waiting and retrying", () => {
    expect(promptSrc).toContain('export type SpinePromptState = "idle" | "working" | "retrying" | "waiting" | "stop"')
    expect(promptSrc).toContain("state: () => SpinePromptState")
  })
})
