import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  approvalFactGroups,
  approvalGateFacts,
  chatCardChrome,
  codeBlockChrome,
  formatApprovalActionKeys,
  focusedEntryActionHint,
  insightHeaderChrome,
  listingEntryChrome,
  packChipRows,
  chipCellWidth,
  FACT_LABEL_WIDTH,
  promptBarState,
  selectionHintChrome,
  streamTextCue,
  taskRowChrome,
  thinkingRowChrome,
  toolCategoryLabel,
  toolChipModel,
  toolChipChrome,
} from "../src/shell/command-spine/spine-chrome"
import { classifyThinking } from "../src/context/thinking"
import { isStreamingExtension } from "../src/component/scramble"
import { pulseActive } from "../src/shell/command-spine/spine-prompt"

describe("toolChipChrome", () => {
  test("live inspect chip keeps identity and live cue", () => {
    const chip = toolChipChrome({ kind: "inspect", label: "search", streaming: true })
    expect(chip.label).toBe("search")
    expect(chip.status).toBe("live")
    expect(chip.cue).toBe("live")
    expect(chip.glyph).toBe("●")
  })

  test("completed run is done; fail is fail", () => {
    expect(toolChipChrome({ kind: "run", label: "bash" }).status).toBe("done")
    expect(toolChipChrome({ kind: "run", label: "bash" }).cue).toBe("")
    expect(toolChipChrome({ kind: "fail", label: "bash" }).status).toBe("fail")
    expect(toolChipChrome({ kind: "fail", label: "bash" }).cue).toBe("fail")
  })
})

describe("focusedEntryActionHint", () => {
  test("describes the shipped subagent split between open and preview", () => {
    expect(focusedEntryActionHint({
      layout: "wide",
      agent: true,
      hasSession: true,
      toggleable: true,
      expanded: false,
      hasDetails: true,
    })).toBe("enter open · space expand · o details · y copy")
  })

  test("prioritizes decision actions and trims optional actions by layout", () => {
    expect(focusedEntryActionHint({
      layout: "minimal",
      approval: true,
      canApprove: true,
      canDeny: true,
      toggleable: true,
      hasDetails: true,
    })).toBe("v inspect · a approve")
  })

  test("keeps activity review on the standard disclosure actions", () => {
    expect(focusedEntryActionHint({
      layout: "wide",
      toggleable: true,
      expanded: false,
    })).toBe("enter/space expand · y copy")
  })
})

describe("toolChipModel", () => {
  test("normalizes tool families without losing semantic identity", () => {
    expect(toolCategoryLabel("mcp__filesystem__read")).toBe("read")
    expect(toolCategoryLabel("server__grep")).toBe("search")
    expect(toolCategoryLabel("thread_list")).toBe("list")
    expect(toolCategoryLabel("write_file")).toBe("edit")
    expect(toolCategoryLabel("fix")).toBe("edit")
    expect(toolCategoryLabel("custom_operation")).toBe("tool")
  })

  test("keeps the lifecycle vocabulary stable across terminal states", () => {
    const queued = toolChipModel({
      kind: "inspect",
      label: "read",
      summary: "src/index.ts",
      receipt: { label: "read", status: "pending" },
    })
    const running = toolChipModel({ kind: "run", label: "run", streaming: true })
    const success = toolChipModel({
      kind: "inspect",
      label: "search",
      summary: "database",
      receipt: { label: "grep", status: "ok", summary: "✓ 4 matches" },
    })
    const failure = toolChipModel({
      kind: "run",
      label: "run",
      summary: "bun test",
      receipt: { label: "bash", status: "fail", command: "E1001: proof missing" },
    })
    const interrupted = toolChipModel({
      kind: "run",
      label: "run",
      receipt: { label: "bash", status: "interrupted", command: "Interrupted" },
    })

    expect(queued).toMatchObject({ lifecycle: "queued", glyph: "·", statusLabel: "queued" })
    expect(running).toMatchObject({ lifecycle: "running", glyph: "●", statusLabel: "running" })
    expect(success).toMatchObject({ lifecycle: "success", glyph: "✓", statusLabel: "success", outcome: "4 matches" })
    expect(toolChipModel({
      kind: "run",
      label: "run",
      receipt: { label: "test", status: "ok", stats: { passed: 12, failed: 0, duration: "1.2s" } },
    }).outcome).toBe("12 passed · 0 failed · 1.2s")
    expect(failure).toMatchObject({ lifecycle: "failure", glyph: "✗", statusLabel: "failed", outcome: "E1001: proof missing" })
    expect(interrupted).toMatchObject({ lifecycle: "interrupted", glyph: "!", statusLabel: "interrupted", outcome: "Interrupted" })
  })

  test("collapses multiline summaries into a single preview", () => {
    expect(toolChipModel({ kind: "inspect", summary: "first line\nsecond line" }).summary).toBe("first line second line")
  })
})

