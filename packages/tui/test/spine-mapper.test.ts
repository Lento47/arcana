import { describe, expect, test } from "bun:test"
import { messagesToSpineEntries } from "../src/shell/command-spine/spine-mapper"
import type { Message, Part } from "@arcana/sdk/v2"

function partsLookup(parts: Part[]): (id: string) => Part[] {
  const map = new Map<string, Part[]>()
  for (const p of parts) {
    const arr = map.get(p.messageID) ?? []
    arr.push(p)
    map.set(p.messageID, arr)
  }
  return (id: string) => map.get(id) ?? []
}

function makeUserMessage(id: string, text: string): { messages: Message[]; parts: Part[] } {
  const msg: Message = {
    id,
    sessionID: "sess-1",
    role: "user",
    time: { created: 1000 },
    agent: "default",
    model: { providerID: "test", modelID: "test" },
  } as Message
  const part: Part = {
    id: `${id}-text-0`,
    sessionID: "sess-1",
    messageID: id,
    type: "text",
    text,
  } as Part
  return { messages: [msg], parts: [part] }
}

function makeAssistantMessage(
  id: string,
  overrides: { finish?: string; completed?: number } = {},
): {
  messages: Message[]
  parts: Part[]
} {
  const msg: Message = {
    id,
    sessionID: "sess-1",
    role: "assistant",
    time: { created: 1000, completed: overrides.completed },
    parentID: "parent-0",
    modelID: "test-model",
    providerID: "test-provider",
    mode: "default",
    agent: "default",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    finish: overrides.finish,
  } as Message
  return { messages: [msg], parts: [] }
}

// ---------- visual check 1: ask ----------

describe("user messages", () => {
  test("single user text becomes one ask entry", () => {
    const { messages, parts } = makeUserMessage("u1", "Hello, can you help me?")
    const result = messagesToSpineEntries({ messages, getParts: partsLookup(parts), assistantDuration: new Map() })

    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe("ask")
    expect(result[0]!.id).toBe("u1:ask")
    expect(result[0]!.summary).toContain("Hello")
    expect(result[0]!.glyph).toBe("◆")
  })

  test("user message truncated at 120 chars", () => {
    const long = "x".repeat(200)
    const { messages, parts } = makeUserMessage("u2", long)
    const result = messagesToSpineEntries({ messages, getParts: partsLookup(parts), assistantDuration: new Map() })

    expect(result[0]!.summary).toBe("x".repeat(120) + "…")
  })
})

// ---------- visual check 2: plan / ok ----------

