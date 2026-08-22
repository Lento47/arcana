import { expect, test } from "bun:test"
import { isVoiceUiActive, voiceStatusLabel, voiceWaveFrame } from "../../src/component/voice-wave"

test("voiceWaveFrame is a bar row of the requested width", () => {
  const frame = voiceWaveFrame(0, 12)
  expect(frame.length).toBe(12)
  expect([...frame].every((ch) => "▁▂▃▄▅▆▇".includes(ch))).toBe(true)
})

test("voiceWaveFrame advances across frames", () => {
  expect(voiceWaveFrame(0, 16)).not.toBe(voiceWaveFrame(4, 16))
})

test("isVoiceUiActive covers live pipeline stages", () => {
  expect(isVoiceUiActive("idle")).toBe(false)
  expect(isVoiceUiActive("error")).toBe(false)
  expect(isVoiceUiActive("recording")).toBe(true)
  expect(isVoiceUiActive("transcribing")).toBe(true)
  expect(isVoiceUiActive("normalizing")).toBe(true)
  expect(isVoiceUiActive("sending")).toBe(true)
})

test("voiceStatusLabel follows the lexicon stages", () => {
  expect(voiceStatusLabel("recording")).toBeTruthy()
  expect(voiceStatusLabel("transcribing")).not.toBe(voiceStatusLabel("recording"))
})
