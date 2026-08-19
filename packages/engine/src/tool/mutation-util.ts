/**
 * Mutation utilities — centralise diff analysis, backup decision, metadata,
 * and permission ask construction for file-mutation tools.
 *
 * edit.ts, write.ts, and apply_patch.ts all used to duplicate this logic.
 * This module gives each tool a single call site so guard behaviour stays
 * consistent and easy to tune.
 */

import { Effect } from "effect"
import {
  analyzeDiff,
  createBackup,
  cleanupBackup,
  shouldBackup,
  enrichMetadata,
  enrichMetadataFromClassification,
  classifyGuard,
  type DiffStats,
  type GuardClassification,
  type GuardMetadata,
  type GuardThresholds,
} from "./file-edit-guard"
import { singleMutationPermission, type MutationPermission } from "./mutation-permission"

export interface MutationContext {
  instanceDirectory: string
  filePath: string
  relativePath: string
  oldContent: string
  newContent: string
  existingFile: boolean
  type?: "add" | "update" | "delete" | "move"
  thresholds: GuardThresholds
  isDependencyManifest?: boolean
}

export interface MutationAnalysis {
  stats: DiffStats
  guard: GuardMetadata
  classification: GuardClassification
  backupPath: string | undefined
  permission: MutationPermission
}

/**
 * Analyse a single-file mutation: diff stats, guard metadata, backup decision,
 * and permission routing.
 */
export function computeMutationAnalysis(ctx: MutationContext): Effect.Effect<MutationAnalysis, never, never> {
  return Effect.gen(function* () {
    const stats = analyzeDiff(ctx.oldContent, ctx.newContent)
    const guard = enrichMetadata(stats, ctx.existingFile, ctx.thresholds)
    const classification = classifyGuard(stats, {
      filePath: ctx.filePath,
      existingFile: ctx.existingFile,
      type: ctx.type,
      thresholds: ctx.thresholds,
      isDependencyManifest: ctx.isDependencyManifest,
    })
    enrichMetadataFromClassification(guard, classification)

    const backupPath = shouldBackup(stats, ctx.thresholds)
      ? yield* Effect.promise(() => createBackup(ctx.filePath, ctx.instanceDirectory))
      : undefined
    if (backupPath) {
      guard.backup_created = true
      guard.backup_path = backupPath
    }

    const permission = singleMutationPermission(ctx.filePath, ctx.relativePath, guard)
    return { stats, guard, classification, backupPath, permission }
  })
}

/**
 * Build the `ctx.ask` payload for a single-file mutation.
 * Returns the object to pass to `ctx.ask`.
 */
export function buildMutationAskPayload(
  ctx: MutationContext,
  analysis: MutationAnalysis,
  baseMetadata: Record<string, unknown>,
): {
  permission: "edit" | "self_awareness"
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
} {
  return {
    permission: analysis.permission.permission,
    patterns: [ctx.relativePath],
    always: analysis.permission.always,
    metadata: {
      filepath: ctx.filePath,
      ...baseMetadata,
      ...analysis.guard,
      ...analysis.permission.metadata,
    },
  }
}

// Re-export cleanup for the tool success paths.
export { cleanupBackup }
