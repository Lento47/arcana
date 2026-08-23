/**
 * Pure file IO for RunProof manipulation.
 *
 * Extracted from app.tsx to separate I/O concerns from the presentation layer.
 * These functions read/write the active RunProof JSON file and perform
 * rollback staging/approval mutations. They have zero UI coupling.
 */
import { readFile, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import {
  asRecord,
  normalizeProofView,
  proofString,
  type RunProofView,
} from "./proof-view/run-proof-view"

export type ProofLoadResult =
  | { status: "ready"; proof: RunProofView; path: string }
  | { status: "unbound" }
  | { status: "error"; message: string }

export function activeProofPath(): string | undefined {
  const value = process.env.ARCANA_ACTIVE_RUNPROOF_PATH
  return typeof value === "string" && value.trim() ? value : undefined
}

export async function loadActiveRunProof(): Promise<ProofLoadResult> {
  const path = activeProofPath()
  if (!path) return { status: "unbound" }

  try {
    return {
      status: "ready",
      proof: normalizeProofView(JSON.parse(await readFile(path, "utf8"))),
      path,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { status: "error", message: `Failed to read active RunProof at ${path}: ${detail}` }
  }
}

const runProofRiskRank: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

function maxRunProofRisk(current: string | undefined, next: "high"): string {
  const currentRank = current ? runProofRiskRank[current] : undefined
  return currentRank !== undefined && currentRank > runProofRiskRank[next] ? current! : next
}

function appendUniqueString(value: unknown, item: string): string[] {
  const items = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
  return items.includes(item) ? items : [...items, item]
}

export async function stageActiveRunProofRollbackRestore(): Promise<ProofLoadResult> {
  const path = activeProofPath()
  if (!path) return { status: "unbound" }

  try {
    const parsed = JSON.parse(await readFile(path, "utf8"))
    const proof = asRecord(parsed)
    if (!proof) return { status: "error", message: `Active RunProof at ${path} is not an object.` }

    const rollback = asRecord(proof.rollback)
    const restoreCommand = proofString(rollback?.restore_command)
    if (!rollback || !restoreCommand) {
      return {
        status: "error",
        message: "Active RunProof has no rollback.restore_command to stage.",
      }
    }

    const timestamp = new Date().toISOString()
    rollback.restore_status = "staged"
    rollback.staged_at = timestamp
    rollback.approval_required = true

    const risk = asRecord(proof.risk) ?? {}
    risk.level = maxRunProofRisk(proofString(risk.level), "high")
    risk.reasons = appendUniqueString(
      risk.reasons,
      "Rollback restore command is staged and requires explicit approval before execution.",
    )
    risk.required_approval = true
    proof.risk = risk

    const contract = asRecord(proof.contract) ?? {}
    contract.risk_level = maxRunProofRisk(proofString(contract.risk_level), "high")
    contract.required_approvals = appendUniqueString(contract.required_approvals, "rollback restore execution")
    proof.contract = contract

    const events = Array.isArray(proof.events) ? proof.events : []
    events.push({
      id: `evt_${randomUUID()}`,
      timestamp,
      type: "rollback.staged",
      actor: "user",
      summary: `Rollback restore staged pending approval: ${restoreCommand}`,
      risk: "high",
      status: "awaiting_approval",
      refs: {
        checkpoint_id: proofString(rollback.checkpoint_id) ?? "none",
        restore_command: restoreCommand,
      },
      data: {
        approval_required: true,
        restore_status: "staged",
        staged_at: timestamp,
      },
    })
    proof.events = events

    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")
    return { status: "ready", proof: normalizeProofView(parsed), path }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { status: "error", message: `Failed to stage rollback restore in active RunProof at ${path}: ${detail}` }
  }
}

export async function approveActiveRunProofRollbackRestore(): Promise<ProofLoadResult> {
  const path = activeProofPath()
  if (!path) return { status: "unbound" }

  try {
    const parsed = JSON.parse(await readFile(path, "utf8"))
    const proof = asRecord(parsed)
    if (!proof) return { status: "error", message: `Active RunProof at ${path} is not an object.` }

    const rollback = asRecord(proof.rollback)
    const restoreCommand = proofString(rollback?.restore_command)
    if (!rollback || !restoreCommand) {
      return {
        status: "error",
        message: "Active RunProof has no rollback.restore_command to approve.",
      }
    }
    if (rollback.restore_status !== "staged") {
      return {
        status: "error",
        message: "Rollback restore must be staged before approval.",
      }
    }

    const timestamp = new Date().toISOString()
    rollback.restore_status = "approved"
    rollback.approval_required = false
    rollback.approved_at = timestamp
    rollback.approved_by = "operator"

    const events = Array.isArray(proof.events) ? proof.events : []
    events.push({
      id: `evt_${randomUUID()}`,
      timestamp,
      type: "rollback.approved",
      actor: "user",
      summary: `Rollback restore approved but not executed: ${restoreCommand}`,
      risk: "high",
      status: proofString(asRecord(proof.lifecycle)?.status) ?? "awaiting_approval",
      refs: {
        checkpoint_id: proofString(rollback.checkpoint_id) ?? "none",
        restore_command: restoreCommand,
      },
      data: {
        restore_status: "approved",
        approved_at: timestamp,
        approved_by: "operator",
        executed: false,
      },
    })
    proof.events = events

    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")
    return { status: "ready", proof: normalizeProofView(parsed), path }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { status: "error", message: `Failed to approve rollback restore in active RunProof at ${path}: ${detail}` }
  }
}
