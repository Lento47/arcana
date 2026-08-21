import { describe, expect, test } from "bun:test"
import type { KeyEvent } from "@opentui/core"
import { isHoldKeyEvent, createVoiceHoldListener } from "../../src/voice/hold"
import type { Voice } from "../../src/config"
import type { VoiceOrchestrator, VoiceStatus } from "../../src/voice/orchestrator"

const baseVoice: Voice = {
  enabled: true,
  auto_submit: true,
  hold_key: "alt",
  recorder: {},
  asr: { backend: "whisper.cpp" },
  normalizer: { provider: "ollama", host: "http://localhost:11434", model: "superwhisper/s1-mini", prompt: "{text}" },
}

function keyEvent(fields: Partial<KeyEvent> & { name: string }): KeyEvent {
  const { name, ...rest } = fields
  return {
    name,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "",
    number: false,
    raw: "",
    eventType: "press",
    source: "kitty",
    ...rest,
  } as unknown as KeyEvent
}

function createMockKeyInput() {
  const handlers: { keypress: ((event: KeyEvent) => void)[]; keyrelease: ((event: KeyEvent) => void)[] } = {
    keypress: [],
    keyrelease: [],
  }
  return {
    on(event: "keypress" | "keyrelease", handler: (event: KeyEvent) => void) {
      handlers[event].push(handler)
    },
    off(event: "keypress" | "keyrelease", handler: (event: KeyEvent) => void) {
      handlers[event] = handlers[event].filter((h) => h !== handler)
    },
    press(event: KeyEvent) {
      for (const handler of handlers.keypress) handler(event)
    },
    release(event: KeyEvent) {
      for (const handler of handlers.keyrelease) handler(event)
    },
  }
}

function createMockOrchestrator(status: VoiceStatus = "idle"): VoiceOrchestrator {
  let currentStatus: VoiceStatus = status
  return {
    status: () => currentStatus,
    error: () => null,
    start: async () => {
      currentStatus = "recording"
    },
    stop: async () => {
      currentStatus = "idle"
    },
    cancel: () => {
      currentStatus = "idle"
    },
  }
}

function attach(input: {
  keyInput: ReturnType<typeof createMockKeyInput>
  orchestrator: VoiceOrchestrator
  config?: () => Voice
  altKeyDown?: () => boolean
}) {
  return createVoiceHoldListener({
    renderer: { keyInput: input.keyInput },
    config: input.config ?? (() => baseVoice),
    orchestrator: input.orchestrator,
    altKeyDown: input.altKeyDown ?? (() => false),
  })
}

test("isHoldKeyEvent matches alt variants", () => {
  expect(isHoldKeyEvent({ ...baseVoice, hold_key: "alt" }, keyEvent({ name: "leftalt" }))).toBe(true)
  expect(isHoldKeyEvent({ ...baseVoice, hold_key: "alt" }, keyEvent({ name: "rightalt" }))).toBe(true)
  expect(isHoldKeyEvent({ ...baseVoice, hold_key: "alt" }, keyEvent({ name: "left-alt" }))).toBe(true)
  expect(isHoldKeyEvent({ ...baseVoice, hold_key: "alt" }, keyEvent({ name: "alt" }))).toBe(true)
  expect(isHoldKeyEvent({ ...baseVoice, hold_key: "alt" }, keyEvent({ name: "x" }))).toBe(false)
  expect(isHoldKeyEvent({ ...baseVoice, hold_key: "leftalt" }, keyEvent({ name: "leftalt" }))).toBe(true)
  expect(isHoldKeyEvent({ ...baseVoice, hold_key: "leftalt" }, keyEvent({ name: "rightalt" }))).toBe(false)
})

