/**
 * Session charter + proof chrome — decision terms and session health.
 * Contract is normative (what may happen). Proof is descriptive (what did).
 */

export type SessionCharterTone = "ok" | "warn" | "error" | "muted"

export type SessionCharterChip = {
  key: "contract" | "proof" | "governed"
  label: string
  tone: SessionCharterTone
}

export type SessionCharter = {
  contract: SessionCharterChip
  proof: SessionCharterChip
  summary: string
}

export type SessionCharterInput = {
  contractStatus?: string
  proofLevel?: string
  integrityStatus?: string
  traceHealth?: string
}

export function projectSessionCharter(input?: SessionCharterInput | null): SessionCharter | undefined {
  if (!input) return undefined
  const hasAny =
    Boolean(input.contractStatus)
    || Boolean(input.proofLevel)
    || Boolean(input.integrityStatus)
    || Boolean(input.traceHealth)
  if (!hasAny) return undefined

  const integrity = (input.integrityStatus ?? "UNVERIFIED").trim() || "UNVERIFIED"
  const level = (input.proofLevel ?? "P0").trim() || "P0"
  const contractStatus = (input.contractStatus ?? "none").trim() || "none"

  const proofTone: SessionCharterTone =
    integrity === "VALID" ? "ok" : integrity === "INVALID" ? "error" : "warn"
  const contractTone: SessionCharterTone =
    /satisf/i.test(contractStatus) ? "ok"
    : contractStatus === "none" ? "muted"
    : /fail|invalid|breach|unsatisf/i.test(contractStatus) ? "error"
    : "warn"

  return {
    contract: {
      key: "contract",
      label: contractStatus,
      tone: contractTone,
    },
    proof: {
      key: "proof",
      label: `${level} ${integrity.toLowerCase()}`,
      tone: proofTone,
    },
    summary: `${contractStatus} · ${level} ${integrity.toLowerCase()}`,
  }
}

export type HeaderStatusItem = {
  key: string
  label: string
  tone: SessionCharterTone
}

/** Tokens for the header status line — always joined with " | ", never concatenated. */
export function buildHeaderStatusItems(input: {
  live: string
  liveTone: SessionCharterTone
  charter?: SessionCharter
  proofFallback?: string
  governed?: SessionCharterChip
  pending?: number
}): HeaderStatusItem[] {
  const items: HeaderStatusItem[] = [{ key: "live", label: input.live, tone: input.liveTone }]
  if (input.charter) {
    items.push(input.charter.contract, input.charter.proof)
  } else if (input.proofFallback) {
    items.push({ key: "proof", label: input.proofFallback, tone: "warn" })
  }
  if (input.governed) items.push(input.governed)
  if ((input.pending ?? 0) > 0) {
    const n = input.pending ?? 0
    items.push({
      key: "pending",
      label: n === 1 ? "1 pending" : `${n} pending`,
      tone: "warn",
    })
  }
  return items.filter((item) => item.label.trim().length > 0)
}

export function joinHeaderStatus(items: readonly { label: string }[]): string {
  return items.map((item) => item.label.trim()).filter(Boolean).join(" | ")
}

const HEADER_SEP = " | "
const HEADER_DROP_ORDER = ["path", "session", "branch", "model", "ctx"] as const

export function headerItemDisplayWidth(item: { hint?: string; label: string }, first: boolean): number {
  const sep = first ? 0 : HEADER_SEP.length
  const hint = item.hint?.trim() ? item.hint.trim().length + 1 : 0
  return sep + hint + item.label.trim().length
}

export function headerLineDisplayWidth(items: readonly { hint?: string; label: string }[]): number {
  return items.reduce((sum, item, index) => sum + headerItemDisplayWidth(item, index === 0), 0)
}

/** Drop lowest-priority items until the status line fits the remaining cells. */
export function fitHeaderStatusItems<T extends { key: string; label: string; hint?: string }>(
  items: readonly T[],
  budget: number,
  dropOrder: readonly string[] = HEADER_DROP_ORDER,
): T[] {
  const room = Math.max(1, Math.floor(budget))
  let next = items.filter((item) => item.label.trim().length > 0)
  if (headerLineDisplayWidth(next) <= room) return next
  for (const key of dropOrder) {
    const index = next.findIndex((item) => item.key === key)
    if (index < 0) continue
    next = next.filter((_, i) => i !== index)
    if (headerLineDisplayWidth(next) <= room) return next
  }
  while (next.length > 1 && headerLineDisplayWidth(next) > room) {
    next = next.slice(0, -1)
  }
  return next
}

type GovernedTallyEntry = {
  id: string
  kind?: string
  label?: string
  source?: { kind?: string }
  children?: ReadonlyArray<{ kind?: string; label?: string }>
}

/** Session tally for the header — not a chat row. */
export function projectGovernedTally(entries: readonly GovernedTallyEntry[]): SessionCharterChip | undefined {
  let actions = 0
  let denied = 0
  let pending = 0
  for (const entry of entries) {
    if (entry.source?.kind !== "governance") continue
    if (entry.id.startsWith("governance-proof:") || entry.id.startsWith("governance-trace:")) continue
    if (entry.id.startsWith("proof-continuation:")) continue
    const kids = entry.children
    if (entry.id.startsWith("governance-group:") && kids && kids.length > 0) {
      actions += kids.length
      for (const child of kids) {
        if (child.kind === "fail" || child.label === "denied") denied += 1
        if (child.kind === "approve" || child.label === "approval required") pending += 1
      }
      continue
    }
    actions += 1
    if (entry.kind === "fail" || entry.label === "denied") denied += 1
    if (entry.kind === "approve" || entry.label === "approval required") pending += 1
  }
  if (actions === 0) return undefined
  const extra = denied > 0 ? ` | ${denied} denied` : pending > 0 ? ` | ${pending} pending` : ""
  return {
    key: "governed",
    label: `${actions} governed${extra}`,
    tone: denied > 0 ? "error" : pending > 0 ? "warn" : "ok",
  }
}
