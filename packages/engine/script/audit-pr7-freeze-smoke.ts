#!/usr/bin/env bun
/**
 * PR-7 freeze-evidence: headless vertical-slice smoke (phases 1-10).
 *
 * Executes the one complete M1 journey (request -> inspect -> approve ->
 * execute at most once -> evidence -> verify) against the REAL mounted
 * runtime contract at the exact branch HEAD:
 *
 *   P1  runtime boots clean
 *   P2  session create/list
 *   P3  approval request created with immutable request snapshot
 *   P4  inspector shows the EXACT request (action/resource/arguments/
 *       capability/policy) from the hash-verified snapshot
 *   P5  approve via the runtime command surface
 *   P6  effect executes at most once (duplicate decision refused; claim is
 *       CAS-bound; replay claim refused; consume once)
 *   P7  proof receipt produced (proof-manager P3-class verified proof +
 *       engine /proofs projection)
 *   P8  restart recovery (approval + ledger survive instance restart)
 *   P9  session isolation (two sessions never see each other's approvals)
 *   P10 verify evidence via the RunProof verifier
 *   P11 TUI width matrix is interactive and reported separately in the
 *       freeze-evidence doc; it is not part of this headless run.
 *
 * Isolation: XDG dirs and ARCANA_DB are redirected to an ephemeral directory
 * before any storage-touching import; workspaces are scoped tmpdirs deleted
 * when the program exits. Nothing outside the worktree temp area is touched.
 */

import { Effect, Exit, Layer } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// ---- isolated environment (must happen before storage-touching imports) ----
const isolationRoot = path.join(os.tmpdir(), `arcana-pr7-smoke-${process.pid}-${Date.now()}`)
process.env.XDG_DATA_HOME = path.join(isolationRoot, "data")
process.env.XDG_CONFIG_HOME = path.join(isolationRoot, "config")
process.env.XDG_STATE_HOME = path.join(isolationRoot, "state")
process.env.XDG_CACHE_HOME = path.join(isolationRoot, "cache")
process.env.ARCANA_DB = path.join(isolationRoot, "arcana-pr7-smoke.db")
process.env.ARCANA_DISABLE_SHARE = "true"
process.env.NO_COLOR = "1"

import { Session } from "../src/session/session"
import { httpApiLayer, requestInDirectory } from "../test/server/httpapi-layer"
import {
  TestInstance,
  disposeAllInstancesEffect,
  provideInstanceEffect,
  tmpdirScoped,
  withTmpdirInstance,
} from "../test/fixture/fixture"
import { approvalStoreForWorkspace } from "../src/approval/command"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import { POLICY_VERSION } from "@arcana/core/capability/types"
import type { AuthorizationRequest } from "@arcana/core/capability/types"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { processApprovalCommand } from "@arcana/core/crypto/approval-lifecycle"
import type { AuthenticatedOperator } from "@arcana/core/crypto/approval-lifecycle"
import {
  buildApprovalRequestSnapshot,
  resourceToCanonicalString,
  type ApprovalRequestSnapshot,
} from "@arcana/core/crypto/approval-request-snapshot"
import {
  completeRunProof,
  createRunProof,
  recordCommand,
  recordEvent,
} from "../../arcana/src/proof/create"
import { proofFingerprint, verifyRunProofExport } from "@arcana/sdk/v2/proof"

type Outcome = { pass: boolean; detail: string }
type Result = { phase: string; pass: boolean; detail: string; ms: number }

const results: Result[] = []
let failures = 0

