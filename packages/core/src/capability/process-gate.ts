// packages/core/src/capability/process-gate.ts
//
// Authority Kernel M1 — the SINGLE authority path for process execution.
// Any runtime surface that needs to spawn an OS process (engine session tools,
// arcana CLI runner, future cron/gateway executors) goes through here:
//
//   ProcessExecutionRequest ──> canonicalize ──> PDP snapshot ──> PEP
//         └─ executeExact runs ONLY on ALLOW — no spawn outside this boundary
//
// Reuses the exact Phase C machinery the engine session path uses
// (SqliteGrantStore + SessionPolicyProvider + ensureSessionAgentGrants +
// authorizeAndExecuteEffect); nothing here re-implements decision logic.
//
// Fail-closed properties (mirroring engine fixtures):
//   - empty/unbootstrapped store  ⇒ DENIED, executor calls = 0
//   - REQUIRE_APPROVAL without an approval surface ⇒ not executed (status surfaced)
//   - store unavailable ⇒ DENIED
//
// Lifecycle note: each call opens the backing database inside one scoped
// program and closes it on completion. Per-spawn overhead is deliberately
// accepted in exchange for never holding (or leaking) an open authority store;
// connection pooling is an optimization deferred until measured to matter.

import { Effect } from "effect"
import { createHash } from "node:crypto"
import { authorizeAndExecuteEffect } from "./pep"
import type { EnforcementResult } from "./pep"
import { buildAuthorizationRequest } from "./pep-integration"
import { computeRequestHash } from "./request-hash"
import { SqliteGrantStore } from "./grant-store-sqlite"
import { SessionPolicyProvider } from "./grant-store"
import { ensureSessionAgentGrants } from "./session-grants"
import { Database } from "../database/database"
import { gateTransportExec, type GateTransport } from "./replay-transport"
import { recordDecision, observeLatency } from "./authority-metrics"
import { bunSpawnExecutor, type SpawnExecutor } from "./spawn-executor"
import {
  deriveGateInfluenceClaims,
  evaluateInfluenceEscalation,
  augmentProvenanceForEscalation,
  normalizeInfluenceClaims,
} from "./argument-provenance"
import type { ArgumentInfluenceClaim } from "./types"
import type { ProcessEnvironmentBinding } from "./types"

export interface ProcessGateOptions {
  /** K3b: record effect outputs by request hash, or replay recorded ones. */
  transport?: GateTransport
  /** SQLite database backing the grant store (e.g. `<cwd>/.arcana/authority.db` or `:memory:`). */
  dbPath: string
  /** Logical agent identity (matches engine `agentPrincipalId` convention: the agent name). */
  principalId?: string
  /** Running instance/session id for attribution and scoping. */
  sessionId: string
  /** Skip ensureSessionAgentGrants bootstrap (tests: prove fail-closed deny). */
  skipBootstrap?: boolean
  /**
   * S4 seam: the executor that performs the spawn on ALLOW. Defaults to the
   * in-process Bun executor; S4 IPC mode substitutes a wire client here.
   */
  spawnExecutor?: SpawnExecutor
}

export interface ProcessGateRequest {
  /** Tool name driving the request. Mapped via toolToAction; unknown names default to process.execute (most restrictive). */
  toolName: string
  /** Exact argv to execute. Executed verbatim on ALLOW — never re-parsed through a shell. */
  argv: string[]
  cwd?: string
  /**
   * Child environment. When provided, it REPLACES the inherited environment
   * entirely (undefined values are dropped) — used to keep secrets out of
   * children that do not need them.
   */
  env?: Record<string, string | undefined>
  /**
   * Captured nondeterminism for deterministic replay (P3). Fresh attempts omit
   * these; replay passes the ORIGINAL recorded values so the identical
   * canonical request (and therefore requestHash) is reconstructed.
   */
  nonce?: string
  requestedAt?: string
  /** Captured request identity — supply when replaying a recorded authorization. */
  requestId?: string
  /** K2: bind this request to the calling agent instance / tool instance. */
  instanceId?: string
  parentInstanceId?: string
  onBehalfOf?: string
  toolInstance?: { toolId: string; origin?: string; schemaHash?: string }
  /** K3b transport: record outputs, or substitute recorded ones (zero dispatch). */
  transport?: GateTransport
  /** K7: caller-supplied influence claims (merged over gate-derived defaults). */
  influenceClaims?: ArgumentInfluenceClaim[]
}

