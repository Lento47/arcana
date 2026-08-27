/**
 * Warp terminal sidebar integration.
 *
 * Two-layer protocol matching Claude Code and Codex CLI:
 *
 * Layer 1 — OSC 0: Animated braille spinner in the terminal title.
 *   Works in all terminals (Warp, iTerm2, Windows Terminal, etc.).
 *
 * Layer 2 — OSC 777: Structured JSON events via warp://cli-agent protocol.
 *   Warp-specific; other terminals ignore silently.
 *
 * @see https://github.com/warpdotdev/Warp (CLI agent session handler)
 * @see https://pi.dev/packages/@capyup/pi-warp (reference implementation)
 */

import { SPINNER_FRAMES_BRAILLE } from "./spinner-style"

// ── Detection ──

const IS_WARP = process.env["TERM_PROGRAM"] === "WarpTerminal"

// ── OSC helpers ──

/** OSC 0 — set terminal window/tab title. */
function osc0(title: string): void {
  process.stdout.write(`\x1b]0;${title}\x07`)
}

/** OSC 777 — emit a Warp CLI agent protocol event. */
function osc777(payload: Record<string, unknown>): void {
  if (!IS_WARP) return
  try {
    const json = JSON.stringify(payload)
    process.stdout.write(`\x1b]777;notify;warp://cli-agent;${json}\x07`)
  } catch {
    // serialisation failure is non-fatal
  }
}

// ── Public API ──

export type WarpEvent =
  | "session_start"
  | "prompt_submit"
  | "tool_complete"
  | "stop"
  | "idle_prompt"

/**
 * Emit a structured event to Warp's sidebar.
 * No-op when not running inside Warp.
 */
export function emitWarpEvent(opts: {
  event: WarpEvent
  sessionID?: string
  cwd?: string
  query?: string
  response?: string
  toolName?: string
}): void {
  osc777({
    v: 1,
    agent: "arcana",
    event: opts.event,
    session_id: opts.sessionID,
    cwd: opts.cwd ?? process.cwd(),
    query: opts.query?.slice(0, 200),
    response: opts.response?.slice(0, 200),
    tool_name: opts.toolName,
  })
}

/**
 * Animated terminal title controller.
 *
 * Cycles braille spinner frames in the terminal title while the agent
 * is working. Stops on idle, shows ⚠ when blocked.
 *
 * Usage:
 *   const title = new AnimatedTitle("arcana")
 *   title.updateSession("fix the tests")
 *   title.start()      // ⠋ arcana | fix the tests
 *   title.blocked()    // ⚠ arcana | fix the tests
 *   title.stop()       // arcana | fix the tests
 *   title.dispose()    // cleanup
 */
export class AnimatedTitle {
  private appAbbr: string
  private sessionLabel = ""
  private timer: ReturnType<typeof setInterval> | null = null
  private frame = 0
  private state: "idle" | "working" | "blocked" = "idle"

  constructor(appAbbr: string) {
    this.appAbbr = appAbbr
  }

  /** Update the session portion of the title. */
  updateSession(label: string): void {
    this.sessionLabel = label
    if (this.state === "idle") this.paint()
  }

  /** Start the braille spinner animation. */
  start(): void {
    if (this.state === "working") return
    this.state = "working"
    this.stopTimer()
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES_BRAILLE.length
      this.paint()
    }, 100)
    this.paint()
  }

  /** Show blocked indicator (waiting for user input). */
  blocked(): void {
    this.state = "blocked"
    this.stopTimer()
    this.paint()
  }

  /** Stop animation, show static title. */
  stop(): void {
    this.state = "idle"
    this.stopTimer()
    this.paint()
  }

  /** Reset to bare app title (no session). */
  reset(): void {
    this.sessionLabel = ""
    this.stop()
  }

  /** Cleanup — stop timer, clear title. */
  dispose(): void {
    this.stopTimer()
    osc0("")
  }

  // ── Internal ──

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private paint(): void {
    const prefix = this.sessionLabel ? ` | ${this.sessionLabel}` : ""
    switch (this.state) {
      case "working": {
        const spinner = SPINNER_FRAMES_BRAILLE[this.frame] ?? "⠋"
        osc0(`${spinner} ${this.appAbbr}${prefix}`)
        break
      }
      case "blocked":
        osc0(`⚠ ${this.appAbbr}${prefix}`)
        break
      default:
        osc0(`${this.appAbbr}${prefix}`)
        break
    }
  }
}
