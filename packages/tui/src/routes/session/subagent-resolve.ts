/**
 * Resolve a subagent card's child session for dive navigation.
 *
 * Prefers the child whose title names the card's actor (`@<agent> subagent`),
 * then falls back to the newest child of the parent. Pure so the matching
 * policy is unit-testable; callers refresh the session list first.
 */
export type ChildSessionLike = {
  id: string
  parentID?: string | null
  title?: string | null
  time?: { created?: number }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function resolveChildSession(input: {
  actor?: string
  parentID: string
  sessions: readonly ChildSessionLike[]
}): string | undefined {
  const children = input.sessions.filter((session) => session.parentID === input.parentID)
  if (children.length === 0) return undefined
  const actor = input.actor
  const matched = actor
    ? children
        .filter((session) => new RegExp(`@${escapeRegExp(actor)}\\s+subagent`, "i").test(session.title ?? ""))
        .sort((a, b) => (b.time?.created ?? 0) - (a.time?.created ?? 0))[0]
    : undefined
  return matched?.id ?? [...children].sort((a, b) => (b.time?.created ?? 0) - (a.time?.created ?? 0))[0]?.id
}
