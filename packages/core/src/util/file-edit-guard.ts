/**
 * Pure file-edit guard analysis shared between engine tools and the arcana
 * runner's pre-execution RunProof policy gate.
 *
 * This module contains only deterministic, side-effect-free helpers. Backup,
 * filesystem, and UI warning helpers live in packages/engine/src/tool/file-edit-guard.ts.
 */

import { diffLines } from "diff"
import { isPermissionPolicyPath, isSelfAwarenessPath } from "./self-awareness.js"

// ── Thresholds ──────────────────────────────────────────────────────

/**
 * Configurable thresholds for the file edit guard.
 * Override via environment variables or runtime flag overrides:
 * - largeChangeLines (default 30)
 * - wholesaleThreshold (default 0.3, range 0–1)
 * - backupThreshold (default 50)
 * - blockDeletionLines (default 20)
 * - blockInsertionLines (default 30)
 */
export interface GuardThresholds {
  /** Lines changed (added + deleted) beyond which we consider a change "large". */
  largeChangeLines: number
  /** Fraction of total lines (0–1) beyond which write is a wholesale replacement. */
  wholesaleThreshold: number
  /** Minimum changed lines to trigger an auto-backup. */
  backupThreshold: number
  /** Consecutive deleted lines that constitute a destructive block deletion. */
  blockDeletionLines: number
  /** Consecutive added lines that constitute a suspicious block insertion. */
  blockInsertionLines: number
}

/** Default thresholds — used when no overrides are set. */
export const DEFAULT_THRESHOLDS: GuardThresholds = {
  largeChangeLines: 30,
  wholesaleThreshold: 0.3,
  backupThreshold: 50,
  blockDeletionLines: 20,
  blockInsertionLines: 30,
}

/** Merge runtime flag overrides (undefined = keep default) over the defaults. */
export function resolveThresholds(overrides?: {
  fileEditLargeChangeLines?: number
  fileEditWholesaleThreshold?: number
  fileEditBackupThreshold?: number
  fileEditBlockDeletionLines?: number
  fileEditBlockInsertionLines?: number
}): GuardThresholds {
  return {
    largeChangeLines: overrides?.fileEditLargeChangeLines ?? DEFAULT_THRESHOLDS.largeChangeLines,
    wholesaleThreshold: overrides?.fileEditWholesaleThreshold ?? DEFAULT_THRESHOLDS.wholesaleThreshold,
    backupThreshold: overrides?.fileEditBackupThreshold ?? DEFAULT_THRESHOLDS.backupThreshold,
    blockDeletionLines: overrides?.fileEditBlockDeletionLines ?? DEFAULT_THRESHOLDS.blockDeletionLines,
    blockInsertionLines: overrides?.fileEditBlockInsertionLines ?? DEFAULT_THRESHOLDS.blockInsertionLines,
  }
}

// ── Diff Analysis ───────────────────────────────────────────────────

export interface DiffStats {
  additions: number
  deletions: number
  totalChanged: number
  totalLines: number
  changeRatio: number
  /** Longest consecutive run of added lines. */
  maxConsecutiveAdditions: number
  /** Longest consecutive run of deleted lines. */
  maxConsecutiveDeletions: number
  /** Lines unchanged at the start of the file before the first edit. */
  unchangedPrefixLines: number
  /** Lines unchanged at the end of the file after the last edit. */
  unchangedSuffixLines: number
  /** Number of separate edit sites (only meaningful for full-file diffs). */
  hunkCount: number
}

