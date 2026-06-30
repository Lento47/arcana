export type TokenBudgetInput = {
  text?: string
  messages?: Array<{ role?: string; content: string }>
  maxContextTokens?: number
  reservedOutputTokens?: number
  targetUtilization?: number
}

export type TokenBudgetPlan = {
  estimatedInputTokens: number
  maxContextTokens: number
  reservedOutputTokens: number
  availableInputTokens: number
  utilization: number
  status: "under_budget" | "near_limit" | "over_budget"
  recommendations: string[]
}

export type SemanticCompressionInput = {
  text: string
  targetRatio?: number
  preserveCodeBlocks?: boolean
}

export type SemanticCompressionResult = {
  originalText: string
  compressedText: string
  originalEstimatedTokens: number
  compressedEstimatedTokens: number
  estimatedSavingsTokens: number
  estimatedSavingsRatio: number
  changes: string[]
}

const DEFAULT_CONTEXT = 128_000
const DEFAULT_OUTPUT = 4_096

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

// Per-kind token weights. Code blocks and structured tool outputs are denser
// (fewer tokens per char on average), while natural language is sparser.
const CODE_BLOCK_WEIGHT = 0.22
const STRUCTURED_WEIGHT = 0.30
const NATURAL_WEIGHT = 0.35
const MIN_ESTIMATE = 1

function splitBlocks(text: string): Array<{ kind: "code" | "structured" | "natural"; value: string }> {
  const parts: Array<{ kind: "code" | "structured" | "structured" | "natural"; value: string }> = []
  const codeRe = /```[\s\S]*?```/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = codeRe.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ kind: "natural", value: text.slice(last, match.index) })
    }
    parts.push({ kind: "code", value: match[0] ?? "" })
    last = match.index + (match[0]?.length ?? 0)
  }
  if (last < text.length) parts.push({ kind: "natural", value: text.slice(last) })
  return parts
}

function looksStructured(text: string): boolean {
  // Heuristic for JSON, stack traces, logs, CSV-like tabular output.
  const lineCount = text.split("\n").filter(Boolean).length
  if (lineCount < 2) return false
  const structuredMarkers =
    (/^\s*[\{\[]/.test(text) && /[\}\]]/.test(text)) ||
    /^\s*\w+\s*[|:]/.test(text) ||
    /^\s*at\s+/.test(text) ||
    /^\s*\d{4}-\d{2}-\d{2}T/.test(text)
  return structuredMarkers
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  const blocks = splitBlocks(text)
  let total = 0
  for (const block of blocks) {
    const weight = block.kind === "code" ? CODE_BLOCK_WEIGHT : looksStructured(block.value) ? STRUCTURED_WEIGHT : NATURAL_WEIGHT
    const chars = block.value.length
    const words = block.value.trim().split(/\s+/).filter(Boolean).length
    total += Math.max(MIN_ESTIMATE, Math.ceil(chars * weight), Math.ceil(words * 1.35))
  }
  return total
}

function getInputText(input: TokenBudgetInput): string {
  const messageText = input.messages?.map((message) => `${message.role ?? "unknown"}: ${message.content}`).join("\n")
  return [input.text, messageText].filter(Boolean).join("\n")
}

export function planTokenBudget(input: TokenBudgetInput): TokenBudgetPlan {
  const estimatedInputTokens = estimateTokens(getInputText(input))
  const maxContextTokens = nonNegativeInteger(input.maxContextTokens, DEFAULT_CONTEXT)
  const reservedOutputTokens = nonNegativeInteger(input.reservedOutputTokens, DEFAULT_OUTPUT)
  const availableInputTokens = Math.max(0, maxContextTokens - reservedOutputTokens)
  const utilization = availableInputTokens === 0 ? 1 : Number((estimatedInputTokens / availableInputTokens).toFixed(4))
  const target = Math.max(0.01, Math.min(1, input.targetUtilization ?? 0.72))
  const recommendations: string[] = []

  if (utilization > 1) {
    recommendations.push("Input exceeds available context. Summarize history, rerank memory, and include only task-relevant files.")
    recommendations.push("Prefer citations, file paths, or line ranges over full pasted content when possible.")
  } else if (utilization >= target) {
    recommendations.push("Input is near the desired context budget. Compress repeated context and reserve room for tool outputs.")
  } else {
    recommendations.push("Input is within budget. Keep current context shape unless model latency or cost is a concern.")
  }

  if (reservedOutputTokens < 1024) recommendations.push("Reserved output budget is low; long code patches or reports may truncate.")
  if (input.messages && input.messages.length > 12) recommendations.push("Conversation has many turns; compact older turns into a short task-state summary.")

  return {
    estimatedInputTokens,
    maxContextTokens,
    reservedOutputTokens,
    availableInputTokens,
    utilization,
    status: utilization > 1 ? "over_budget" : utilization >= target ? "near_limit" : "under_budget",
    recommendations,
  }
}

function splitCodeBlocks(text: string): Array<{ kind: "code" | "text"; value: string }> {
  const parts: Array<{ kind: "code" | "text"; value: string }> = []
  const re = /```[\s\S]*?```/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push({ kind: "text", value: text.slice(last, match.index) })
    parts.push({ kind: "code", value: match[0] ?? "" })
    last = match.index + (match[0]?.length ?? 0)
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) })
  return parts
}

function compressPlainText(text: string, targetRatio: number): { text: string; changes: string[] } {
  const changes: string[] = []
  let out = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
  if (out !== text) changes.push("normalized whitespace")

  const lines = out.split("\n")
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const line of lines) {
    const key = line.trim().toLowerCase()
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    deduped.push(line)
  }
  if (deduped.length !== lines.length) changes.push("removed duplicate lines")
  out = deduped.join("\n")

  if (targetRatio < 0.75) {
    const filler = /^(please|can you|could you|i think|maybe|basically|kind of|sort of|just)\b/i
    const trimmed = out.split("\n").map((line) => line.replace(filler, "").trim()).join("\n")
    if (trimmed !== out) changes.push("removed low-signal filler phrasing")
    out = trimmed
  }

  return { text: out.trim(), changes }
}

export function compressSemantically(input: SemanticCompressionInput): SemanticCompressionResult {
  const targetRatio = Math.max(0.2, Math.min(1, input.targetRatio ?? 0.75))
  const original = input.text
  const parts = splitCodeBlocks(original)
  const changes: string[] = []
  const compressed = parts.map((part) => {
    if (part.kind === "code" && input.preserveCodeBlocks !== false) return part.value
    const result = compressPlainText(part.value, targetRatio)
    changes.push(...result.changes)
    return result.text
  }).join("\n")

  const originalEstimatedTokens = estimateTokens(original)
  const compressedEstimatedTokens = estimateTokens(compressed)
  const estimatedSavingsTokens = Math.max(0, originalEstimatedTokens - compressedEstimatedTokens)

  return {
    originalText: original,
    compressedText: compressed,
    originalEstimatedTokens,
    compressedEstimatedTokens,
    estimatedSavingsTokens,
    estimatedSavingsRatio: originalEstimatedTokens ? Number((estimatedSavingsTokens / originalEstimatedTokens).toFixed(4)) : 0,
    changes: [...new Set(changes)],
  }
}