export type ProcessGateResult =
  | { status: "EXECUTED"; stdout: string; stderr: string; exitCode: number | null; requestHash: string }
  | { status: "DENIED"; reasons: ReadonlyArray<{ code: string; message: string }> }
  | { status: "APPROVAL_REQUIRED"; message: string }
  | { status: "STALE_DECISION" | "EXHAUSTED" | "UNAVAILABLE" | "CLAIMED" | "EXECUTION_FAILED"; detail: string }

export const noopEmitter = {
  emit: () => undefined,
} as const

function lengthPrefixed(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(bytes.length)
  return Buffer.concat([length, bytes])
}

/**
 * Bind the exact replacement environment without retaining plaintext values
 * in the authorization request or its emitted evidence.
 */
export function fingerprintProcessEnvironment(
  env: Readonly<Record<string, string>>,
): ProcessEnvironmentBinding {
  const entries = Object.entries(env).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const hash = createHash("sha256")
  hash.update("arcana-process-environment-v1")
  for (const [name, value] of entries) {
    hash.update(lengthPrefixed(name))
    hash.update(lengthPrefixed(value))
  }
  return {
    variableNames: entries.map(([name]) => name),
    digest: hash.digest("hex"),
  }
}

/**
 * Shared gate plumbing: opens the authority store inside one scoped program,
 * bootstraps session grants (unless suppressed), builds the policy provider,
 * and hands it to the caller's effect. The database closes when the program
 * completes — no open authority handles escape this function.
 *
 * Exported for sibling gates (fs-gate) so every effect class shares ONE
 * store/provider/bootstrap implementation.
 */
export function withGate<T>(
  options: ProcessGateOptions,
  f: (provider: SessionPolicyProvider) => Effect.Effect<T>,
): Promise<T> {
  const principalId = options.principalId ?? "arcana-cli"
  return Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      if (!options.skipBootstrap) {
        // Idempotent bootstrap: grants the interactive-agent action set
        // scoped to this session — still fully subject to PDP evaluation
        // on every request.
        yield* ensureSessionAgentGrants(store, { agentName: principalId, sessionId: options.sessionId })
      }
      const provider = new SessionPolicyProvider(
        store,
        {
          principalId,
          sessionId: options.sessionId,
          workspaceTrust: "TRUSTED",
        },
        // No intent-binding store on this surface yet. Engine convention
        // (session/tools.ts) resolves to LEGACY_COMPAT when contracts are
        // absent; REQUIRED without a store would fail closed on every call.
        undefined,
        "LEGACY_COMPAT",
      )
      return yield* f(provider)
    }).pipe(Effect.provide(Database.layerFromPath(options.dbPath))),
  )
}

/**
 * Authorize-and-execute a process spawn through the Authority Kernel.
 * The OS child is created ONLY inside executeExact — i.e., only after the PDP
 * allows this exact canonicalized request for this principal/session.
 */