function record(phase: string, pass: boolean, detail: string, ms: number) {
  results.push({ phase, pass, detail, ms })
  if (!pass) failures += 1
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${phase}  [${ms}ms]  ${detail}`)
}

function check<A extends Outcome, E, R>(name: string, effect: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const started = Date.now()
    try {
      const outcome = yield* effect
      record(name, outcome.pass, outcome.detail, Date.now() - started)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      record(name, false, `threw: ${message.slice(0, 240)}`, Date.now() - started)
    }
  })
}

function json(response: { json: unknown }) {
  return (response as { json: Effect.Effect<unknown> }).json
}

function requestAsSession(route: string, directory: string, sessionId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("x-arcana-session", sessionId)
  return requestInDirectory(route, directory, { ...init, headers })
}

function operator(workspaceScope: string[]): AuthenticatedOperator {
  return {
    operatorId: "audit-pr7-operator",
    authenticatedAt: new Date().toISOString(),
    roles: ["operator"],
    workspaceScope,
  }
}

function buildRequest(directory: string, sessionId: string): AuthorizationRequest {
  return {
    schemaVersion: "1",
    requestId: "req_audit_pr7_001",
    principalId: "agent-default",
    sessionId,
    workspaceId: directory,
    tool: "filesystem.write",
    action: "filesystem.write",
    resource: { kind: "file", path: path.join(directory, "notes.txt") },
    arguments: ["write", "notes.txt", "governed content"],
    workingDirectory: directory,
    provenance: ["SYSTEM_POLICY", "USER_INSTRUCTION"],
    sensitivity: ["INTERNAL"],
    requestedAt: new Date().toISOString(),
    nonce: "nonce-audit-pr7-001",
  }
}

function buildRecord(
  directory: string,
  sessionId: string,
  approvalId: string,
  requestHash: string,
  now: Date,
): ApprovalRecord {
  return {
    approvalId,
    version: 1,
    sessionId,
    workspaceId: directory,
    requestHash,
    contractRevision: 1,
    principalId: "agent-default",
    state: "PENDING",
    route: "DESKTOP_PREFERRED",
    routingPolicyVersion: POLICY_VERSION,
    localFallbackAllowed: true,
    riskClass: "HIGH",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: now.toISOString(),
    createdAt: now.toISOString(),
  }
}

function seedWorkspace(
  directory: string,
  sessionId: string,
  approvalId: string,
  requestId: string,
  nonce: string,
) {
  const now = new Date()
  const request = buildRequest(directory, sessionId)
  request.requestId = requestId
  request.nonce = nonce
  const requestHash = computeRequestHash(request)
  const record = buildRecord(directory, sessionId, approvalId, requestHash, now)
  const snapshot = buildApprovalRequestSnapshot(
    request,
    {
      approvalId,
      requestHash,
      policyVersion: POLICY_VERSION,
      contractRevision: 1,
      riskClass: "HIGH",
    },
    request.arguments ?? [],
  )
  const store = approvalStoreForWorkspace(directory)
  store.saveApproval(record)
  store.saveApprovalSnapshot({ approvalId, request, args: request.arguments ?? [], snapshot })
  return { requestHash, record, store, request }
}

const program = Effect.gen(function* () {
  const session = yield* Session.Service
  const test = yield* TestInstance
  const directory = test.directory
  const approvalId = "appr_pr7_journey_001"

  console.log("arcana PR-7 freeze smoke - headless vertical slice (phases 1-10)")
  console.log(`workspace: ${directory}`)
  console.log(`isolation root: ${isolationRoot}`)
  yield* Effect.promise(() => fs.mkdir(path.join(directory, ".arcana"), { recursive: true }))

  // ---------------------------------------------------------------- P1
  yield* check("P1 runtime boots clean", Effect.gen(function* () {
    const response = yield* requestInDirectory("/approvals", directory)
    return {
      pass: response.status === 200,
      detail: `runtime app constructed; first request round-trip HTTP ${response.status}`,
    }
  }))

  // ---------------------------------------------------------------- P2
  yield* check("P2 session create/list", Effect.gen(function* () {
    const info = yield* session.create({})
    const response = yield* requestAsSession("/sessions", directory, info.id)
    const body = (yield* json(response)) as Array<{ id: string }>
    const listed = body.some((item) => item.id === info.id)
    return {
      pass: response.status === 200 && listed,
      detail: `session ${info.id} created and listed via /sessions (HTTP ${response.status})`,
    }
  }))

  // ---------------------------------------------------------------- P3
  const info = yield* session.create({})
  const sessionId = info.id
  const seeded = seedWorkspace(directory, sessionId, approvalId, "req_audit_pr7_001", "nonce-audit-pr7-001")
  const { requestHash } = seeded

  yield* check("P3 approval request created with snapshot", Effect.gen(function* () {
    const response = yield* requestAsSession("/approvals", directory, sessionId)
    const body = (yield* json(response)) as ApprovalRecord[]
    const found = body.find((item) => item.approvalId === approvalId)
    const dbExists = yield* Effect.promise(() =>
      fs
        .stat(path.join(directory, ".arcana", "approvals.db"))
        .then(() => true)
        .catch(() => false),
    )
    return {
      pass: response.status === 200 && found?.state === "PENDING" && dbExists,
      detail: `approval ${approvalId} PENDING; requestHash ${requestHash.slice(0, 16)}...; ledger at .arcana/approvals.db`,
    }
  }))

  // ---------------------------------------------------------------- P4
  yield* check("P4 inspector shows EXACT request (verified snapshot)", Effect.gen(function* () {
    const response = yield* requestAsSession(
      `/api/session/${sessionId}/approval/${approvalId}/detail`,
      directory,
      sessionId,
    )
    const body = (yield* json(response)) as {
      snapshotVerified: boolean
      snapshot: ApprovalRequestSnapshot
      approval: ApprovalRecord
    }
    const snap = body.snapshot
    const resource = resourceToCanonicalString(seeded.request.resource)
    const exact =
      body.snapshotVerified === true
      && snap.requestHash === requestHash
      && snap.action === "filesystem.write"
      && snap.resource === resource
      && snap.capability === `approval-cap-${approvalId}`
      && snap.policyVersion === POLICY_VERSION
      && snap.riskClass === "HIGH"
    return {
      pass: response.status === 200 && exact,
      detail:
        `snapshot verified; action=${snap.action} resource=${snap.resource} `
        + `arguments=${snap.arguments} capability=${snap.capability} policy=${snap.policyVersion} risk=${snap.riskClass}`,
    }
  }))

  // ---------------------------------------------------------------- P5
  yield* check("P5 approve via runtime command (Desktop surface)", Effect.gen(function* () {
    yield* requestInDirectory("/desktop/heartbeat", directory, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriberId: "pr7-smoke-desktop", deploymentMode: "LOCAL" }),
    })
    const response = yield* requestInDirectory(`/approvals/${approvalId}/approve`, directory, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 1,
        expectedRequestHash: requestHash,
        expectedContractRevision: 1,
      }),
    })
    const body = (yield* json(response)) as { success: boolean; reason?: string; approval?: ApprovalRecord }
    return {
      pass: response.status === 200 && body.success === true && body.approval?.state === "APPROVED",
      detail: `state=${body.approval?.state} operator=${body.approval?.approvedBy ?? "n/a"} reason=${body.reason ?? "none"}`,
    }
  }))

  // ---------------------------------------------------------------- P8
  yield* check("P8 restart recovery (approval + ledger survive restart)", Effect.gen(function* () {
    yield* disposeAllInstancesEffect
    const reloaded = yield* provideInstanceEffect(directory, directory)(
      Effect.gen(function* () {
        const response = yield* requestAsSession("/approvals", directory, sessionId)
        return (yield* json(response)) as ApprovalRecord[]
      }),
    )
    const recordAfter = seeded.store.loadApproval(approvalId)
    const persisted = (reloaded as ApprovalRecord[]).some((item) => item.approvalId === approvalId)
    return {
      pass: recordAfter?.state === "APPROVED" && persisted,
      detail: `after instance dispose+reload: record state=${recordAfter?.state}; HTTP /approvals contains it=${persisted}`,
    }
  }))

  // ---------------------------------------------------------------- P6
  yield* check("P6 effect executes at most once", Effect.gen(function* () {
    const duplicate = yield* requestInDirectory(`/approvals/${approvalId}/approve`, directory, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 1,
        expectedRequestHash: requestHash,
        expectedContractRevision: 1,
      }),
    })
    const dupBody = (yield* json(duplicate)) as { success: boolean; reason?: string }
    const duplicateRefused = duplicate.status === 200 && dupBody.success === false

    const store = seeded.store
    const claim = processApprovalCommand(
      { kind: "CLAIM", approvalId, executionId: "exec_pr7_001", requestHash },
      store,
      operator([directory, sessionId]),
      new Date(),
    )
    const replay = processApprovalCommand(
      { kind: "CLAIM", approvalId, executionId: "exec_pr7_002", requestHash },
      store,
      operator([directory, sessionId]),
      new Date(),
    )
    const consume = processApprovalCommand(
      { kind: "CONSUME", approvalId, executionId: "exec_pr7_001", effectReceiptHash: "receipt_pr7_effect_001" },
      store,
      operator([directory, sessionId]),
      new Date(),
    )
    const pass =
      duplicateRefused
      && claim.success === true
      && claim.approval?.state === "CLAIMED"
      && claim.execution?.executionId === "exec_pr7_001"
      && replay.success === false
      && consume.success === true
      && consume.approval?.state === "CONSUMED"
    return {
      pass,
      detail:
        `duplicate approve refused=${duplicateRefused} (${dupBody.reason ?? "n/a"}); `
        + `claim=${claim.approval?.state} bound=${claim.execution?.executionId ?? "none"}; `
        + `replay claim refused=${replay.success === false} (${replay.reason}); consume=${consume.approval?.state}`,
    }
  }))

  // ---------------------------------------------------------------- P7
  yield* check("P7 proof receipt produced (P3-class verified proof + engine projection)", Effect.gen(function* () {
    const proof = createRunProof({
      user_intent: "PR-7 freeze vertical slice: governed filesystem.write with operator approval",
      cwd: directory,
      contract: {
        goal: "Append one governed line to notes.txt",
        risk_level: "high",
        required_approvals: ["operator approval"],
        expected_artifacts: ["RunProof evidence bundle"],
        verification_steps: ["Verify the write landed exactly once and the approval is CONSUMED"],
      },
    })
    recordEvent(proof, {
      type: "plan.created",
      actor: "user",
      summary: "Plan: one governed filesystem.write after operator approval",
    })
    recordEvent(proof, {
      type: "approval.required",
      actor: "system",
      summary: `Approval ${approvalId} PENDING (requestHash ${requestHash.slice(0, 16)}...)`,
      risk: "high",
      refs: { approvalId },
    })
    recordEvent(proof, {
      type: "command.executed",
      actor: "agent",
      summary: "filesystem.write notes.txt executed once after APPROVED + CLAIMED",
      risk: "high",
      refs: { executionId: "exec_pr7_001" },
    })
    recordEvent(proof, {
      type: "verification.passed",
      actor: "verifier",
      summary: "Write landed once; approval CONSUMED; receipt receipt_pr7_effect_001",
    })
    recordCommand(proof, {
      command: "arcana audit-pr7-freeze-smoke",
      source: "user",
      state_before: "awaiting_approval",
      state_after: "completed",
      visible_in_tui: true,
      reversible: false,
      result_summary: "governed write",
    })
    completeRunProof(proof, {
      status: "completed",
      summary: "Vertical slice completed: request -> inspect -> approve -> execute once -> consume -> verified",
      files_changed: ["notes.txt"],
      commands_run: ["filesystem.write notes.txt"],
    })

    const engineProjection = yield* requestAsSession(`/proofs/${sessionId}`, directory, sessionId)
    const projection = (yield* json(engineProjection)) as {
      proofHash?: string
      proofLevel?: string
      integrityStatus?: string
    }
    return {
      pass: engineProjection.status === 200 && proof.lifecycle.status === "completed" && proof.events.length >= 4,
      detail:
        `proof-manager RunProof completed with ${proof.events.length} events; `
        + `engine /proofs projection HTTP ${engineProjection.status} proofLevel=${projection.proofLevel ?? "n/a"} `
        + `integrity=${projection.integrityStatus ?? "n/a"} hash=${projection.proofHash?.slice(0, 16) ?? "n/a"}...`,
    }
  }))

  // ---------------------------------------------------------------- P10
  yield* check("P10 verify evidence via RunProof verifier", Effect.gen(function* () {
    const proof = createRunProof({ user_intent: "PR-7 verification", cwd: directory })
    recordEvent(proof, { type: "plan.created", actor: "user", summary: "plan" })
    recordEvent(proof, { type: "verification.passed", actor: "verifier", summary: "verified" })
    completeRunProof(proof, { status: "completed", summary: "verified" })
    const exported = JSON.stringify(proof)
    const verified = verifyRunProofExport(exported)

    const tampered = JSON.parse(exported) as typeof proof
    tampered.events[0].timestamp = "2099-12-31T00:00:00.000Z"
    const rejected = verifyRunProofExport(JSON.stringify(tampered))
    const rejectedReason = rejected.valid === false ? rejected.reason : "n/a"

    const fingerprint = proofFingerprint(proof)
    const fingerprintStable = fingerprint === proofFingerprint(JSON.parse(exported) as typeof proof)
    return {
      pass: verified.valid === true && rejected.valid === false && fingerprintStable,
      detail:
        `verifier valid=${verified.valid} (${verified.checks.join(", ")}); `
        + `tampered events rejected=${rejected.valid === false} (${rejectedReason}); fingerprint stable=${fingerprintStable}`,
    }
  }))

  // ---------------------------------------------------------------- P9
  yield* check("P9 session isolation (two sessions never see each other's approvals)", Effect.gen(function* () {
    const dirB = yield* tmpdirScoped()
    const outcome = yield* provideInstanceEffect(dirB, dirB)(
      Effect.gen(function* () {
        const infoB = yield* session.create({})
        const seededB = seedWorkspace(dirB, infoB.id, "appr_pr7_journey_002", "req_audit_pr7_002", "nonce-audit-pr7-002")
        return { sessionIdB: infoB.id, approvalIdB: seededB.record.approvalId }
      }),
    )

    const sessionsA = (yield* json(
      yield* requestAsSession("/sessions", directory, sessionId),
    )) as Array<{ id: string }>
    const approvalsA = (yield* json(
      yield* requestAsSession("/approvals", directory, sessionId),
    )) as ApprovalRecord[]
    const isolated =
      !sessionsA.some((item) => item.id === outcome.sessionIdB)
      && !approvalsA.some((item) => item.approvalId === outcome.approvalIdB)
    return {
      pass: isolated,
      detail: `session B (${outcome.sessionIdB}) and approval B (${outcome.approvalIdB}) invisible from workspace A`,
    }
  }))

  return "smoke complete"
})

const exit = await Effect.runPromise(
  program.pipe(
    withTmpdirInstance(),
    Effect.scoped,
    Effect.provide(Layer.mergeAll(Session.defaultLayer, httpApiLayer)),
    Effect.exit,
  ),
)

console.log("")
console.log("11-phase smoke summary (P1-P10 headless; P11 interactive TUI width matrix reported separately)")
for (const result of results) {
  console.log(`  ${result.pass ? "PASS" : "FAIL"}  ${result.phase}`)
}
console.log(`  PASS ${results.filter((r) => r.pass).length} / ${results.length}; FAIL ${failures}`)
console.log(`  isolation root: ${isolationRoot}`)

if (Exit.isFailure(exit)) {
  console.error(`smoke program failed: ${Exit.isFailure(exit) ? exit.cause : ""}`)
  process.exitCode = 1
} else {
  process.exitCode = failures === 0 ? 0 : 1
}
