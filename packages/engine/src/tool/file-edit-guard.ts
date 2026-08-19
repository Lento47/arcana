/**
 * File Edit Guard — guardrails for agent-initiated file mutations.
 *
 * Three rules:
 * 1. **No wholesale replacement**: the `write` tool must not replace entire
 *    files when the content is mostly the same. If the new content differs
 *    from the old by more than `WHOLESALE_THRESHOLD` lines, the guard
 *    flags the change as "wholesale" and asks the operator for explicit
 *    approval before proceeding.
 *
 * 2. **Large-change permission**: when a single `edit` or `apply_patch`
 *    operation changes more than `LARGE_CHANGE_LINES` lines (additions +
 *    deletions), the guard marks the metadata with `large_change: true`
 *    so the operator surface can surface a warning.
 *
 * 3. **Auto-backup for complex edits**: before any file mutation that
 *    exceeds `BACKUP_THRESHOLD` changed lines, a temporary copy is saved
 *    under `.arcana/backups/`. The backup is cleaned up after the edit
 *    succeeds; if the edit fails, the backup is preserved for recovery.
 */

import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  analyzeDiff,
  classifyGuard,
  DEFAULT_THRESHOLDS,
  resolveThresholds,
  type DiffStats,
  type GuardClassification,
  type GuardRule,
  type GuardThresholds,
} from "@arcana/core/util/file-edit-guard"
import {
  isPermissionPolicyPath,
  isSelfAwarenessPath,
} from "@arcana/core/util/self-awareness"

// Re-export pure analysis helpers from core so consumers can import from
// either location during the transition.
export {
  analyzeDiff,
  classifyGuard,
  DEFAULT_THRESHOLDS,
  resolveThresholds,
  type DiffStats,
  type GuardClassification,
  type GuardRule,
  type GuardThresholds,
}

// ── Metadata Enrichment ─────────────────────────────────────────────

export interface GuardMetadata {
  /** True when the change exceeds LARGE_CHANGE_LINES. */
  large_change?: boolean
  /** True when the change replaces most of the file (wholesale replacement). */
  wholesale_replacement?: boolean
  /** True when a backup was created before the edit. */
  backup_created?: boolean
  /** Path to the backup file, if one was created. */
  backup_path?: string
  /** Stable rule IDs describing why the mutation is guarded. */
  guard_rules?: GuardRule[]
}

/**
 * Enrich permission metadata with guard information.
 * This is called before `ctx.ask` so the operator sees warnings.
 */
export function enrichMetadata(
  stats: DiffStats,
  existingFile: boolean,
  thresholds: GuardThresholds = DEFAULT_THRESHOLDS,
): GuardMetadata {
  const meta: GuardMetadata = {}

  if (stats.totalChanged > thresholds.largeChangeLines) {
    meta.large_change = true
  }

  if (existingFile && stats.changeRatio > thresholds.wholesaleThreshold) {
    meta.wholesale_replacement = true
  }

  return meta
}

/**
 * Enrich guard metadata from a rule classification.
 */
export function enrichMetadataFromClassification(
  meta: GuardMetadata,
  classification: GuardClassification,
): GuardMetadata {
  if (classification.rules.length > 0) {
    meta.guard_rules = classification.rules
  }
  return meta
}

// ── Temporary Backups ───────────────────────────────────────────────

/**
 * Create a temporary backup of a file before a complex edit.
 * Saves to `.arcana/backups/<relative-path>.<timestamp>.bak`.
 * Returns the backup path, or undefined if backup was not needed.
 */
export async function createBackup(
  filePath: string,
  instanceDirectory: string,
): Promise<string | undefined> {
  const content = await fs.readFile(filePath, "utf8").catch(() => undefined)
  if (content === undefined) return undefined

  const relative = path.relative(instanceDirectory, filePath)
  const safeName = relative.replace(/[/\\]/g, "__")
  const timestamp = Date.now().toString(36)
  const backupDir = path.join(instanceDirectory, ".arcana", "backups")
  const backupPath = path.join(backupDir, `${safeName}.${timestamp}.bak`)

  await fs.mkdir(backupDir, { recursive: true })
  await fs.writeFile(backupPath, content, "utf8")

  return backupPath
}

/**
 * Remove a temporary backup after a successful edit.
 * Ignores errors (best-effort cleanup).
 */
export async function cleanupBackup(backupPath: string | undefined): Promise<void> {
  if (!backupPath) return
  await fs.unlink(backupPath).catch(() => {})
}

/**
 * Check if a backup should be created for this edit.
 * Returns true if the change exceeds BACKUP_THRESHOLD.
 */
export function shouldBackup(stats: DiffStats, thresholds: GuardThresholds = DEFAULT_THRESHOLDS): boolean {
  return stats.totalChanged > thresholds.backupThreshold
}

/**
 * Should this edit be flagged as "wholesale" — i.e., the agent should
 * be forced to use the `edit` tool instead of `write`?
 */
export function isWholesaleReplacement(stats: DiffStats, existingFile: boolean, thresholds: GuardThresholds = DEFAULT_THRESHOLDS): boolean {
  return existingFile && stats.changeRatio > thresholds.wholesaleThreshold
}

// ── Self-awareness paths ────────────────────────────────────────────

// Classification helpers live in @arcana/core/util/self-awareness so the
// engine permission surface and the ML classifier share one definition.

export { isPermissionPolicyPath, isSelfAwarenessPath }

/**
 * Build a human-readable guard warning for the agent output.
 */
export function guardWarning(stats: DiffStats, guard: GuardMetadata): string | undefined {
  const parts: string[] = []

  if (guard.wholesale_replacement) {
    parts.push(
      `⚠️  WHOLESALE REPLACEMENT: you are changing ${Math.round(stats.changeRatio * 100)}% of this file. ` +
      `Consider using the \`edit\` tool for surgical, line-level changes instead. ` +
      `If you truly need to replace the entire file, the operator has been asked for explicit approval.`,
    )
  }

  if (guard.large_change && !guard.wholesale_replacement) {
    parts.push(
      `⚠️  LARGE CHANGE: ${stats.totalChanged} lines changed (${stats.additions} added, ${stats.deletions} removed). ` +
      `The operator has been notified. Prefer smaller, focused edits when possible.`,
    )
  }

  if (guard.guard_rules?.includes("BLOCK_DELETION")) {
    parts.push(
      `⚠️  BLOCK DELETION: ${stats.maxConsecutiveDeletions} consecutive lines removed. ` +
      `Consider using the \`edit\` tool to remove only the specific lines you intend to change.`,
    )
  }

  if (guard.guard_rules?.includes("BLOCK_INSERTION")) {
    parts.push(
      `⚠️  BLOCK INSERTION: ${stats.maxConsecutiveAdditions} consecutive lines added. ` +
      `Large contiguous additions can hide unintended changes. Confirm this is deliberate.`,
    )
  }

  if (guard.guard_rules?.includes("PERMISSION_POLICY_EDIT")) {
    parts.push(
      `⚠️  PERMISSION POLICY: this file can change what the agent is allowed to do. ` +
      `The operator must approve any edit to permission policy files.`,
    )
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined
}
