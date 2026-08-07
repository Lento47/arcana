/**
 * PR6: proof continuation attachment.
 *
 * The engine's `authorization.executed` events carry tool + executable +
 * arguments; the spine's run tool rows carry the same command in their
 * receipt. This module matches them (normalized command equality) and
 * attaches a `SpineProofContinuation` directly to the tool row. Unmatched
 * executed events stay as standalone proof rows (fail-closed: never invent a
 * binding). Proof level/integrity/policy come from the canonical RunProof
 * snapshot when available.
 */

import type { GovernanceRunProof } from "../types"
import type { SpineEntry, SpineProofContinuation } from "./spine-types"

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function normalizeCommand(command: string | undefined): string | undefined {
  if (!command) return undefined
  return command
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export function commandKeyForExecuted(payload: unknown): string | undefined {
  const record = asRecord(payload)
  const tool = stringValue(record.tool)
  if (!tool) return undefined
  const executable = stringValue(record.executable)
  const args = Array.isArray(record.arguments)
    ? record.arguments.filter((arg): arg is string => typeof arg === "string")
    : []
  return normalizeCommand([executable, ...args].filter(Boolean).join(" "))
}

export function commandKeyForEntry(entry: SpineEntry): string | undefined {
  const command = entry.receipt?.command
  if (command) return normalizeCommand(command)
  return undefined
}

function shortHash(hash: string | undefined): string | undefined {
  if (!hash) return undefined
  return hash.length <= 8 ? hash : `${hash.slice(0, 4)}…${hash.slice(-4)}`
}

function proofFromPayload(
  payload: unknown,
  evidenceCount: number,
  proof?: GovernanceRunProof,
): SpineProofContinuation {
  const record = asRecord(payload)
  const decision = asRecord(record.decision)
  const requestHash = stringValue(record.requestHash) ?? "unavailable"
  return {
    receipt: shortHash(requestHash),
    evidence: evidenceCount,
    proofLevel: proof?.proofLevel ?? "P0",
    integrity: proof?.integrityStatus ?? "UNVERIFIED",
    policy: stringValue(decision.policyVersion) ?? proof?.authorizationProfile.policyVersions?.[0],
    executionId: stringValue(record.executionId),
    requestHash,
    tool: stringValue(record.tool),
    action: stringValue(record.action),
    startedAt: stringValue(record.startedAt),
    completedAt: stringValue(record.completedAt),
  }
}

export function attachProofContinuations(input: {
  entries: readonly SpineEntry[]
  executedEvents: readonly { id: string; type: string; payload: unknown }[]
  evidenceCountByRequestHash: Readonly<Record<string, number>>
  proof?: GovernanceRunProof
}): SpineEntry[] {
  const byCommand = new Map<string, { id: string; payload: unknown }>()
  for (const event of input.executedEvents) {
    const key = commandKeyForExecuted(event.payload)
    if (!key) continue
    byCommand.set(key, { id: event.id, payload: event.payload })
  }

  const hiddenStandalone = new Set<string>()
  const result = input.entries.map((entry) => {
    // Enrich standalone proof-continuation rows with the real proof snapshot.
    if (entry.id.startsWith("proof-continuation:")) {
      const event = input.executedEvents.find((item) => `proof-continuation:${item.id}` === entry.id)
      if (event) {
        const payload = asRecord(event.payload)
        const requestHash = stringValue(payload.requestHash)
        const evidence = requestHash ? (input.evidenceCountByRequestHash[requestHash] ?? 0) : 0
        return {
          ...entry,
          proof: proofFromPayload(event.payload, evidence, input.proof),
        }
      }
      return entry
    }

    const sourceKind = entry.source?.kind
    const isToolRow = sourceKind === "tool" || sourceKind === "subtask"
    if (!isToolRow || entry.receipt?.status !== "ok") return entry
    const key = commandKeyForEntry(entry)
    const match = key ? byCommand.get(key) : undefined
    if (!match) return entry
    const payload = asRecord(match.payload)
    const requestHash = stringValue(payload.requestHash)
    const evidence = requestHash ? (input.evidenceCountByRequestHash[requestHash] ?? 0) : 0
    hiddenStandalone.add(`proof-continuation:${match.id}`)
    return {
      ...entry,
      proof: proofFromPayload(match.payload, evidence, input.proof),
    }
  })

  return result.map((entry) =>
    hiddenStandalone.has(entry.id) ? { ...entry, hidden: true } : entry,
  )
}