describe("thinkingRowChrome + classifyThinking", () => {
  test("streaming vs complete verbs and expand cue", () => {
    expect(thinkingRowChrome({ streaming: true }).verb).toBe("Thinking")
    expect(thinkingRowChrome({ streaming: true }).cue).toBe("live")
    expect(thinkingRowChrome({ streaming: true }).badge).toBe("")
    expect(thinkingRowChrome({ streaming: false, expanded: true }).verb).toBe("Thought")
    expect(thinkingRowChrome({ streaming: false }).badge).toBe("")
    expect(thinkingRowChrome({ expanded: false }).disclosure).toBe("▸")
    expect(thinkingRowChrome({ expanded: true }).disclosure).toBe("▾")
  })

  test("classifyThinking keeps title/body and live flag", () => {
    const live = classifyThinking("**Inspecting workflow**\n\nchecking hooks", true)
    expect(live.title).toBe("Inspecting workflow")
    expect(live.body).toContain("checking hooks")
    expect(live.streaming).toBe(true)
    expect(live.verb).toBe("Thinking")
    expect(live.hasBody).toBe(true)

    const done = classifyThinking("plain thought", false)
    expect(done.title).toBeNull()
    expect(done.body).toBe("plain thought")
    expect(done.verb).toBe("Thought")
    expect(done.cue).toBe("done")
  })
})

describe("streamTextCue + scramble streaming", () => {
  test("distinguishes live vs complete", () => {
    const live = streamTextCue(true)
    const done = streamTextCue(false)
    expect(live.live).toBe(true)
    expect(live.label).toBe("streaming")
    expect(live.badge).toBe("")
    expect(done.live).toBe(false)
    expect(done.label).toBe("complete")
    expect(done.badge).toBe("")
    expect(streamTextCue(undefined).live).toBe(false)
  })

  test("isStreamingExtension detects token appends", () => {
    expect(isStreamingExtension("Hello world", "Hello")).toBe(true)
    expect(isStreamingExtension("Hello", "")).toBe(false)
    expect(isStreamingExtension("Other", "Hello")).toBe(false)
  })
})

describe("approvalGateFacts", () => {
  test("pending snapshot keeps tool, risk, and approve/deny/inspect keys", () => {
    const facts = approvalGateFacts({
      tool: "write_file",
      risk: "HIGH",
      action: "filesystem.write",
      available: true,
    }, "wide")
    expect(facts.tool).toBe("write_file")
    expect(facts.risk).toBe("HIGH")
    expect(facts.action).toBe("filesystem.write")
    expect(facts.keys.map((k) => k.key)).toEqual(["a", "d", "v"])
    expect(facts.keys.map((k) => k.action)).toEqual(["approve once", "deny", "full inspection"])
    expect(formatApprovalActionKeys(facts)).toContain("[a] approve once")
    expect(formatApprovalActionKeys(facts)).toContain("[d] deny")
    expect(formatApprovalActionKeys(facts)).toContain("[v] full inspection")
  })

  test("deny key matches shipped command-spine a/d/v bindings", () => {
    const shellSrc = readFileSync(
      join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"),
      "utf8",
    )
    const facts = approvalGateFacts({ tool: "write_file", available: true })
    const deny = facts.keys.find((k) => k.action === "deny")
    expect(deny?.key).toBe("d")
    expect(shellSrc).toContain('key: "d"')
    expect(shellSrc).toContain("Deny approval")
    expect(shellSrc).not.toMatch(/key:\s*"x"/)
  })

  test("narrow layout shortens inspect label", () => {
    const facts = approvalGateFacts({ tool: "bash" }, "narrow")
    expect(facts.keys.find((k) => k.key === "v")?.action).toBe("inspect")
  })

  test("approval fact groups put tool/action in primary chips", () => {
    const groups = approvalFactGroups({
      tool: "write_file",
      action: "filesystem.write",
      contractRevision: 3,
      principal: "codex",
      expires: "4:00 PM",
    }, "wide")
    expect(groups.primary.map((row) => row.label)).toEqual(["tool", "action", "contract"])
    expect(groups.primary.find((row) => row.label === "tool")?.value).toBe("write_file")
    expect(groups.primary.find((row) => row.label === "contract")?.value).toBe("r3")
    expect(groups.meta.some((row) => row.label === "principal")).toBe(true)
    expect(groups.meta.some((row) => row.label === "expires")).toBe(true)
  })
})

