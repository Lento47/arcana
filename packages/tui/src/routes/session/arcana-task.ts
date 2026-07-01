import type { Part } from "@arcana/sdk/v2"

export type ArcanaTaskMetadata = {
  command: string
  risk?: string
}

export function arcanaTaskFromPart(part: Part): ArcanaTaskMetadata | undefined {
  if (part.type !== "text") return
  const metadata = part.metadata
  if (!metadata || typeof metadata !== "object") return
  const arcana = metadata.arcana
  if (!arcana || typeof arcana !== "object") return
  const command = (arcana as { command?: unknown; risk?: unknown }).command
  const risk = (arcana as { command?: unknown; risk?: unknown }).risk
  if (typeof command !== "string") return
  return {
    command,
    ...(typeof risk === "string" ? { risk } : {}),
  }
}

export function arcanaCommandFromPart(part: Part) {
  const task = arcanaTaskFromPart(part)
  const command = task?.command
  return typeof command === "string" ? command : undefined
}

export function promptTextFromPart(part: Part) {
  if (part.type !== "text" || part.synthetic) return ""
  const command = arcanaCommandFromPart(part)
  return command ? `/${command} ${part.text}` : part.text
}
