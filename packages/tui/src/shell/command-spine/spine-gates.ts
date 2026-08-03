import type { PermissionRequest, QuestionInfo, QuestionRequest } from "@arcana/sdk/v2"
import type { SpineEntry } from "./spine-types"
import { SPINE_GLYPH } from "./spine-types"

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
}

function questionInfo(value: unknown): QuestionInfo | undefined {
  const record = asRecord(value)
  const question = stringValue(record?.question)
  const header = stringValue(record?.header)
  if (!record || !question || !header) return undefined
  return value as QuestionInfo
}

function permissionRequest(value: unknown): PermissionRequest | undefined {
  const record = asRecord(value)
  const id = stringValue(record?.id)
  const sessionID = stringValue(record?.sessionID)
  const permission = stringValue(record?.permission)
  if (!record || !id || !sessionID || !permission) return undefined
  return value as PermissionRequest
}

function questionRequest(value: unknown): QuestionRequest | undefined {
  const record = asRecord(value)
  const id = stringValue(record?.id)
  const sessionID = stringValue(record?.sessionID)
  const questions = Array.isArray(record?.questions) ? record.questions.map(questionInfo).filter(Boolean) : []
  if (!record || !id || !sessionID || questions.length === 0) return undefined
  return value as QuestionRequest
}

function permissionSummary(request: PermissionRequest) {
  const subject =
    request.permission === "edit"
      ? "Edit approval required"
      : request.permission === "read"
        ? "Read approval required"
        : `${request.permission} approval required`
  const firstPattern = request.patterns.find((pattern) => pattern && pattern !== "*")
  return firstPattern ? `${subject}: ${firstPattern}` : subject
}

function permissionBody(request: PermissionRequest) {
  const patterns = request.patterns.length ? request.patterns : ["*"]
  return [`Permission: ${request.permission}`, "Patterns:", ...patterns.map((pattern) => `- ${pattern}`)].join("\n")
}

function questionSummary(request: QuestionRequest) {
  const first = request.questions[0]
  if (!first) return "Question awaiting answer"
  return request.questions.length === 1 ? first.question : `${request.questions.length} questions awaiting answer`
}

function questionBody(request: QuestionRequest) {
  return request.questions
    .map((question, index) => {
      const options = question.options?.length
        ? [
            "Options:",
            ...question.options.map(
              (option) => `- ${option.label}${option.description ? ` — ${option.description}` : ""}`,
            ),
          ]
        : []
      return [`${index + 1}. ${question.header}`, question.question, ...options].join("\n")
    })
    .join("\n\n")
}

export function pendingGateEntries(input: {
  permissions: readonly unknown[]
  questions: readonly unknown[]
}): SpineEntry[] {
  const entries: SpineEntry[] = []

  for (const raw of input.permissions) {
    const request = permissionRequest(raw)
    if (!request) continue
    entries.push({
      id: `permission:${request.id}`,
      index: 0,
      elapsed: "",
      kind: "approve",
      label: "approve",
      actor: "operator",
      glyph: SPINE_GLYPH.approve,
      summary: permissionSummary(request),
      body: permissionBody(request),
      bodyLabel: "approval gate",
      collapsible: true,
      expandedByDefault: true,
      source: { messageID: request.tool?.messageID ?? request.id, partID: request.tool?.callID, kind: "approve" },
    })
  }

  for (const raw of input.questions) {
    const request = questionRequest(raw)
    if (!request) continue
    entries.push({
      id: `question:${request.id}`,
      index: 0,
      elapsed: "",
      kind: "question",
      label: "question",
      actor: "operator",
      glyph: SPINE_GLYPH.question,
      summary: questionSummary(request),
      body: questionBody(request),
      bodyLabel: "question gate",
      collapsible: true,
      expandedByDefault: true,
      source: { messageID: request.tool?.messageID ?? request.id, partID: request.tool?.callID, kind: "question" },
    })
  }

  return entries
}

/**
 * F-27: spine navigation (j/k/up/down) stays enabled while a permission or
 * question gate is open. The gate owns the decision keys; the operator can
 * still move focus (and inspect with `v`) before deciding inside the gate.
 */
export function spineNavigationEnabled(input: {
  composerFocused: boolean
  hasRows: boolean
}): boolean {
  return !input.composerFocused && input.hasRows
}

/**
 * F-26: while any action gate is open, every spine Esc binding is inert (no
 * leave-composer, no close-inspector, no clear-selection). The gate owns all
 * keys until the request is decided or dismissed.
 */
export function spineEscInert(input: {
  gatesOpen: boolean
  submitting: boolean
}): boolean {
  return !input.gatesOpen && !input.submitting
}
