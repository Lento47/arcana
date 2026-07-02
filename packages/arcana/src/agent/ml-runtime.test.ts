import { describe, expect, test } from "bun:test"
import {
  appendMlPromptAddendum,
  buildMlRevisionMessages,
  evaluateMlFinalResponse,
  getLastUserRequest,
  getMlRuntimeModelOverrides,
  isMlRuntimeEnabled,
  prepareMlRuntime,
} from "./ml-runtime.js"
import type { AgentConfig, ChatMessage } from "./types.js"

const config: AgentConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  mlRuntime: true,
}

describe("agent ML runtime integration helpers", () => {
  test("runtime is opt-in by config", () => {
    expect(isMlRuntimeEnabled({ ...config, mlRuntime: true })).toBe(true)
    expect(isMlRuntimeEnabled({ ...config, mlRuntime: false })).toBe(false)
  })

  test("finds the last user request", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "second" },
    ]

    expect(getLastUserRequest(messages)).toBe("second")
  })

  test("inserts ML prompt addendum after the primary system message", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "avoid AI slop" },
    ]
    const next = appendMlPromptAddendum(messages, "ml-addendum")

    expect(next[0]).toEqual(messages[0])
    expect(next[1]).toEqual({ role: "system", content: "ml-addendum" })
    expect(next[2]).toEqual(messages[1])
  })

  test("prepares low-interference preflight state without disk persistence", () => {
    const state = prepareMlRuntime([{ role: "user", content: "avoid generic output and give the exact patch" }], config, false)

    expect(state.enabled).toBe(true)
    expect(state.preflight?.machine.allowPersistentWrite).toBe(false)
    expect(state.preflight?.promptAddendum).toContain("avoid generic output")
  })

  test("builds revision messages without exposing quality gate internals to final output", () => {
    const state = prepareMlRuntime([{ role: "user", content: "avoid generic output and give the exact patch" }], config, false)
    const postflight = evaluateMlFinalResponse(state, "Use best practices to build a robust solution.")
    const revisionMessages = buildMlRevisionMessages(state, "Use best practices to build a robust solution.", postflight?.revisionPrompt ?? "revise")

    expect(postflight?.shouldRevise).toBe(true)
    expect(revisionMessages).toHaveLength(2)
    expect(revisionMessages[0]?.role).toBe("system")
    expect(revisionMessages[1]?.role).toBe("user")
    expect(revisionMessages[1]?.content).toContain("Draft answer")
  })

  test("returns model overrides derived from the thinking plan", () => {
    const state = prepareMlRuntime(
      [{ role: "user", content: "thoroughly review this repo and verify each fix" }],
      config,
      false,
      ["read", "grep", "run_test", "edit"],
    )
    const overrides = getMlRuntimeModelOverrides(state)

    expect(state.enabled).toBe(true)
    expect(state.thinkingStyle).toBeDefined()
    expect(overrides.maxTokens).toBeDefined()
    expect(overrides.temperature).toBeDefined()
    expect(overrides.maxToolRounds).toBeDefined()
  })
})
