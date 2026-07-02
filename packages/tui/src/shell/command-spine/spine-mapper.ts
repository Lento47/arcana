import type {
  Message,
  Part,
  ToolPart,
  TextPart,
  PatchPart,
} from "@arcana/sdk/v2"
import type { SpineEntry, SpineKind, SpineReceipt } from "./spine-types"

const INSPECT_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "search",
  "web_search",
  "web_fetch",
  "fetch",
  "list",
  "list_files",
  "directory_list",
  "file_search",
  "ripgrep",
  "find",
])

const PATCH_TOOLS = new Set([
  "edit",
  "write",
  "patch",
  "apply_patch",
  "create",
  "overwrite",
  "insert",
  "rename",
  "delete_file",
  "move_file",
  "copy_file",
])

const RUN_TOOLS = new Set(["bash", "shell", "exec", "run", "command", "terminal", "powershell"])

function toolToSpineKind(tool: string): SpineKind {
  if (RUN_TOOLS.has(tool)) return "run"
  if (PATCH_TOOLS.has(tool)) return "patch"
  if (INSPECT_TOOLS.has(tool)) return "inspect"

  const lower = tool.toLowerCase()
  if (lower.includes("search") || lower.includes("read") || lower.includes("fetch") || lower.includes("find") || lower.includes("list"))
    return "inspect"
  if (lower.includes("edit") || lower.includes("write") || lower.includes("patch"))
    return "patch"
  if (lower.includes("run") || lower.includes("exec") || lower.includes("shell") || lower.includes("bash") || lower.includes("cmd"))
    return "run"

  return "inspect"
}

