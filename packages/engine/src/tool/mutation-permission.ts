/**
 * Centralise permission-class selection for file-mutation tools.
 *
 * edit.ts, write.ts, and apply_patch.ts all need the same decision:
 * - self-awareness paths (.arcana/, .opencode/, *.memory.md) use the
 *   dedicated `self_awareness` permission class and may auto-allow;
 * - permission-policy files inside those directories are denied auto-allow;
 * - large/wholesale self-awareness edits are treated as destructive and still
 *   require operator approval.
 */

import { isDependencyManifest } from "@/execution/install"
import {
  isPermissionPolicyPath,
  isSelfAwarenessPath,
} from "@arcana/core/util/self-awareness"
import type { GuardMetadata } from "./file-edit-guard"

export interface MutationClassification {
  /** True when the target lives in the model's self-awareness surface. */
  selfAware: boolean
  /** True when the self-awareness edit is large/wholesale and must still ask. */
  destructive: boolean
}

export interface MutationPermission {
  permission: "edit" | "self_awareness"
  always: string[]
  metadata: {
    self_awareness: boolean
    destructive: boolean
  }
}

/** Classify a single file mutation for self-awareness routing. */
export function classifyMutation(
  filePath: string,
  guard: GuardMetadata,
): MutationClassification {
  const selfAware = isSelfAwarenessPath(filePath) && !isPermissionPolicyPath(filePath)
  const destructive = selfAware && (guard.wholesale_replacement === true || guard.large_change === true)
  return { selfAware, destructive }
}

/**
 * Build the `ctx.ask` payload for a single-file mutation.
 *
 * Self-awareness edits that are not destructive auto-allow on the relative
 * path. Dependency manifests auto-allow on their own path. Everything else uses
 * the generic `edit` permission class.
 */
export function singleMutationPermission(
  filePath: string,
  relativePath: string,
  guard: GuardMetadata,
): MutationPermission {
  const { selfAware, destructive } = classifyMutation(filePath, guard)
  return {
    permission: selfAware ? "self_awareness" : "edit",
    always:
      selfAware && !destructive
        ? [relativePath]
        : isDependencyManifest(filePath)
          ? [relativePath]
          : ["*"],
    metadata: {
      self_awareness: selfAware,
      destructive,
    },
  }
}

/** Aggregate classification for a multi-file patch. */
export interface PatchClassification {
  selfAware: boolean
  destructive: boolean
  permissionPolicy: boolean
}

/** Classify a patch covering multiple file changes. */
export function classifyPatch(
  changes: ReadonlyArray<{ filePath: string; guard: GuardMetadata; type: "add" | "update" | "delete" | "move" }>,
): PatchClassification {
  let selfAware = true
  let destructive = false
  let permissionPolicy = false

  for (const change of changes) {
    if (isPermissionPolicyPath(change.filePath)) {
      permissionPolicy = true
      selfAware = false
      continue
    }
    const classification = classifyMutation(change.filePath, change.guard)
    if (!classification.selfAware) selfAware = false
    if (classification.destructive) destructive = true
    if (change.type === "delete" || change.type === "move") destructive = true
  }

  // If any permission-policy file is present, the whole patch is treated as
  // non-self-aware so it goes through the normal `edit` permission path.
  if (permissionPolicy) selfAware = false

  return { selfAware, destructive, permissionPolicy }
}
