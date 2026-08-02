/**
 * Session agent grant bootstrap.
 *
 * Production tool execution builds AuthorizationRequests with
 * principalId = agent.name (e.g. "build"). The PDP requires ACTIVE
 * CapabilityGrants for that principal. Without bootstrap, every tool
 * call fails DENY_PRINCIPAL_MISMATCH even for legitimate sessions.
 *
 * This does NOT weaken enforcement:
 * - Grants are session-scoped and agent-principal-bound
 * - Issuer is "policy" (runtime policy), not self-issued by the model
 * - High-risk actions still hit approval / intent rules when configured
 * - Missing grants still DENY
 */
import { Effect } from "effect"
import { randomUUID } from "node:crypto"
import type { CapabilityGrantStore } from "./grant-store"
import type { CapabilityAction, CapabilityGrant, Principal } from "./types"

/** Actions a default interactive agent may attempt (still subject to PDP/PEP). */
const DEFAULT_AGENT_ACTIONS: CapabilityAction[] = [
  "filesystem.read",
  "filesystem.write",
  "filesystem.delete",
  "process.execute",
  "network.read",
  "network.write",
  "git.commit",
  "git.push",
  "delegate",
]

export function agentPrincipalId(agentName: string): string {
  // Keep principalId === agent.name so it matches tools.ts request construction.
  // Do not invent a different scheme (e.g. "agent:build") without updating both sides.
  return agentName
}

export function makeSessionAgentGrant(input: {
  agentName: string
  sessionId: string
  workspaceId?: string
}): CapabilityGrant {
  const principal: Principal = { kind: "agent", id: agentPrincipalId(input.agentName) }
  return {
    id: `cap-session-${input.sessionId}-${principal.id}`,
    schemaVersion: "1",
    principal,
    issuer: { kind: "policy", id: "arcana:session-bootstrap" },
    actions: [...DEFAULT_AGENT_ACTIONS],
    resources: [
      { kind: "file", pattern: "**" },
      { kind: "directory", pattern: "**" },
      { kind: "process", pattern: "*" },
      { kind: "network", pattern: "*" },
      { kind: "git", pattern: "*" },
    ],
    constraints: {
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      // Approval still required for dangerous patterns via PermissionV1 / risk rules
    },
    delegation: {
      allowed: true,
      maximumDepth: 2,
      currentDepth: 0,
    },
    status: "ACTIVE",
    createdEventId: `evt-bootstrap-${randomUUID()}`,
  }
}

/**
 * Ensure the session agent has at least one ACTIVE grant.
 * Idempotent: if grants already exist for the principal+session, no-op.
 */
export function ensureSessionAgentGrants(
  store: CapabilityGrantStore,
  input: { agentName: string; sessionId: string; workspaceId?: string },
  onCreated?: (grant: CapabilityGrant) => Effect.Effect<void, never>,
): Effect.Effect<readonly CapabilityGrant[], never> {
  return Effect.gen(function* () {
    const principalId = agentPrincipalId(input.agentName)
    const existing = yield* store
      .getGrantsForPrincipal(principalId, input.sessionId, input.workspaceId)
      .pipe(Effect.catch(() => Effect.succeed([] as const)))

    if (existing.length > 0) return existing

    const grant = makeSessionAgentGrant(input)
    const persisted = yield* store.putGrant(grant).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    )
    if (persisted && onCreated) {
      // Lifecycle evidence is post-commit. Observer failure cannot fabricate a
      // failed grant write; its own evidence store is responsible for marking
      // trace degradation.
      yield* onCreated(grant).pipe(Effect.catchCause(() => Effect.void))
    }

    // Re-read so callers see store-canonical grants
    return yield* store
      .getGrantsForPrincipal(principalId, input.sessionId, input.workspaceId)
      .pipe(Effect.catch(() => Effect.succeed([grant] as const)))
  })
}

/** Shorten principal ids for receipts (not for authorization). */
export function shortPrincipal(id: string, keep = 8): string {
  if (id.length <= keep + 3) return id
  return `${id.slice(0, keep)}…`
}