export async function authorizeProcess(
  options: ProcessGateOptions,
  request: ProcessGateRequest,
): Promise<ProcessGateResult> {
  const principalId = options.principalId ?? "arcana-cli"
  if (
    !Array.isArray(request.argv) ||
    request.argv.length === 0 ||
    request.argv.some((argument) => typeof argument !== "string")
  ) {
    recordDecision("EXECUTION_FAILED")
    return { status: "EXECUTION_FAILED", detail: "argv must be a non-empty string array" }
  }

  // Snapshot every dispatched field before the first await. The PEP hashes
  // and freezes its request, but executeExact must also avoid retaining the
  // caller's mutable argv/env objects across policy evaluation.
  const argv = [...request.argv]
  const cwd = request.cwd
  let env: Record<string, string> | undefined
  if (request.env !== undefined) {
    env = {}
    for (const [key, value] of Object.entries(request.env)) {
      if (typeof value === "string") env[key] = value
    }
  }
  const environment = env === undefined ? undefined : fingerprintProcessEnvironment(env)
  const transport = options.transport ?? request.transport

  // K7: gate-default influence claims + caller extras, then escalation.
  const derived = deriveGateInfluenceClaims({
    toolName: request.toolName,
    assertedBy: request.instanceId,
    argv,
  })
  const claims = normalizeInfluenceClaims([...derived, ...(request.influenceClaims ?? [])])
  const { escalate, triggeringArguments } = evaluateInfluenceEscalation(claims)

  // K7 enforcement: escalated requests never reach executeExact on this
  // runner (no approval surface wired). Fail closed with the trigger list.
  if (escalate) {
    recordDecision("APPROVAL_REQUIRED")
    return {
      status: "APPROVAL_REQUIRED",
      message: `K7 escalation: untrusted/unknown influence on ${triggeringArguments.join(", ")}`,
    }
  }

  const authReq = buildAuthorizationRequest({
    toolName: request.toolName,
    principalId,
    sessionId: options.sessionId,
    args: {
      command: argv.join(" "),
      argv,
      cwd: cwd ?? null,
    },
    executable: argv[0],
    arguments: argv.slice(1),
    workingDirectory: cwd,
    environment,
    provenance: augmentProvenanceForEscalation(["USER_INSTRUCTION"], escalate, claims),
    nonce: request.nonce,
    requestedAt: request.requestedAt,
    requestId: request.requestId,
    instanceId: request.instanceId,
    parentInstanceId: request.parentInstanceId,
    onBehalfOf: request.onBehalfOf,
    toolInstance: request.toolInstance,
    influenceClaims: claims,
  })

  let executorCalls = 0

  const __t0 = Date.now()

  const authReqHash = computeRequestHash(authReq)
  const spawnExecutor = options.spawnExecutor ?? bunSpawnExecutor

  const result = await withGate(options, (provider) =>
    authorizeAndExecuteEffect(
      {
        request: authReq,
        executeExact: () =>
          Effect.sync(() => {
            const tr = gateTransportExec(transport, authReqHash, () => {
              executorCalls++
              return spawnExecutor(argv, { cwd, env })
            })
            void executorCalls
            return tr.value
          }),
      },
      provider,
      noopEmitter,
    ),
  )

  recordDecision(result.status)
  observeLatency("gate_total_ms", Math.max(0, Date.now() - __t0))
  switch (result.status) {
    case "EXECUTED": {
      const value = result.value as { stdout: string; stderr: string; exitCode: number | null }
      void executorCalls // >0 guaranteed by the PEP contract; kept for debuggability
      return { status: "EXECUTED", ...value, requestHash: result.requestHash }
    }
    case "DENIED":
      return { status: "DENIED", reasons: result.decision.reasons }
    case "APPROVAL_REQUIRED":
      return {
        status: "APPROVAL_REQUIRED",
        message:
          "This action requires exact operator approval. The CLI runner does not have an approval surface wired yet (fail-closed).",
      }
    case "STALE_DECISION":
    case "EXECUTION_FAILED": {
      const r = result as { reason?: string; error?: unknown }
      const detail =
        typeof r.reason === "string"
          ? r.reason
          : r.error instanceof Error
            ? r.error.message
            : r.error != null
              ? String(r.error)
              : result.status
      return { status: result.status, detail }
    }
  }
}