function formatElapsed(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return ""

  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) {
    const s = ms / 1000
    return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
  }
  if (ms < 3600000) {
    const m = Math.floor(ms / 60000)
    const s = Math.round((ms % 60000) / 1000)
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function isTextRelevant(part: TextPart): boolean {
  if (part.ignored) return false
  if (part.synthetic) return false
  if (!part.text?.trim()) return false
  return true
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + "…"
}

function getRunSummary(part: ToolPart): string {
  const input = part.state.input as Record<string, unknown>
  const command = (input.command as string) ?? (input.cmd as string) ?? ""
  if (command) return command
  if (part.state.status === "running" && part.state.title) return part.state.title
  if (part.state.status === "completed" && part.state.title) return part.state.title
  return ""
}

function getPatchSummary(part: ToolPart): string {
  const input = part.state.input as Record<string, unknown>
  const filePath = (input.filePath as string) ?? (input.path as string) ?? (input.file as string) ?? ""
  const filePattern = (input.pattern as string) ?? ""
  return filePath || filePattern || ""
}

function getInspectSummary(part: ToolPart): string {
  const input = part.state.input as Record<string, unknown>
  const filePath = (input.filePath as string) ?? (input.path as string) ?? (input.file as string) ?? ""
  const pattern = (input.pattern as string) ?? (input.query as string) ?? (input.glob as string) ?? ""
  if (filePath) return filePath
  if (pattern) return pattern
  if (part.state.status === "running" && part.state.title) return part.state.title
  if (part.state.status === "completed" && part.state.title) return part.state.title
  return part.tool
}

function computeElapsed(
  assistantDuration: Map<string, number>,
  message: Message,
  toolPart?: ToolPart,
): string {
  if (message.role === "assistant") {
    const dur = assistantDuration.get(message.id)
    if (dur !== undefined) return formatElapsed(dur)
    if (message.time.completed) {
      return formatElapsed(message.time.completed - message.time.created)
    }
  }

  if (toolPart) {
    const state = toolPart.state
    if ("time" in state && state.time && "end" in state.time && state.time.end && "start" in state.time) {
      return formatElapsed(state.time.end - state.time.start)
    }
  }

  return ""
}

function toolStateToReceipt(tool: string, state: ToolPart["state"]): SpineReceipt | undefined {
  if (state.status === "pending") {
    return { label: tool, status: "pending" }
  }

  if (state.status === "running") {
    return { label: tool, status: "pending" }
  }

  if (state.status === "error") {
    const input = state.input as Record<string, unknown>
    const command = (input.command as string) ?? (input.cmd as string) ?? ""
    return {
      label: tool,
      command: command || state.error ? truncate(state.error, 80) : undefined,
      status: "fail",
    }
  }

  if (state.status === "completed") {
    const input = state.input as Record<string, unknown>
    const command = (input.command as string) ?? (input.cmd as string) ?? ""

    if (tool === "bash" || tool === "shell" || tool === "exec" || tool === "run") {
      return {
        label: tool,
        command: command || undefined,
        status: "ok",
      }
    }

    if (PATCH_TOOLS.has(tool)) {
      const metadata = state.metadata ?? (input.metadata as Record<string, unknown> | undefined) ?? {}
      const added = (metadata.added as number) ?? (metadata.insertions as number) ?? undefined
      const removed = (metadata.removed as number) ?? (metadata.deletions as number) ?? undefined
      if (added !== undefined || removed !== undefined) {
        return {
          label: tool,
          stats: { added, removed },
          status: "ok",
        }
      }
    }

    return {
      label: tool,
      command: command || undefined,
      status: "ok",
    }
  }

  return { label: tool, status: "pending" }
}

function userMessageToEntries(
  message: Message,
  parts: Part[],
  assistantDuration: Map<string, number>,
): SpineEntry[] {
  if (message.role !== "user") return []

  const textPart = parts.find((p): p is TextPart => p.type === "text" && isTextRelevant(p))
  const summary = textPart ? truncate(textPart.text) : (message.summary?.title ?? "")
  const elapsed = computeElapsed(assistantDuration, message)

  return [
    {
      id: `${message.id}:ask`,
      index: 0,
      elapsed,
      kind: "ask",
      glyph: "◆",
      summary: summary || "…",
    },
  ]
}

function toolPartToEntries(
  message: Message,
  part: ToolPart,
  partIndex: number,
): SpineEntry[] {
  const kind = toolToSpineKind(part.tool)
  const glyph = SPINE_GLYPH_MAP[kind] ?? "◈"
  const elapsed = computeElapsed(new Map(), message, part)
  const receipt = toolStateToReceipt(part.tool, part.state)
  const baseId = `${message.id}:${part.id || `tool-${partIndex}`}`

  let summary = ""
  let diff = undefined as SpineEntry["diff"]

  if (kind === "run") {
    summary = getRunSummary(part)
    if (!summary) {
      if (part.state.status === "completed") summary = truncate(part.state.output, 120)
      else if (part.state.status === "error") summary = truncate(part.state.error, 80)
      else summary = part.tool
    }
  }

  if (kind === "patch") {
    summary = getPatchSummary(part)
    if (!summary) summary = part.tool
  }

  if (kind === "inspect") {
    summary = getInspectSummary(part)
  }

  return [
    {
      id: `${baseId}:${kind}`,
      index: 0,
      elapsed,
      kind,
      glyph,
      summary,
      receipt,
      diff,
    },
  ]
}

function patchPartToEntry(
  message: Message,
  part: PatchPart,
): SpineEntry {
  const files = part.files.join(", ")
  return {
    id: `${message.id}:${part.id}:patch`,
    index: 0,
    elapsed: "",
    kind: "patch",
    glyph: "├",
    summary: files || "patch",
    diff: {
      files: files || `${part.files.length} files`,
      stats: "",
    },
  }
}

function makeOkEntry(message: Message): SpineEntry {
  return {
    id: `${message.id}:ok`,
    index: 0,
    elapsed: "",
    kind: "ok",
    glyph: "◎",
    summary: "",
  }
}

function makeThinkEntry(message: Message, partId: string): SpineEntry {
  return {
    id: `${message.id}:${partId}:think`,
    index: 0,
    elapsed: "",
    kind: "think",
    glyph: "?",
    summary: "reasoning hidden",
    hidden: true,
  }
}

function shouldAddTrailingOk(
  entries: SpineEntry[],
  message: Message,
): boolean {
  const messageEntries = entries.filter((e) => e.id.startsWith(message.id))

  if (messageEntries.length === 0) return false

  const hasToolEntry = messageEntries.some((e) =>
    e.kind === "run" || e.kind === "patch" || e.kind === "inspect",
  )
  if (!hasToolEntry) return false

  const hasPending = messageEntries.some((e) => e.receipt?.status === "pending")
  if (hasPending) return false

  const hasFailed = messageEntries.some((e) => e.receipt?.status === "fail")
  if (hasFailed) return false

  if ("finish" in message && message.finish) {
    if (message.finish === "error" || message.finish === "content-filter") return false
  }

  return true
}

function assistantMessagePartsToEntries(
  message: Message,
  parts: Part[],
  assistantDuration: Map<string, number>,
): SpineEntry[] {
  const entries: SpineEntry[] = []

  let sawTool = false
  let textBeforeTool: TextPart | undefined
  let textAfterTool: TextPart | undefined

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part.type === "reasoning") {
      entries.push(makeThinkEntry(message, part.id))
      continue
    }

    if (part.type === "text" && isTextRelevant(part)) {
      if (!sawTool) {
        textBeforeTool = part
      } else {
        textAfterTool = part
      }
      continue
    }

    if (part.type === "tool") {
      if (!sawTool) {
        sawTool = true
      }
      entries.push(...toolPartToEntries(message, part, i))
      continue
    }

    if (part.type === "patch") {
      if (!sawTool) {
        sawTool = true
      }
      entries.push(patchPartToEntry(message, part))
      continue
    }

    if (part.type === "subtask") {
      if (!sawTool) {
        sawTool = true
      }
      entries.push({
        id: `${message.id}:${part.id}:plan`,
        index: 0,
        elapsed: "",
        kind: "plan",
        glyph: "├",
        summary: truncate(part.description || part.prompt, 120),
      })
      continue
    }

    if (part.type === "agent") {
      if (!sawTool) {
        sawTool = true
      }
      entries.push({
        id: `${message.id}:${part.id}:plan`,
        index: 0,
        elapsed: "",
        kind: "plan",
        glyph: "├",
        summary: `agent: ${part.name}`,
      })
      continue
    }
  }

  const textEntries: SpineEntry[] = []

  if (textBeforeTool) {
    const elapsed = computeElapsed(assistantDuration, message)
    textEntries.push({
      id: `${message.id}:${textBeforeTool.id}:plan`,
      index: 0,
      elapsed,
      kind: "plan",
      glyph: "├",
      summary: truncate(textBeforeTool.text, 120),
    })
  }

  if (textAfterTool) {
    const elapsed = computeElapsed(assistantDuration, message)
    textEntries.push({
      id: `${message.id}:${textAfterTool.id}:ok`,
      index: 0,
      elapsed,
      kind: "ok",
      glyph: "◎",
      summary: truncate(textAfterTool.text, 120),
    })
  }

  if (!sawTool && textBeforeTool && !textAfterTool) {
    return textEntries
  }

  const merged: SpineEntry[] = []
  let textIdx = 0

  if (textIdx < textEntries.length && textEntries[textIdx].kind === "plan") {
    merged.push(textEntries[textIdx])
    textIdx++
  }

  for (const entry of entries) {
    if (entry.kind === "think") {
      merged.push(entry)
      continue
    }

    merged.push(entry)
  }

  while (textIdx < textEntries.length) {
    merged.push(textEntries[textIdx])
    textIdx++
  }

  if (!textAfterTool && shouldAddTrailingOk(merged, message)) {
    const okEntry = makeOkEntry(message)
    merged.push(okEntry)
  }

  return merged
}

function assignIndexes(entries: SpineEntry[], startIndex: number): SpineEntry[] {
  let idx = startIndex
  return entries.map((e) => ({ ...e, index: idx++ }))
}

export function messagesToSpineEntries(input: {
  messages: Message[]
  getParts: (messageId: string) => Part[]
  assistantDuration: Map<string, number>
}): SpineEntry[] {
  const { messages, getParts, assistantDuration } = input
  const allEntries: SpineEntry[] = []

  for (const message of messages) {
    const parts = getParts(message.id)

    if (message.role === "user") {
      allEntries.push(...userMessageToEntries(message, parts, assistantDuration))
      continue
    }

    if (message.role === "assistant") {
      allEntries.push(
        ...assistantMessagePartsToEntries(message, parts, assistantDuration),
      )
      continue
    }
  }

  return assignIndexes(allEntries, 1)
}

const SPINE_GLYPH_MAP: Record<string, string> = {
  ask: "◆",
  plan: "├",
  inspect: "◈",
  patch: "├",
  run: "▷",
  fail: "×",
  fix: "├",
  ok: "◎",
  think: "?",
}
