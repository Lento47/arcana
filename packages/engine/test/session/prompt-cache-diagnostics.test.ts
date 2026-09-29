import { describe, expect, test } from "bun:test"
import { detectPromptChange, promptHash, type PromptFingerprint } from "../../src/session/prompt"

function fingerprint(input: {
  system?: string[]
  tools?: string
  history?: string[]
}): PromptFingerprint {
  return {
    system: input.system ?? [],
    tools: input.tools ?? "tools",
    history: input.history ?? [],
  }
}

describe("prompt-change diagnostics (prefix-cache explanation)", () => {
  test("identical fingerprints report no change", () => {
    const value = fingerprint({ system: ["a", "b"], history: ["m1", "m2"] })
    expect(detectPromptChange(value, { ...value })).toEqual({
      changedSystem: [],
      systemLength: [2, 2],
      toolsChanged: false,
      historyChangedAt: -1,
      historyLength: [2, 2],
    })
  })

  test("reports which system block changed", () => {
    const previous = fingerprint({ system: ["a", "b", "c"] })
    const next = fingerprint({ system: ["a", "B", "c"] })
    expect(detectPromptChange(previous, next).changedSystem).toEqual([1])
  })

  test("reports a shrunk system block", () => {
    const previous = fingerprint({ system: ["a", "b"] })
    const next = fingerprint({ system: ["a"] })
    expect(detectPromptChange(previous, next).changedSystem).toEqual([1])
    expect(detectPromptChange(previous, next).systemLength).toEqual([2, 1])
  })

  test("reports tool-set changes", () => {
    expect(detectPromptChange(fingerprint({}), fingerprint({ tools: "other" })).toolsChanged).toBe(true)
  })

  test("reports the first changed historical message", () => {
    const previous = fingerprint({ history: ["m1", "m2", "m3"] })
    const next = fingerprint({ history: ["m1", "M2", "m3", "m4"] })
    const change = detectPromptChange(previous, next)
    expect(change.historyChangedAt).toBe(1)
    expect(change.historyLength).toEqual([3, 4])
  })

  test("appending new history does not count as a change", () => {
    const previous = fingerprint({ history: ["m1", "m2"] })
    const next = fingerprint({ history: ["m1", "m2", "m3"] })
    expect(detectPromptChange(previous, next).historyChangedAt).toBe(-1)
  })

  test("hashing is deterministic and content-sensitive", () => {
    expect(promptHash("hello")).toBe(promptHash("hello"))
    expect(promptHash("hello")).not.toBe(promptHash("hello!"))
  })
})