describe("task / chat / prompt / code chrome", () => {
  test("task rows expose status and step count with handover cues", () => {
    const running = taskRowChrome({ streaming: true, childCount: 2, expanded: false })
    expect(running.kind).toBe("task")
    expect(running.status).toBe("running")
    expect(running.cue).toBe("delegated")
    expect(running.childHint).toBe("2 steps")
    expect(running.disclosure).toBe("▸")

    const done = taskRowChrome({ streaming: false, childCount: 3, expanded: true })
    expect(done.status).toBe("done")
    expect(done.cue).toBe("returned")
    expect(done.childHint).toBe("3 steps")
    expect(done.disclosure).toBe("▾")
  })

  test("listing entries split dir vs file chrome", () => {
    expect(listingEntryChrome("src/")).toEqual({ kind: "dir", name: "src", mark: "/" })
    expect(listingEntryChrome("readme.md")).toEqual({ kind: "file", name: "readme.md", mark: "" })
  })

  test("selection hint is derived from shipped copy/escape actions", () => {
    const hint = selectionHintChrome()
    expect(hint.copy).toBe("ctrl+c copy")
    expect(hint.clear).toBe("escape clear")
    expect(hint.hint).toContain("ctrl+c copy")
    expect(hint.hint).toContain("escape clear")
  })

  test("chat card live badge", () => {
    const live = chatCardChrome({ speaker: "arcana", streaming: true })
    expect(live.badge).toBe("")
    expect(live.role).toBe("assistant")
    expect(chatCardChrome({ speaker: "you", isUser: true }).role).toBe("you")
  })

  test("prompt bar state matches pulse gate", () => {
    expect(promptBarState("working")).toEqual({ pulse: true, label: "working", hint: "" })
    expect(promptBarState("idle").hint).toBe("")
    expect(promptBarState("idle").pulse).toBe(false)
    expect(promptBarState("stop").hint).toBe("halted")
    expect(pulseActive("working")).toBe(promptBarState("working").pulse)
    expect(pulseActive("idle")).toBe(promptBarState("idle").pulse)
  })

  test("insight header hides NONE severity", () => {
    expect(insightHeaderChrome({ title: "Scorecard", severity: "HIGH" })).toEqual({
      title: "Scorecard",
      severity: "HIGH",
      showSeverity: true,
    })
    expect(insightHeaderChrome({ title: "Table", severity: "NONE" }).showSeverity).toBe(false)
  })

  test("packChipRows wraps before overflowing the column", () => {
    const items = ["Authz pass", "Secrets warn", "Supply fail"]
    const packed = packChipRows(items, 20, (item) => chipCellWidth(item))
    expect(packed.length).toBeGreaterThan(1)
    expect(packed.flat()).toEqual(items)
    expect(FACT_LABEL_WIDTH).toBe(12)
  })

  test("code block header keeps language", () => {
    const chrome = codeBlockChrome({ bodyLabel: "file", filetype: "typescript", streaming: false })
    expect(chrome.header).toBe("typescript")
    expect(chrome.live).toBe(false)
    expect(codeBlockChrome({ bodyLabel: "diff" }).header).toBe("diff")
  })
})
