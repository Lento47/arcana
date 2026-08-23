// packages/core/src/capability/process-gate.ts
//
// Authority Kernel M1 — the SINGLE authority path for process execution.
// Any runtime surface that needs to spawn an OS process (engine session tools,
// arcana CLI runner, future cron/gateway executors) goes through here:
//
//   ProcessExecutionRequest ──> canonicalize ──> PDP snapshot ──> PEP
//     (buildAuthorizationRequest)                (SessionPolicyProvider)
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
import { authorizeAndExecuteEffect } from "./pep"
import { buildAuthorizationRequest } from "./pep-integration"
import { SqliteGrantStore } from "./grant-store-sqlite"
import { SessionPolicyProvider } from "./grant-store"
import { ensureSessionAgentGrants } from "./session-grants"
import { Database } from "../database/database"

export interface ProcessGateOptions {
  /** SQLite database backing the grant store (e.g. `<cwd>/.arcana/authority.db` or `:memory:`). */
  dbPath: string
  /** Logical agent identity (matches engine `agentPrincipalId` convention: the agent name). */
  principalId?: string
  /** Running instance/session id for attribution and scoping. */
  sessionId: string
  /** Skip ensureSessionAgentGrants bootstrap (tests: prove fail-closed deny). */
  skipBootstrap?: boolean
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
}

export type ProcessGateResult =
  | { status: "EXECUTED"; stdout: string; stderr: string; exitCode: number | null; requestHash: string }
  | { status: "DENIED"; reasons: ReadonlyArray<{ code: string; message: string }> }
  | { status: "APPROVAL_REQUIRED"; message: string }
  | { status: "STALE_DECISION" | "EXHAUSTED" | "UNAVAILABLE" | "CLAIMED" | "EXECUTION_FAILED"; detail: string }

const noopEmitter = {
  emit: () => undefined,
} as const

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

  const authReq = buildAuthorizationRequest({
    toolName: request.toolName,
    principalId,
    sessionId: options.sessionId,
    args: {
      command: request.argv.join(" "),
      argv: request.argv,
      cwd: request.cwd ?? null,
    },
    executable: request.argv[0],
    arguments: request.argv.slice(1),
    workingDirectory: request.cwd,
    provenance: ["USER_INSTRUCTION"],
    nonce: request.nonce,
    requestedAt: request.requestedAt,
    requestId: request.requestId,
  })

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      if (!options.skipBootstrap) {
        // Idempotent bootstrap: grants the interactive-agent action set
        // (process.execute included) scoped to this session — still fully
        // subject to PDP evaluation on every request.
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

      let executorCalls = 0
      return yield* authorizeAndExecuteEffect(
        {
          request: authReq,
          executeExact: () =>
            Effect.sync(() => {
              executorCalls++
              let env: Record<string, string> | undefined
              if (request.env) {
                env = {}
                for (const [k, v] of Object.entries(request.env)) {
                  if (typeof v === "string") env[k] = v
                }
              }
              const spawned = Bun.spawnSync({
                cmd: request.argv,
                cwd: request.cwd ?? undefined,
                stdout: "pipe",
                stderr: "pipe",
                env,
              })
              return {
                stdout: new TextDecoder().decode(spawned.stdout),
                stderr: new TextDecoder().decode(spawned.stderr),
                exitCode: spawned.exitCode,
              }
            }),
        },
        provider,
        noopEmitter,
      )
    }).pipe(Effect.provide(Database.layerFromPath(options.dbPath))),
  )

  switch (result.status) {
    case "EXECUTED": {
      const value = result.value as { stdout: string; stderr: string; exitCode: number | null }
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
      const detail =
        "reason" in result && typeof (result as { reason?: string }).reason === "string"
          ? (result as { reason: string }).reason
          : result.status
      return { status: result.status, detail }
    }
  }
}
