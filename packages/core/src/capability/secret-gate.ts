// packages/core/src/capability/secret-gate.ts
//
// Authority Kernel M1 — mediation for SECRET material (API keys, tokens).
//
// Model:
//   1. REGISTRATION (startup): a privileged surface provisions a named secret
//      — the value is held by the caller's registry and a narrow grant
//      (action "secret.use" on resource kind "secret", pattern = name) is
//      persisted for this principal/session.
//   2. USE: gated runtimes resolve a secret through authorizeSecretUse —
//      every access is a PDP/PEP-mediated effect with its own receipt.
//
// Fail-closed properties:
//   - unregistered / unseeded name ⇒ DENIED (DEFAULT_AGENT_ACTIONS has no
//     secret.use; only the narrow seeded grant can ALLOW)
//   - ALLOW with no provisioned value ⇒ DENIED SECRET_NOT_PROVISIONED
//   - the value is returned ONLY on EXECUTED

import { Effect } from "effect"
import { authorizeAndExecuteEffect } from "./pep"
import { buildAuthorizationRequest } from "./pep-integration"
import { SqliteGrantStore } from "./grant-store-sqlite"
import type { CapabilityGrant } from "./types"
import type { CapabilityGrantStore } from "./grant-store"
import { noopEmitter, withGate } from "./process-gate"
import type { ProcessGateOptions } from "./process-gate"
import { recordDecision, observeLatency } from "./authority-metrics"
import { Database } from "../database/database"
import { randomUUID } from "node:crypto"

export interface SecretUseRequest {
  /** Registered secret name (e.g. "ELEVENLABS_API_KEY"). */
  secretName: string
  /** Which tool/effect needs it — recorded in the receipt. */
  purpose?: string
  nonce?: string
  requestedAt?: string
  requestId?: string
  /** K2: bind this request to the calling agent instance / tool instance. */
  instanceId?: string
  parentInstanceId?: string
  onBehalfOf?: string
  toolInstance?: { toolId: string; origin?: string; schemaHash?: string }
}

export type SecretGateResult =
  | { status: "EXECUTED"; value: string; requestHash: string }
  | { status: "DENIED"; reasons: ReadonlyArray<{ code: string; message: string }> }
  | { status: "APPROVAL_REQUIRED"; message: string }
  | { status: "STALE_DECISION" | "EXECUTION_FAILED"; detail: string }

function makeSecretGrant(input: {
  principalId: string
  sessionId: string
  secretName: string
}): CapabilityGrant {
  return {
    id: `cap-secret-${input.sessionId}-${input.secretName}`,
    schemaVersion: "1",
    principal: { kind: "agent", id: input.principalId },
    issuer: { kind: "policy", id: "arcana:secret-provisioning" },
    actions: ["secret.use"],
    resources: [{ kind: "secret", pattern: input.secretName }],
    constraints: { sessionId: input.sessionId },
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: `evt-secret-${randomUUID()}`,
  }
}

/**
 * Persist the narrow single-use-class grant that allows this principal/session
 * to resolve ONE named secret. Called at registration time by the privileged
 * provisioning surface — never by agent code.
 */
export async function seedNamedSecretGrant(
  options: ProcessGateOptions,
  secretName: string,
): Promise<boolean> {
  const principalId = options.principalId ?? "arcana-cli"
  return Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      const grant = makeSecretGrant({
        principalId,
        sessionId: options.sessionId,
        secretName,
      })
      return yield* store.putGrant(grant).pipe(Effect.as(true), Effect.catch(() => Effect.succeed(false)))
    }).pipe(Effect.provide(Database.layerFromPath(options.dbPath))),
  )
}

/**
 * Mediated secret resolution. `resolve` is injected by the privileged
 * provisioning layer (the kernel itself holds no secret values); it runs
 * inside executeExact — i.e., only after the PDP allows this exact access.
 */
export async function authorizeSecretUse(
  options: ProcessGateOptions,
  request: SecretUseRequest,
  resolve: (secretName: string) => string | undefined,
): Promise<SecretGateResult> {
  const __t0 = Date.now()
  const authReq = buildAuthorizationRequest({
    toolName: "secret_use",
    principalId: options.principalId ?? "arcana-cli",
    sessionId: options.sessionId,
    args: {
      secretName: request.secretName,
      secretKind: request.secretName,
      purpose: request.purpose ?? null,
    },
    provenance: ["USER_INSTRUCTION"],
    nonce: request.nonce,
    requestedAt: request.requestedAt,
    requestId: request.requestId,
    instanceId: request.instanceId,
    parentInstanceId: request.parentInstanceId,
    onBehalfOf: request.onBehalfOf,
    toolInstance: request.toolInstance,
  })

  const result = await withGate(options, (provider) =>
    authorizeAndExecuteEffect(
      {
        request: authReq,
        executeExact: () =>
          Effect.sync(() => {
            const value = resolve(request.secretName)
            if (value === undefined) {
              throw new Error(`SECRET_NOT_PROVISIONED:${request.secretName}`)
            }
            return value
          }),
      },
      provider,
      noopEmitter,
    ),
  )

  recordDecision(result.status)
  observeLatency("gate_total_ms", Math.max(0, Date.now() - __t0))
  switch (result.status) {
    case "EXECUTED":
      return { status: "EXECUTED", value: result.value as string, requestHash: result.requestHash }
    case "DENIED":
      return { status: "DENIED", reasons: result.decision.reasons }
    case "APPROVAL_REQUIRED":
      return {
        status: "APPROVAL_REQUIRED",
        message: "This secret access requires exact operator approval (fail-closed).",
      }
    case "STALE_DECISION":
    case "EXECUTION_FAILED": {
      // EXECUTION_FAILED carrying our not-provisioned sentinel is normalized
      // into an explicit DENIED so callers cannot mistake it for a transient.
      const r = result as { reason?: string; error?: unknown }
      const errText =
        typeof r.reason === "string"
          ? r.reason
          : r.error instanceof Error
            ? r.error.message
            : r.error != null
              ? String(r.error)
              : ""
      if (errText.startsWith("SECRET_NOT_PROVISIONED")) {
        return {
          status: "DENIED",
          reasons: [{ code: "SECRET_NOT_PROVISIONED", message: `No value provisioned for ${request.secretName}` }],
        }
      }
      return { status: result.status, detail: errText || result.status }
    }
  }
}

/** Re-exported so provisioning layers can type their stores without deep imports. */
export type { CapabilityGrantStore }