describe("hold_delay_ms (deliberate push-to-talk gate)", () => {
  function countingOrchestrator() {
    let starts = 0
    let currentStatus: VoiceStatus = "idle"
    return {
      status: () => currentStatus,
      error: () => null,
      start: async () => {
        starts++
        currentStatus = "recording"
      },
      stop: async () => {
        currentStatus = "idle"
      },
      cancel: () => {
        currentStatus = "idle"
      },
      calls: () => starts,
    }
  }

  const delayedVoice: Voice = { ...baseVoice, hold_delay_ms: 60 }

  test("mic does not activate before the delay elapses", async () => {
    const keyInput = createMockKeyInput()
    const orchestrator = countingOrchestrator()
    const stop = attach({ keyInput, orchestrator, config: () => delayedVoice })

    keyInput.press(keyEvent({ name: "leftalt" }))
    await Bun.sleep(20)
    expect(orchestrator.calls()).toBe(0)
    await Bun.sleep(70)
    expect(orchestrator.calls()).toBe(1)
    expect(orchestrator.status()).toBe("recording")
    stop()
  })

  test("release inside the window cancels activation entirely", async () => {
    const keyInput = createMockKeyInput()
    const orchestrator = countingOrchestrator()
    const stop = attach({ keyInput, orchestrator, config: () => delayedVoice })

    keyInput.press(keyEvent({ name: "leftalt" }))
    await Bun.sleep(15)
    keyInput.release(keyEvent({ name: "leftalt", eventType: "release" }))
    await Bun.sleep(80)
    expect(orchestrator.calls()).toBe(0)
    expect(orchestrator.status()).toBe("idle")
    stop()
  })

  test("modifier combo inside the window cancels activation", async () => {
    const keyInput = createMockKeyInput()
    const orchestrator = countingOrchestrator()
    const stop = attach({ keyInput, orchestrator, config: () => delayedVoice })

    keyInput.press(keyEvent({ name: "leftalt" }))
    keyInput.press(keyEvent({ name: "x" }))
    await Bun.sleep(90)
    expect(orchestrator.calls()).toBe(0)
    stop()
  })

  test("delay 0 keeps the immediate legacy behavior", async () => {
    const keyInput = createMockKeyInput()
    const orchestrator = countingOrchestrator()
    const stop = attach({ keyInput, orchestrator, config: () => ({ ...baseVoice, hold_delay_ms: 0 }) })

    keyInput.press(keyEvent({ name: "leftalt" }))
    expect(orchestrator.calls()).toBe(1)
    stop()
  })
})

test("a second alt press after hold starts also stops when no release event arrives", async () => {
  const keyInput = createMockKeyInput()
  const orchestrator = createMockOrchestrator()
  const stop = attach({ keyInput, orchestrator })

  keyInput.press(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("recording")
  await new Promise((resolve) => setTimeout(resolve, 450))
  keyInput.press(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("idle")
  stop()
})

test("alt auto-repeat does not stop a hold in progress", async () => {
  const keyInput = createMockKeyInput()
  const orchestrator = createMockOrchestrator()
  const stop = attach({ keyInput, orchestrator })

  keyInput.press(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("recording")
  await new Promise((resolve) => setTimeout(resolve, 450))
  keyInput.press(keyEvent({ name: "leftalt", eventType: "repeat", repeated: true }))
  keyInput.press(keyEvent({ name: "leftalt", eventType: "repeat", repeated: true }))
  expect(orchestrator.status()).toBe("recording")
  keyInput.release(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("idle")
  stop()
})

test("pressing alt starts voice immediately and releasing stops it", () => {
  const keyInput = createMockKeyInput()
  const orchestrator = createMockOrchestrator()
  const stop = attach({ keyInput, orchestrator })

  expect(orchestrator.status()).toBe("idle")
  keyInput.press(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("recording")
  keyInput.release(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("idle")
  stop()
})

test("pressing another key while alt is held cancels push-to-talk", () => {
  const keyInput = createMockKeyInput()
  const orchestrator = createMockOrchestrator()
  const stop = attach({ keyInput, orchestrator })

  keyInput.press(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("recording")
  keyInput.press(keyEvent({ name: "x", option: true }))
  expect(orchestrator.status()).toBe("idle")
  keyInput.release(keyEvent({ name: "x", option: true }))
  keyInput.release(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("idle")
  stop()
})

test("disabled voice ignores alt press", () => {
  const keyInput = createMockKeyInput()
  const orchestrator = createMockOrchestrator()
  const stop = attach({
    keyInput,
    orchestrator,
    config: () => ({ ...baseVoice, enabled: false }),
  })

  keyInput.press(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("idle")
  keyInput.release(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("idle")
  stop()
})

test("alt release does not stop a recording started by toggle", () => {
  const keyInput = createMockKeyInput()
  const orchestrator = createMockOrchestrator("recording")
  const stop = attach({ keyInput, orchestrator })

  keyInput.press(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("recording")
  keyInput.release(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("recording")
  stop()
})

test("ghost alt release is ignored while the physical key is still down", async () => {
  const keyInput = createMockKeyInput()
  const orchestrator = createMockOrchestrator()
  let altDown = false
  const stop = attach({ keyInput, orchestrator, altKeyDown: () => altDown })

  altDown = true
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(orchestrator.status()).toBe("recording")
  keyInput.release(keyEvent({ name: "leftalt" }))
  expect(orchestrator.status()).toBe("recording")
  altDown = false
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(orchestrator.status()).toBe("idle")
  stop()
})

test("physical alt poll starts and stops hold when the terminal omits key events", async () => {
  const keyInput = createMockKeyInput()
  const orchestrator = createMockOrchestrator()
  let altDown = false
  const stop = attach({ keyInput, orchestrator, altKeyDown: () => altDown })

  altDown = true
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(orchestrator.status()).toBe("recording")
  altDown = false
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(orchestrator.status()).toBe("idle")
  stop()
})
