import type { Part } from "@arcana/sdk/v2"

export function arcanaCommandFromPart(part: Part) {
  if (part.type !== "text") return
  const metadata = part.metadata
  if (!metadata || typeof metadata !== "object") return
  const arcana = metadata.arcana
  if (!arcana || typeof arcana !== "object") return
  const command = (arcana as { command?: unknown }).command
  return typeof command === "string" ? command : undefined
}

export function promptTextFromPart(part: Part) {
  if (part.type !== "text" || part.synthetic) return ""
  const command = arcanaCommandFromPart(part)
  return command ? `/${command} ${part.text}` : part.text
}