/** Compute diff statistics between old and new file content. */
export function analyzeDiff(oldContent: string, newContent: string): DiffStats {
  const oldLines = oldContent.split("\n").length
  const newLines = newContent.split("\n").length
  let additions = 0
  let deletions = 0

  let maxConsecutiveAdditions = 0
  let maxConsecutiveDeletions = 0
  let currentAdditions = 0
  let currentDeletions = 0
  let hunkCount = 0
  let inHunk = false

  for (const change of diffLines(oldContent, newContent)) {
    if (change.added) {
      const count = change.count ?? 0
      additions += count
      currentAdditions += count
      currentDeletions = 0
      if (!inHunk) {
        hunkCount++
        inHunk = true
      }
    } else if (change.removed) {
      const count = change.count ?? 0
      deletions += count
      currentDeletions += count
      currentAdditions = 0
      if (!inHunk) {
        hunkCount++
        inHunk = true
      }
    } else {
      currentAdditions = 0
      currentDeletions = 0
      inHunk = false
    }

    maxConsecutiveAdditions = Math.max(maxConsecutiveAdditions, currentAdditions)
    maxConsecutiveDeletions = Math.max(maxConsecutiveDeletions, currentDeletions)
  }

  const totalChanged = additions + deletions
  const totalLines = Math.max(oldLines, newLines)

  return {
    additions,
    deletions,
    totalChanged,
    totalLines,
    changeRatio: totalLines > 0 ? totalChanged / totalLines : 0,
    maxConsecutiveAdditions,
    maxConsecutiveDeletions,
    unchangedPrefixLines: countUnchangedPrefix(oldContent, newContent),
    unchangedSuffixLines: countUnchangedSuffix(oldContent, newContent),
    hunkCount,
  }
}

function countUnchangedPrefix(oldContent: string, newContent: string): number {
  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")
  let count = 0
  for (let i = 0; i < Math.min(oldLines.length, newLines.length); i++) {
    if (oldLines[i] !== newLines[i]) break
    count++
  }
  return count
}

function countUnchangedSuffix(oldContent: string, newContent: string): number {
  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")
  let count = 0
  for (let i = 1; i <= Math.min(oldLines.length, newLines.length); i++) {
    if (oldLines[oldLines.length - i] !== newLines[newLines.length - i]) break
    count++
  }
  return count
}

// ── Destructive Classification Rule IDs ───────────────────────────────

export type GuardRule =
  | "WHOLESALE_REPLACEMENT"
  | "LARGE_CHANGE"
  | "BLOCK_DELETION"
  | "BLOCK_INSERTION"
  | "MANIFEST_EDIT"
  | "PERMISSION_POLICY_EDIT"
  | "SELF_AWARENESS_DESTRUCTIVE"
  | "FILE_DELETE"
  | "FILE_MOVE"

export interface GuardClassification {
  /** Stable rule IDs that describe why the mutation is guarded. */
  rules: GuardRule[]
  /** True if any rule marks the mutation as destructive. */
  destructive: boolean
}

export interface ClassifyGuardContext {
  filePath: string
  existingFile: boolean
  type?: "add" | "update" | "delete" | "move"
  thresholds?: GuardThresholds
  isDependencyManifest?: boolean
}

/**
 * Classify a single-file mutation into stable guard rules.
 */
export function classifyGuard(stats: DiffStats, context: ClassifyGuardContext): GuardClassification {
  const thresholds = context.thresholds ?? DEFAULT_THRESHOLDS
  const rules: GuardRule[] = []

  if (context.existingFile && stats.changeRatio > thresholds.wholesaleThreshold) {
    rules.push("WHOLESALE_REPLACEMENT")
  }

  if (stats.totalChanged > thresholds.largeChangeLines) {
    rules.push("LARGE_CHANGE")
  }

  const selfAware = isSelfAwarenessPath(context.filePath) && !isPermissionPolicyPath(context.filePath)
  if (!selfAware) {
    if (stats.maxConsecutiveDeletions > thresholds.blockDeletionLines) {
      rules.push("BLOCK_DELETION")
    }
    if (stats.maxConsecutiveAdditions > thresholds.blockInsertionLines) {
      rules.push("BLOCK_INSERTION")
    }
  }

  if (isPermissionPolicyPath(context.filePath)) {
    rules.push("PERMISSION_POLICY_EDIT")
  } else if (context.isDependencyManifest) {
    rules.push("MANIFEST_EDIT")
  }

  if (selfAware && (stats.totalChanged > thresholds.largeChangeLines || stats.changeRatio > thresholds.wholesaleThreshold)) {
    rules.push("SELF_AWARENESS_DESTRUCTIVE")
  }

  if (context.type === "delete") rules.push("FILE_DELETE")
  if (context.type === "move") rules.push("FILE_MOVE")

  return { rules, destructive: rules.length > 0 }
}
