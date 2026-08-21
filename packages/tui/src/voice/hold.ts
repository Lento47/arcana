import type { KeyEvent } from "@opentui/core"
import type { Voice } from "../config"
import type { VoiceOrchestrator } from "./orchestrator"
import path from "node:path"
import { appendFileSync } from "node:fs"
import { Global } from "@arcana/core/global"
import { win32AltKeyDown } from "../terminal-win32"

const ALT_KEY_NAMES = new Set([
  "alt",
  "leftalt",
  "rightalt",
  "left_alt",
  "right_alt",
  "left alt",
  "right alt",
  "left-alt",
  "right-alt",
  "option",
  "leftoption",
  "rightoption",
])

function normalizeKeyName(name: string | undefined): string {
  return (name ?? "").toLowerCase().replace(/[_\s-]/g, "")
}

export function isHoldKeyEvent(config: Voice, event: KeyEvent): boolean {
  const holdKey = config.hold_key ?? "alt"
  const name = normalizeKeyName(event.name)
  if (holdKey === "alt") {
    if (ALT_KEY_NAMES.has(event.name) || ALT_KEY_NAMES.has(name)) return true
    // Some terminals report a bare modifier as meta/option with an empty name.
    if (!name && (event.meta || event.option) && !event.ctrl && !event.shift) return true
    return false
  }
  return name === normalizeKeyName(holdKey) || event.name === holdKey
}

export function isRepeatKeyEvent(event: KeyEvent): boolean {
  return event.eventType === "repeat" || event.repeated === true
}

export type KeyInputLike = {
  on(event: "keypress", handler: (event: KeyEvent) => void): void
  off(event: "keypress", handler: (event: KeyEvent) => void): void
  on(event: "keyrelease", handler: (event: KeyEvent) => void): void
  off(event: "keyrelease", handler: (event: KeyEvent) => void): void
}

const VOICE_DEBUG_LOG = path.join(Global.Path.state, "voice-debug.log")
const WIN32_ALT_POLL_MS = 32

function voiceDebugLog(line: string) {
  if (process.env.ARCANA_DEBUG_VOICE !== "1" && process.env.ARCANA_DEBUG_VOICE !== "true") return
  const entry = `[${new Date().toISOString()}] ${line}\n`
  try {
    appendFileSync(VOICE_DEBUG_LOG, entry)
  } catch {
    // ignore
  }
  console.error(entry.trimEnd())
}

function logKeyEvent(event: KeyEvent, action: string) {
  voiceDebugLog(
    `${action}: name=${event.name} meta=${event.meta} ctrl=${event.ctrl} shift=${event.shift} eventType=${event.eventType} repeated=${event.repeated} source=${event.source}`,
  )
}