describe("assistant text becomes plan/ok correctly", () => {
  test("text before tool becomes plan entry", () => {
    const { messages: msgs, parts } = makeAssistantMessage("a1")
    const msg = msgs[0]!
    parts.push({
      id: "p-text", sessionID: "sess-1", messageID: msg.id,
      type: "text", text: "Let me check the file",
    } as Part)
    parts.push({
      id: "p-tool", sessionID: "sess-1", messageID: msg.id,
      type: "tool", callID: "c1", tool: "read",
      state: { status: "completed", input: { filePath: "foo.rs" }, output: "fn main() {}", title: "read", metadata: {}, time: { start: 1000, end: 2000 } },
    } as Part)
    parts.push({
      id: "p-text2", sessionID: "sess-1", messageID: msg.id,
      type: "text", text: "I found the issue",
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    expect(result).toHaveLength(3)
    expect(result[0]!.kind).toBe("plan")
    expect(result[0]!.summary).toContain("Let me check")
    expect(result[1]!.kind).toBe("inspect")
    expect(result[2]!.kind).toBe("ok")
    expect(result[2]!.summary).toContain("I found the issue")
  })

  test("only text without tools returns plan entry only (no ok)", () => {
    const { messages: msgs, parts } = makeAssistantMessage("a2")
    parts.push({
      id: "p-text", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "text", text: "Here is a summary",
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe("plan")
  })

  test("trailing ok added when tool succeeds and no text after tool", () => {
    const { messages: msgs, parts } = makeAssistantMessage("a3")
    parts.push({
      id: "p-tool", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "tool", callID: "c1", tool: "bash",
      state: { status: "completed", input: { command: "echo hi" }, output: "hi", title: "bash", metadata: {}, time: { start: 1000, end: 1500 } },
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    expect(result).toHaveLength(2)
    expect(result[0]!.kind).toBe("run")
    expect(result[1]!.kind).toBe("ok")
    expect(result[1]!.id).toContain("ok")
    expect(result[1]!.summary).toBe("")
  })

  test("no trailing ok when no tools existed", () => {
    const { messages: msgs, parts } = makeAssistantMessage("a4")
    parts.push({
      id: "p-text", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "text", text: "Just some text",
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    const okEntries = result.filter((e) => e.kind === "ok")
    expect(okEntries).toHaveLength(0)
  })
})

// ---------- visual check 3: inspect ----------

describe("inspect entries", () => {
  test.each(["read", "glob", "grep", "search", "web_search", "web_fetch"])(
    "%s tool produces inspect kind",
    (tool) => {
      const { messages: msgs, parts } = makeAssistantMessage("i1")
      parts.push({
        id: `p-${tool}`, sessionID: "sess-1", messageID: msgs[0]!.id,
        type: "tool", callID: "c1", tool,
        state: { status: "completed", input: { [tool === "read" ? "filePath" : "pattern"]: "test.txt" }, output: "content", title: tool, metadata: {}, time: { start: 1000, end: 1500 } },
      } as Part)

      const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })
      const entry = result.find((e) => e.id.endsWith(`:inspect`))

      expect(entry).toBeDefined()
      expect(entry!.kind).toBe("inspect")
      expect(entry!.glyph).toBe("◈")
      expect(entry!.receipt?.status).toBe("ok")
    },
  )
})

// ---------- visual check 4: think / hidden ----------

describe("hidden think entries", () => {
  test("reasoning part produces think entry with hidden: true", () => {
    const { messages: msgs, parts } = makeAssistantMessage("t1")
    parts.push({
      id: "p-reason", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "reasoning",
      text: "I need to think step by step...",
      time: { start: 100 },
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe("think")
    expect(result[0]!.hidden).toBe(true)
    expect(result[0]!.id).toContain(":think")
  })
})

// ---------- visual check 5: fail ----------

describe("failed tools become fail entries", () => {
  test("tool with error state gets receipt status fail", () => {
    const { messages: msgs, parts } = makeAssistantMessage("f1")
    parts.push({
      id: "p-fail", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "tool", callID: "c1", tool: "bash",
      state: { status: "error", input: { command: "cargo build" }, error: "error[E0308] mismatched types", metadata: {}, time: { start: 1000, end: 1500 } },
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe("run")
    expect(result[0]!.receipt?.status).toBe("fail")
    expect(result[0]!.receipt?.command).toContain("error[E0308]")
  })
})

// ---------- visual check 6: no trailing ok after fail ----------

describe("no trailing ok after failed tools", () => {
  test("trailing ok suppressed when tool failed", () => {
    const { messages: msgs, parts } = makeAssistantMessage("nf1", { finish: "stop" })
    parts.push({
      id: "p-fail", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "tool", callID: "c1", tool: "bash",
      state: { status: "error", input: { command: "cargo build" }, error: "error[E0308]", metadata: {}, time: { start: 1000, end: 1500 } },
    } as Part)
    parts.push({
      id: "p-text", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "text", text: "There was an error",
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    const okEntries = result.filter((e) => e.kind === "ok")
    expect(okEntries).toHaveLength(1)
    expect(okEntries[0]!.summary).toContain("There was an error")
    const trailingOk = result.find((e) => e.id === "nf1:ok")
    expect(trailingOk).toBeUndefined()
  })

  test("trailing ok suppressed when finish is error", () => {
    const { messages: msgs, parts } = makeAssistantMessage("nf2", { finish: "error" })
    parts.push({
      id: "p-tool", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "tool", callID: "c1", tool: "read",
      state: { status: "completed", input: { filePath: "test.txt" }, output: "content", title: "read", metadata: {}, time: { start: 1000, end: 1500 } },
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    const okEntries = result.filter((e) => e.kind === "ok")
    expect(okEntries).toHaveLength(0)
  })

  test("trailing ok suppressed when finish is content-filter", () => {
    const { messages: msgs, parts } = makeAssistantMessage("nf3", { finish: "content-filter" })
    parts.push({
      id: "p-tool", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "tool", callID: "c1", tool: "bash",
      state: { status: "completed", input: { command: "echo hi" }, output: "hi", title: "bash", metadata: {}, time: { start: 1000, end: 1500 } },
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    const okEntries = result.filter((e) => e.kind === "ok")
    expect(okEntries).toHaveLength(0)
  })
})

// ---------- visual check 7: empty session ----------

describe("empty session", () => {
  test("no messages returns empty entries", () => {
    const result = messagesToSpineEntries({ messages: [], getParts: () => [], assistantDuration: new Map() })
    expect(result).toEqual([])
  })
})

// ---------- edge cases ----------

describe("edge cases", () => {
  test("unknown tool name safely degrades to inspect", () => {
    const { messages: msgs, parts } = makeAssistantMessage("e1")
    parts.push({
      id: "p-tool", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "tool", callID: "c1", tool: "custom_fetch_data",
      state: { status: "completed", input: { url: "https://example.com" }, output: "data", title: "fetch", metadata: {}, time: { start: 1000, end: 1500 } },
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })
    expect(result[0]!.kind).toBe("inspect")
  })

  test("ignored text part does not create a plan entry", () => {
    const { messages: msgs, parts } = makeAssistantMessage("e2")
    parts.push({
      id: "p-ignored", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "text", text: "internal thought", ignored: true,
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    const planEntries = result.filter((e) => e.kind === "plan")
    expect(planEntries).toHaveLength(0)
  })

  test("synthetic text part does not create a plan entry", () => {
    const { messages: msgs, parts } = makeAssistantMessage("e3")
    parts.push({
      id: "p-synth", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "text", text: "Tool completed successfully", synthetic: true,
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })

    const planEntries = result.filter((e) => e.kind === "plan")
    expect(planEntries).toHaveLength(0)
  })

  test("empty text part does not create a plan entry", () => {
    const { messages: msgs, parts } = makeAssistantMessage("e4")
    parts.push({
      id: "p-empty", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "text", text: "   ",
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })
    expect(result).toHaveLength(0)
  })

  test("patch part produces patch entry with file info", () => {
    const { messages: msgs, parts } = makeAssistantMessage("e5")
    parts.push({
      id: "p-patch", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "patch", hash: "abc123", files: ["src/main.rs", "src/lib.rs"],
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })
    expect(result[0]!.kind).toBe("patch")
    expect(result[0]!.summary).toContain("src/main.rs")
    expect(result[0]!.diff?.files).toContain("src/main.rs")
  })

  test("subtask part produces plan entry", () => {
    const { messages: msgs, parts } = makeAssistantMessage("e6")
    parts.push({
      id: "p-subtask", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "subtask", prompt: "fix the bug", description: "Debug the issue",
      agent: "debugger",
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })
    expect(result[0]!.kind).toBe("plan")
    expect(result[0]!.summary).toContain("Debug the issue")
  })

  test("agent part produces plan entry", () => {
    const { messages: msgs, parts } = makeAssistantMessage("e7")
    parts.push({
      id: "p-agent", sessionID: "sess-1", messageID: msgs[0]!.id,
      type: "agent", name: "reviewer",
    } as Part)

    const result = messagesToSpineEntries({ messages: msgs, getParts: partsLookup(parts), assistantDuration: new Map() })
    expect(result[0]!.kind).toBe("plan")
    expect(result[0]!.summary).toBe("agent: reviewer")
  })

  test("indexes start at 1 and are sequential", () => {
    const { messages: msgs1, parts: parts1 } = makeUserMessage("idx1", "Hello")
    const { messages: msgs2, parts: parts2 } = makeAssistantMessage("idx2")
    parts2.push({
      id: "p-tool", sessionID: "sess-1", messageID: msgs2[0]!.id,
      type: "tool", callID: "c1", tool: "bash",
      state: { status: "completed", input: { command: "ls" }, output: "src", title: "bash", metadata: {}, time: { start: 1000, end: 1500 } },
    } as Part)

    const allParts = [...parts1, ...parts2]
    const allMsgs: Message[] = [...msgs1, ...msgs2]
    const result = messagesToSpineEntries({ messages: allMsgs, getParts: partsLookup(allParts), assistantDuration: new Map() })

    expect(result).toHaveLength(3) // ask + run + ok
    expect(result[0]!.index).toBe(1)
    expect(result[1]!.index).toBe(2)
    expect(result[2]!.index).toBe(3)
  })
})
