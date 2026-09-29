import { describe, expect, test } from "bun:test"
import {
  PREDICTOR_MIN_CHARS,
  buildRequestBody,
  isPredictionFresh,
  isPrefixEcho,
  nextPredictionChunk,
  postProcessPrediction,
  shouldPredict,
  trimContext,
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
    // A ghost is one line: both paragraph and single newlines stop the model.
    expect(body.stop).toEqual(["\n\n", "\n"])
    expect((body.messages as any[])[0].role).toBe("system")
    expect((body.messages as any[])[0].content).toContain("inline autocomplete")
    expect((body.messages as any[]).at(-1).content).toBe("draft so far")
  })

  test("prior turns frame the draft as the operator's next message", () => {
    const body = buildRequestBody("and then run", "m1", 24, [
      { role: "user", content: "why is the predictor wrong" },
      { role: "assistant", content: "because it only saw the draft" },
    ]) as Record<string, any>
    const messages = body.messages as any[]
    expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"])
    expect(messages[1].content).toBe("why is the predictor wrong")
    expect(messages[2].content).toBe("because it only saw the draft")
    expect(messages[3].content).toBe("and then run")
  })
})

describe("trimContext", () => {
  const turns = Array.from({ length: 6 }, (_, index) => ({
    role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `turn ${index} ${"x".repeat(300)}`,
  }))

  test("keeps the most recent turns, oldest first", () => {
    const kept = trimContext(turns, { maxMessages: 3 })
    expect(kept).toHaveLength(3)
    expect(kept[0]!.content.startsWith("turn 3")).toBe(true)
    expect(kept[2]!.content.startsWith("turn 5")).toBe(true)
  })

  test("caps each message and the total budget", () => {
    const kept = trimContext(turns, { maxMessages: 3, charsPerMessage: 20, charsTotal: 45 })
    expect(kept.every((message) => message.content.length <= 20)).toBe(true)
    expect(kept.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(45)
  })

  test("zero turns disables context entirely", () => {
    expect(trimContext(turns, { maxMessages: 0 })).toEqual([])
  })

  test("blank messages are skipped and whitespace is collapsed", () => {
    const kept = trimContext([
      { role: "user", content: "   \n\n  " },
      { role: "user", content: "  hello \n  world  " },
    ])
    expect(kept).toEqual([{ role: "user", content: "hello world" }])
  })
})

describe("postProcessPrediction", () => {
  test("strips echoed tail of the typed prefix", () => {
    const out = postProcessPrediction("the deployment pipeline for staging.", "how do I configure the")
    expect(out).toBe("deployment pipeline for staging.")
  })

  test("strips an echo longer than the old 48-char window", () => {
    const prefix =
      "the predictor keeps guessing wrong because it only sees the draft text and nothing else about the session"
    const out = postProcessPrediction(`${prefix} so it invents a topic.`, prefix)
    expect(out).toBe("so it invents a topic.")
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

  test("unwraps a quoted continuation", () => {
    expect(postProcessPrediction('"restart the daemon"', "if the engine hangs you should")).toBe(
      "restart the daemon",
    )
  })

  test("rejects preambles, markdown blocks and restated drafts", () => {
    expect(postProcessPrediction("Sure! Restart the daemon", "if the engine hangs you")).toBeNull()
    expect(postProcessPrediction("I'm sorry, I cannot continue that", "if the engine hangs you")).toBeNull()
    expect(postProcessPrediction("- restart the daemon", "if the engine hangs you")).toBeNull()
    expect(postProcessPrediction("```sh\nrestart", "if the engine hangs you")).toBeNull()
    // Casing/punctuation variants of the draft's tail are still restatements.
    expect(postProcessPrediction("Deploy the redis cache", "then we deploy the redis")).toBeNull()
  })

  test("keeps the continuation that follows an echoed tail", () => {
    expect(postProcessPrediction("hangs you should restart the daemon", "if the engine hangs you should")).toBe(
      "restart the daemon",
    )
  })

  test("rejects a ghost that would run past one breath", () => {
    const rambling = `${"word ".repeat(40)}done.`
    expect(postProcessPrediction(rambling, "so the plan is to")).toBeNull()
  })

  test("rejects empty and tiny output", () => {
    expect(postProcessPrediction("", "some reasonably long prefix here")).toBeNull()
    expect(postProcessPrediction("   \n\n  ", "some reasonably long prefix here")).toBeNull()
    expect(postProcessPrediction("ok", "some reasonably long prefix here")).toBeNull()
  })
})

describe("isPrefixEcho", () => {
  test("flags a restated opening", () => {
    expect(isPrefixEcho("deploy the redis cluster", "then we deploy the redis")).toBe(true)
    expect(isPrefixEcho("deploy the staging cluster", "then we deploy the redis")).toBe(false)
  })

  test("ignores openings too short to be a restatement", () => {
    expect(isPrefixEcho("the redis", "then we deploy the redis")).toBe(false)
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