export function createVoiceHoldListener(input: {
  renderer: { keyInput: KeyInputLike }
  config: () => Voice
  orchestrator: VoiceOrchestrator
  onDisabledHint?: () => void
  /** Injected in tests. Production uses GetAsyncKeyState on Windows. */
  altKeyDown?: () => boolean
}): () => void {
  let recording = false
  let recordingStartedAt = 0
  let modifierWhileHeld = false
  let disabledHintShown = false
  let win32AltWasDown = false
  let pendingHoldTimer: ReturnType<typeof setTimeout> | undefined
  let pendingHoldArmed = false
  const pollAlt = input.altKeyDown ?? (process.platform === "win32" ? win32AltKeyDown : undefined)

  voiceDebugLog(`hold listener attached: keyInput=${typeof input.renderer.keyInput} enabled=${input.config().enabled}`)

  function cancelPendingHold() {
    pendingHoldArmed = false
    if (pendingHoldTimer) {
      clearTimeout(pendingHoldTimer)
      pendingHoldTimer = undefined
    }
  }

  /**
   * Push-to-talk activation gate. With `voice.hold_delay_ms` > 0 the key must
   * stay held for that long before the microphone starts — quick Alt-taps and
   * Alt+Tab combos never trigger capture. Release, a modifier combo, or the
   * key coming up inside the window cancels the pending hold.
   */
  function scheduleHold() {
    const delay = Math.max(0, input.config().hold_delay_ms ?? 0)
    if (delay <= 0) {
      beginHold()
      return
    }
    if (pendingHoldTimer) return
    pendingHoldArmed = true
    pendingHoldTimer = setTimeout(() => {
      pendingHoldTimer = undefined
      if (!pendingHoldArmed || recording) return
      pendingHoldArmed = false
      beginHold()
    }, delay)
  }

  function beginHold() {
    const status = input.orchestrator.status()
    if (status !== "idle" && status !== "error") return
    recording = true
    recordingStartedAt = Date.now()
    void input.orchestrator.start().catch((error: unknown) => {
      recording = false
      const message = error instanceof Error ? error.message : String(error)
      voiceDebugLog(`start failed: ${message}`)
    })
  }

  function endHold(kind: "stop" | "cancel") {
    if (!recording) return
    recording = false
    if (kind === "cancel") {
      input.orchestrator.cancel()
      return
    }
    if (input.orchestrator.status() === "recording") {
      void input.orchestrator.stop().catch((error: unknown) => {
        voiceDebugLog(`stop failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }

  function onKeyPress(event: KeyEvent) {
    logKeyEvent(event, "press")
    const cfg = input.config()
    if (!cfg.enabled) {
      voiceDebugLog("keypress ignored because voice is disabled")
      if (isHoldKeyEvent(cfg, event) && !disabledHintShown && input.onDisabledHint) {
        disabledHintShown = true
        input.onDisabledHint()
      }
      return
    }

    if (!isHoldKeyEvent(cfg, event)) {
      // Another key arrived while the push-to-talk key is down: treat it as a
      // modifier combo (e.g. Alt+X) and cancel the voice capture.
      if (recording) endHold("cancel")
      else cancelPendingHold()
      modifierWhileHeld = true
      return
    }

    event.preventDefault?.()
    event.stopPropagation?.()

    // Kitty/Windows Terminal emit auto-repeat as extra keypresses. Ignore them
    // so holding ALT does not stop capture after the first repeat (~400ms).
    if (isRepeatKeyEvent(event)) return

    if (recording) {
      // Physical Alt still down (Windows poll): ignore ghost extra presses.
      if (pollAlt?.()) return
      if (Date.now() - recordingStartedAt < 400) return
      endHold("stop")
      return
    }
    scheduleHold()
  }

  function onKeyRelease(event: KeyEvent) {
    logKeyEvent(event, "release")
    const cfg = input.config()
    if (!cfg.enabled) return
    if (!isHoldKeyEvent(cfg, event)) return

    // Released inside the hold-delay window: the tap was too short on purpose.
    if (pendingHoldArmed || pendingHoldTimer) {
      cancelPendingHold()
      modifierWhileHeld = false
      return
    }

    if (modifierWhileHeld) {
      modifierWhileHeld = false
      return
    }

    // Windows Terminal often emits a release while Alt is still physically
    // down. Trust the poll when it says the key is held.
    if (pollAlt?.()) return
    endHold("stop")
  }

  input.renderer.keyInput.on("keypress", onKeyPress)
  input.renderer.keyInput.on("keyrelease", onKeyRelease)

  voiceDebugLog("registered press/release handlers on keyInput")

  let pollTimer: ReturnType<typeof setInterval> | undefined
  if (pollAlt) {
    pollTimer = setInterval(() => {
      try {
        const cfg = input.config()
        if (!cfg.enabled || (cfg.hold_key ?? "alt") !== "alt") {
          win32AltWasDown = false
          return
        }
        const down = pollAlt()
        if (down && !win32AltWasDown) {
          win32AltWasDown = true
          if (!recording) scheduleHold()
        } else if (!down && win32AltWasDown) {
          win32AltWasDown = false
          if (pendingHoldArmed || pendingHoldTimer) {
            cancelPendingHold()
            modifierWhileHeld = false
            return
          }
          if (!modifierWhileHeld) endHold("stop")
          modifierWhileHeld = false
        }
      } catch (error) {
        voiceDebugLog(`alt poll failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }, WIN32_ALT_POLL_MS)
    pollTimer.unref?.()
  }

  return () => {
    input.renderer.keyInput.off("keypress", onKeyPress)
    input.renderer.keyInput.off("keyrelease", onKeyRelease)
    if (pollTimer) clearInterval(pollTimer)
    cancelPendingHold()
  }
}
