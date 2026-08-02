import { Database } from "@arcana/core/database/database"
import { ContractAcceptanceCriteriaTable, ContractTable } from "@arcana/core/epistemic/contract-sql"
import { SqliteIntentBindingStore } from "@arcana/core/capability/intent-binding-store-sqlite"
import { classifyRisk } from "@arcana/core/capability/pdp"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import type { AuthorizationRequest, IntentBinding, ProvenanceLabel } from "@arcana/core/capability/types"
import { and, desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { EventStore } from "./epistemic/event-store"

export type IntentAuthority =
  | { readonly mode: "LEGACY_COMPAT" }
  | {
      readonly mode: "REQUIRED"
      readonly contractId: string
      readonly contractRevision: string
      readonly criterionIds: readonly string[]
      readonly userRequestEventId: string
      readonly store: SqliteIntentBindingStore
    }

/** Resolve exactly one active contract revision or fail closed on ambiguity. */
export const resolveIntentAuthority = Effect.fn("IntentRuntime.resolveAuthority")(
  function* (db: Database.Interface, sessionId: string) {
    const contracts = yield* db.db
      .select()
      .from(ContractTable)
      .where(and(eq(ContractTable.session_id, sessionId), eq(ContractTable.status, "active")))
      .orderBy(desc(ContractTable.revision))
      .pipe(Effect.orDie)

    if (contracts.length === 0) return { mode: "LEGACY_COMPAT" } as const
    if (contracts.length !== 1) {
      return yield* Effect.die(
        new Error(`Session ${sessionId} has ${contracts.length} active contract revisions`),
      )
    }

    const contract = contracts[0]!
    const criteria = yield* db.db
      .select({ id: ContractAcceptanceCriteriaTable.id })
      .from(ContractAcceptanceCriteriaTable)
      .where(
        and(
          eq(ContractAcceptanceCriteriaTable.contract_id, contract.id),
          eq(ContractAcceptanceCriteriaTable.required, 1),
        ),
      )
      .pipe(Effect.orDie)

    return {
      mode: "REQUIRED",
      contractId: contract.id,
      contractRevision: String(contract.revision ?? 1),
      criterionIds: criteria.map((criterion) => criterion.id).sort(),
      userRequestEventId: contract.source_event_id,
      store: new SqliteIntentBindingStore(db),
    } as const
  },
)

/** Persist the remaining migration boundary so RunProof/TUI cannot report it as healthy. */
export const recordCompatibilityMode = Effect.fn("IntentRuntime.recordCompatibility")(
  function* (sessionId: string, eventStore: EventStore.Interface) {
    // Durable idempotency: a compatibility marker already persisted for this
    // session survives restart, so the mode event is recorded exactly once.
    const existing = yield* eventStore.listType(sessionId, "intent.compatibility_mode")
    if (existing.length > 0) return
    yield* eventStore.append({
      sessionId,
      actor: { kind: "policy", id: "intent-runtime" },
      type: "intent.compatibility_mode",
      payload: {
        mode: "LEGACY_COMPAT",
        assurance: "DEGRADED",
        reason: "No active contract revision is available for exact intent enforcement",
      },
    })
  },
)

/** Persist the exact active revision that enabled REQUIRED enforcement. */
export const recordRequiredMode = Effect.fn("IntentRuntime.recordRequired")(
  function* (
    sessionId: string,
    authority: Extract<IntentAuthority, { mode: "REQUIRED" }>,
    eventStore: EventStore.Interface,
  ) {
    // Durable idempotency keyed by the exact contract revision: a later
    // contract for the same session gets its own enforcement_required event.
    const existing = yield* eventStore.listType(sessionId, "intent.enforcement_required")
    if (
      existing.some((event) => {
        const payload = event.payload as { contractId?: string; contractRevision?: string }
        return payload.contractId === authority.contractId
          && payload.contractRevision === authority.contractRevision
      })
    ) return
    yield* eventStore.append({
      sessionId,
      actor: { kind: "policy", id: "intent-runtime" },
      type: "intent.enforcement_required",
      payload: {
        mode: "REQUIRED",
        contractId: authority.contractId,
        contractRevision: authority.contractRevision,
        criterionIds: authority.criterionIds,
        userRequestEventId: authority.userRequestEventId,
      },
    })
  },
)

const untrustedIntentSources = new Set<ProvenanceLabel>([
  "REMOTE_CONTENT",
  "TOOL_OUTPUT",
  "UNTRUSTED_LOCAL_SOURCE",
  "SUBAGENT_OUTPUT",
  "MCP_DESCRIPTION",
])

function canRuntimeGround(request: AuthorizationRequest): boolean {
  const hasTrustedIntent = request.provenance.includes("USER_INSTRUCTION")
    || request.provenance.includes("ACTIVE_CONTRACT")
  return hasTrustedIntent && !request.provenance.some((label) => untrustedIntentSources.has(label))
}

function makeBinding(input: {
  request: AuthorizationRequest
  authority: Extract<IntentAuthority, { mode: "REQUIRED" }>
  createdBy: IntentBinding["createdBy"]
  justification: IntentBinding["justification"]
  expiresAt?: string
}): IntentBinding {
  const requestHash = computeRequestHash(input.request)
  return {
    id: `intent-${input.createdBy.toLowerCase()}-${requestHash}`,
    requestHash,
    sessionId: input.request.sessionId,
    userRequestEventId: input.authority.userRequestEventId,
    contractId: input.authority.contractId,
    contractRevision: input.authority.contractRevision,
    criterionIds: [...input.authority.criterionIds],
    justification: input.justification,
    createdBy: input.createdBy,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
  }
}

const persistBinding = Effect.fn("IntentRuntime.persistBinding")(
  function* (
    binding: IntentBinding,
    authority: Extract<IntentAuthority, { mode: "REQUIRED" }>,
    eventStore: EventStore.Interface,
  ) {
    const existing = yield* authority.store.getActiveBindingsForRequest(
      binding.sessionId,
      binding.requestHash,
    )
    const exact = existing.find((candidate) => candidate.id === binding.id)
    if (exact) return exact

    yield* authority.store.putBinding(binding)
    yield* eventStore.append({
      sessionId: binding.sessionId,
      actor: { kind: "policy", id: "intent-runtime" },
      type: "intent.binding_created",
      payload: {
        bindingId: binding.id,
        requestHash: binding.requestHash,
        contractId: binding.contractId,
        contractRevision: binding.contractRevision,
        criterionIds: binding.criterionIds,
        userRequestEventId: binding.userRequestEventId,
        justification: binding.justification,
        createdBy: binding.createdBy,
        status: binding.status,
        expiresAt: binding.expiresAt,
      },
    }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
    return binding
  },
)

/**
 * Explicitly revoke every ACTIVE binding bound to a contract revision.
 *
 * This is the production lifecycle revocation path: when a contract is
 * resolved/satisfied, no further consequential work may be grounded on its
 * bindings. The SQL read path already hides bindings for inactive or
 * superseded revisions, but the durable rows must also transition to REVOKED
 * so RunProof and the governance projection record the revocation instead of
 * leaving ACTIVE rows that are only invisible to reads.
 */
export const revokeBindingsForContract = Effect.fn("IntentRuntime.revokeBindingsForContract")(
  function* (input: {
    sessionId: string
    contractId: string
    contractRevision: string
    store: SqliteIntentBindingStore
    eventStore: EventStore.Interface
  }) {
    const bindings = yield* input.store.getActiveBindingsForSession(input.sessionId)
    let revoked = 0
    for (const binding of bindings) {
      if (binding.contractId !== input.contractId || binding.contractRevision !== input.contractRevision) {
        continue
      }
      const didRevoke = yield* input.store.revokeBinding(binding.id)
      if (!didRevoke) continue
      revoked += 1
      yield* input.eventStore.append({
        sessionId: input.sessionId,
        actor: { kind: "policy", id: "intent-runtime" },
        type: "intent.binding_revoked",
        payload: {
          bindingId: binding.id,
          requestHash: binding.requestHash,
          contractId: binding.contractId,
          contractRevision: binding.contractRevision,
          criterionIds: binding.criterionIds,
          userRequestEventId: binding.userRequestEventId,
          justification: binding.justification,
          createdBy: binding.createdBy,
          status: "REVOKED",
          expiresAt: binding.expiresAt,
          reason: "CONTRACT_RESOLVED",
        },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
    }
    return revoked
  },
)

/** Create a runtime-owned exact binding only for clean, non-critical contract work. */
export const ensureRuntimeBinding = Effect.fn("IntentRuntime.ensureRuntimeBinding")(
  function* (
    request: AuthorizationRequest,
    authority: IntentAuthority,
    eventStore: EventStore.Interface,
  ) {
    if (authority.mode !== "REQUIRED") return undefined
    if (authority.criterionIds.length === 0) return undefined
    const risk = classifyRisk(request.action, request.sensitivity)
    if (risk === "LOW" || risk === "CRITICAL" || !canRuntimeGround(request)) return undefined

    return yield* persistBinding(
      makeBinding({
        request,
        authority,
        createdBy: "RUNTIME",
        justification: "NECESSARY_SUBSTEP",
      }),
      authority,
      eventStore,
    )
  },
)

/** Exact operator approval is the only admission source for untrusted/critical intent. */
export const ensureApprovedBinding = Effect.fn("IntentRuntime.ensureApprovedBinding")(
  function* (
    request: AuthorizationRequest,
    authority: IntentAuthority,
    expiresAt: string,
    eventStore: EventStore.Interface,
  ) {
    if (authority.mode !== "REQUIRED" || authority.criterionIds.length === 0) {
      return yield* Effect.die(
        new Error("Cannot approve consequential intent without an active contract criterion"),
      )
    }
    return yield* persistBinding(
      makeBinding({
        request,
        authority,
        createdBy: "USER_APPROVAL",
        justification: "EXPLICIT_APPROVAL",
        expiresAt,
      }),
      authority,
      eventStore,
    )
  },
)

export * as IntentRuntime from "./intent-runtime"
