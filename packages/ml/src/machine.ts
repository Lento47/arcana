export type DiskPosture = "no_write" | "memory_only" | "recycle_temp" | "approval_required"

export type DataLifetime = "turn" | "session" | "ttl" | "persistent"

export type MachineResourceInput = {
  operation: string
  estimatedBytesToWrite?: number
  filesToCreate?: number
  persistent?: boolean
  containsUserData?: boolean
  canRegenerate?: boolean
  needsCache?: boolean
  userApprovedPersistence?: boolean
  maxEphemeralBytes?: number
  ttlSeconds?: number
}

export type MachineResourcePlan = {
  posture: DiskPosture
  lifetime: DataLifetime
  estimatedBytesToWrite: number
  maxEphemeralBytes: number
  requiresApproval: boolean
  allowPersistentWrite: boolean
  cleanup: {
    strategy: "none" | "drop_memory" | "delete_temp" | "lru_recycle" | "manual_review"
    ttlSeconds: number | null
    actions: string[]
  }
  recommendations: string[]
  reasons: string[]
}

const DEFAULT_MAX_EPHEMERAL_BYTES = 16 * 1024 * 1024
const DEFAULT_TTL_SECONDS = 15 * 60

function normalizedBytes(value: number | undefined): number {
  if (!value || !Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

export function planMachineResourceUse(input: MachineResourceInput): MachineResourcePlan {
  const estimatedBytesToWrite = normalizedBytes(input.estimatedBytesToWrite)
  const maxEphemeralBytes = normalizedBytes(input.maxEphemeralBytes) || DEFAULT_MAX_EPHEMERAL_BYTES
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const reasons: string[] = []
  const recommendations: string[] = []
  const cleanupActions: string[] = []

  const createsFiles = Number(input.filesToCreate ?? 0) > 0 || estimatedBytesToWrite > 0
  const persistent = Boolean(input.persistent)
  const containsUserData = Boolean(input.containsUserData)
  const canRegenerate = input.canRegenerate !== false
  const userApprovedPersistence = Boolean(input.userApprovedPersistence)

  if (!createsFiles && !input.needsCache) {
    reasons.push("Operation does not require file creation or cache materialization.")
    recommendations.push("Keep intermediate state in memory and drop it at turn completion.")
    return {
      posture: "memory_only",
      lifetime: "turn",
      estimatedBytesToWrite,
      maxEphemeralBytes,
      requiresApproval: false,
      allowPersistentWrite: false,
      cleanup: {
        strategy: "drop_memory",
        ttlSeconds: null,
        actions: ["Release in-memory buffers after the turn completes."],
      },
      recommendations,
      reasons,
    }
  }

  if (persistent && !userApprovedPersistence) {
    reasons.push("Operation requests persistent disk state without explicit user approval.")
    if (containsUserData) reasons.push("Persistent data may contain user content.")
    recommendations.push("Ask before writing persistent files, logs, embeddings, model outputs, or databases.")
    recommendations.push("Prefer an in-memory or temporary recyclable representation until approved.")
    return {
      posture: "approval_required",
      lifetime: "persistent",
      estimatedBytesToWrite,
      maxEphemeralBytes,
      requiresApproval: true,
      allowPersistentWrite: false,
      cleanup: {
        strategy: "manual_review",
        ttlSeconds: null,
        actions: ["Do not write persistent state until the user approves the exact path and purpose."],
      },
      recommendations,
      reasons,
    }
  }

  if (!canRegenerate) {
    reasons.push("Operation output cannot be regenerated safely.")
    recommendations.push("Require explicit save/keep confirmation before cleanup or overwrite.")
    return {
      posture: "approval_required",
      lifetime: persistent ? "persistent" : "session",
      estimatedBytesToWrite,
      maxEphemeralBytes,
      requiresApproval: true,
      allowPersistentWrite: persistent && userApprovedPersistence,
      cleanup: {
        strategy: "manual_review",
        ttlSeconds: null,
        actions: ["Ask the user whether to keep, export, or discard the generated state."],
      },
      recommendations,
      reasons,
    }
  }

  if (estimatedBytesToWrite > maxEphemeralBytes) {
    reasons.push("Estimated temporary data exceeds the configured ephemeral budget.")
    recommendations.push("Stream data instead of materializing it, or summarize/chunk before writing.")
    recommendations.push("Recycle least-recently-used temporary artifacts before allocating more disk.")
    cleanupActions.push("Delete stale temporary artifacts before starting the operation.")
    cleanupActions.push("Prefer streaming pipelines and bounded buffers.")
    return {
      posture: "recycle_temp",
      lifetime: "ttl",
      estimatedBytesToWrite,
      maxEphemeralBytes,
      requiresApproval: false,
      allowPersistentWrite: false,
      cleanup: {
        strategy: "lru_recycle",
        ttlSeconds,
        actions: cleanupActions,
      },
      recommendations,
      reasons,
    }
  }

  if (createsFiles || input.needsCache) {
    reasons.push("Operation may need short-lived local materialization.")
    if (containsUserData) reasons.push("Temporary state may contain user content and should not outlive the session unless approved.")
    recommendations.push("Use temporary, content-addressed, or in-memory cache entries instead of permanent files.")
    recommendations.push("Set a TTL and delete recyclable artifacts after success, failure, or cancellation.")
    cleanupActions.push("Write only to Arcana-controlled temporary storage or memory-backed buffers.")
    cleanupActions.push("Remove temporary artifacts after the operation completes.")
    cleanupActions.push("Reuse content-addressed cache entries instead of duplicating data.")
    return {
      posture: persistent ? "approval_required" : "recycle_temp",
      lifetime: persistent ? "persistent" : "ttl",
      estimatedBytesToWrite,
      maxEphemeralBytes,
      requiresApproval: persistent && !userApprovedPersistence,
      allowPersistentWrite: persistent && userApprovedPersistence,
      cleanup: {
        strategy: "delete_temp",
        ttlSeconds,
        actions: cleanupActions,
      },
      recommendations,
      reasons,
    }
  }

  return {
    posture: "no_write",
    lifetime: "turn",
    estimatedBytesToWrite,
    maxEphemeralBytes,
    requiresApproval: false,
    allowPersistentWrite: false,
    cleanup: {
      strategy: "none",
      ttlSeconds: null,
      actions: ["No disk cleanup required."],
    },
    recommendations: ["Avoid disk writes for this operation."],
    reasons: ["No disk activity is required."],
  }
}

export function formatMachineResourcePlan(plan: MachineResourcePlan): string {
  return [
    `posture=${plan.posture}`,
    `lifetime=${plan.lifetime}`,
    `estimated_bytes=${plan.estimatedBytesToWrite}`,
    `max_ephemeral_bytes=${plan.maxEphemeralBytes}`,
    `requires_approval=${plan.requiresApproval}`,
    `cleanup=${plan.cleanup.strategy}`,
    `ttl=${plan.cleanup.ttlSeconds ?? "none"}`,
    `reasons=${plan.reasons.join(" | ") || "none"}`,
  ].join(" ")
}
