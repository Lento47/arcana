/**
 * Self-awareness path classification.
 *
 * The model may edit its own memory and configuration under these paths
 * non-destructively. Permission-policy files inside those directories are
 * still denied so the model cannot widen its own access.
 */

/** Paths where the model may self-update for awareness. */
export const SELF_AWARENESS_PATH =
  /(^|[/\\])(\.arcana|\.opencode)([/\\]|$)|(^|[/\\])[^/\\]*\.memory\.md$/

/** Permission-policy files inside self-awareness dirs must never auto-allow. */
export const PERMISSION_POLICY_PATH = /(^|[/\\])(\.arcana|\.opencode)[/\\].*permission/i

/**
 * Normalize a path for classification. Converts backslashes to forward
 * slashes so Windows and POSIX paths evaluate identically.
 */
function normalize(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}

/** Check whether a path is inside the model's self-awareness surface. */
export function isSelfAwarenessPath(filePath: string): boolean {
  if (isPermissionPolicyPath(filePath)) return false
  return SELF_AWARENESS_PATH.test(normalize(filePath))
}

/** Check whether a path is a permission-policy file. */
export function isPermissionPolicyPath(filePath: string): boolean {
  return PERMISSION_POLICY_PATH.test(normalize(filePath))
}
