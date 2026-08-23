import { describe, expect, test } from "bun:test"
import {
  collapseWholeResponseReplay,
  normalizeTextDelta,
} from "../../src/session/text-stream-normalizer"

describe("text stream replay normalization", () => {
  test("turns cumulative snapshots into unseen suffixes", () => {
    expect(normalizeTextDelta("Hello", "Hello world")).toEqual({
      text: " world",
      removedCharacters: 5,
      reason: "cumulative_snapshot",
    })
  })

  test("removes exact and overlapping large replay chunks", () => {
    const block = "A sufficiently long provider response block."
    expect(normalizeTextDelta(block, block)).toMatchObject({
      text: "",
      reason: "exact_chunk_replay",
    })
    expect(normalizeTextDelta(`prefix ${block}`, `${block} suffix`)).toMatchObject({
      text: " suffix",
      reason: "overlapping_chunk_replay",
    })
  })

  test("collapses an exact whole-response replay", () => {
    const response = "Just here to help. What would you like me to do?"
    expect(collapseWholeResponseReplay(`${response}\n\n${response}`)).toMatchObject({
      text: response,
      reason: "whole_response_replay",
    })
  })

  test("preserves deliberate short repetition and repeated code lines", () => {
    expect(normalizeTextDelta("ha", "ha").text).toBe("ha")
    expect(collapseWholeResponseReplay("echo ok\necho ok").text).toBe("echo ok\necho ok")
  })
})
