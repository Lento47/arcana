import { describe, expect, test } from "bun:test"
import {
  PREDICTOR_MIN_CHARS,
  buildRequestBody,
  isPredictionFresh,
  nextPredictionChunk,
  postProcessPrediction,
  shouldPredict,
} from "../src/component/prompt/predictor/predict"

describe("shouldPredict", () => {
  const base = { textBeforeCursor: "how do I configure the cache layer", autocompleteVisible: false, disabled: false }

  test("accepts a long plain draft", () => {
    expect(shouldPredict(base)).toBe(true)
  })

  test("rejects when disabled", () => {
    expect(shouldPredict({ ...base, disabled: true })).toBe(false)
  })

  test("rejects while autocomplete panel is open", () => {
    expect(shouldPredict({ ...base, autocompleteVisible: true })).toBe(false)
  })

  test("rejects while session busy", () => {
    expect(shouldPredict({ ...base, busy: true })).toBe(false)
  })

  test(`rejects under ${PREDICTOR_MIN_CHARS} chars`, () => {
    expect(shouldPredict({ ...base, textBeforeCursor: "short text" })).toBe(false)
  })

  test("rejects slash commands", () => {
    expect(shouldPredict({ ...base, textBeforeCursor: "/contract implement the whole feature set" })).toBe(false)
  })
})

describe("buildRequestBody", () => {
  test("continuation prompt with deterministic sampling", () => {
    const body = buildRequestBody("draft so far", "m1", 24) as Record<string, any>
    expect(body.model).toBe("m1")
    expect(body.max_tokens).toBe(24)
    expect(body.stream).toBe(false)
    expect(body.stop).toEqual(["\n\n"])
    expect((body.messages as any[])[0].role).toBe("system")
    expect((body.messages as any[])[1].content).toBe("draft so far")
  })
})

describe("postProcessPrediction", () => {
  test("strips echoed tail of the typed prefix", () => {
    const out = postProcessPrediction("the deployment pipeline for staging.", "how do I configure the")
    expect(out).toBe("deployment pipeline for staging.")
  })

  test("cuts at the first sentence terminator", () => {
    const out = postProcessPrediction("deploy it now. Then verify the rollout", "please tell me how to")
    expect(out).toBe("deploy it now.")
  })

  test("collapses whitespace and drops leading newlines", () => {
    const out = postProcessPrediction("\n\nrun   the\nmigration", "steps to reproduce the bug are unclear so")
    expect(out).toBe("run the migration")
  })

  test("keeps unterminated output within one breath", () => {
    const out = postProcessPrediction("restart the daemon first", "if the engine hangs you should")
    expect(out).toBe("restart the daemon first")
  })

  test("rejects empty and tiny output", () => {
    expect(postProcessPrediction("", "some reasonably long prefix here")).toBeNull()
    expect(postProcessPrediction("   \n\n  ", "some reasonably long prefix here")).toBeNull()
    expect(postProcessPrediction("ok", "some reasonably long prefix here")).toBeNull()
  })
})

describe("nextPredictionChunk", () => {
  test("word-by-word with trailing space", () => {
    expect(nextPredictionChunk("deploy it now")).toEqual({ chunk: "deploy ", rest: "it now" })
    expect(nextPredictionChunk("it now")).toEqual({ chunk: "it ", rest: "now" })
  })

  test("final word without trailing space terminates", () => {
    expect(nextPredictionChunk("now")).toEqual({ chunk: "now", rest: "" })
  })

  test("empty input yields null", () => {
    expect(nextPredictionChunk("")).toBeNull()
    expect(nextPredictionChunk("   ")).toBeNull()
  })
})

describe("isPredictionFresh", () => {
  test("exact match required", () => {
    expect(isPredictionFresh("abc", "abc")).toBe(true)
    expect(isPredictionFresh("abc", "abcd")).toBe(false)
  })
})
