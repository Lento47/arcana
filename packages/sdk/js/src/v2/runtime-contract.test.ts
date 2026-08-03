/**
 * Generated-client conformance for contracts/approval-api.v1.yaml.
 *
 * Consumes the SAME fixture suite as the runtime conformance test
 * (packages/engine/test/approval/contract-parity.test.ts) and proves the
 * generated client can construct every runtime approval request and decode
 * every runtime approval response from the shared fixtures.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Approvals } from "./gen/sdk.gen"
import type {
  ApprovalRecord,
  RuntimeApprovalsApproveData,
  RuntimeApprovalsApproveResponses,
  RuntimeApprovalsDenyData,
  RuntimeApprovalsRevokeData,
} from "./gen/types.gen"

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dir, "../../../../../contracts/fixtures/runtime-approval.v1.json"), "utf8"),
) as {
  contractRevision: number
  record: ApprovalRecord
  requests: {
    approve: { expectedVersion: number; expectedRequestHash: string; expectedContractRevision: number }
    deny: { expectedVersion: number; expectedRequestHash: string; expectedContractRevision: number }
    revoke: { expectedVersion: number; expectedRequestHash: string; expectedContractRevision: number }
  }
  responses: {
    success: { success: true; approval: ApprovalRecord }
    staleHash: { success: false; reason: string; stale: true }
    staleVersion: { success: false; reason: string; stale: true }
    staleRevision: { success: false; reason: string; stale: true }
    notFound: { success: false; reason: string }
    notActionable: { success: false; reason: string }
    wrongSession: { success: false; reason: string }
    wrongWorkspace: { success: false; reason: string }
    unauthorized: { success: false; reason: string }
    routeDenied: { success: false; reason: string }
  }
}

describe("generated runtime client conformance", () => {
  test("client can construct every approval request from the fixture", () => {
    const approveRequest: NonNullable<RuntimeApprovalsApproveData["body"]> = { ...fixture.requests.approve }
    const denyRequest: NonNullable<RuntimeApprovalsDenyData["body"]> = { ...fixture.requests.deny }
    const revokeRequest: NonNullable<RuntimeApprovalsRevokeData["body"]> = { ...fixture.requests.revoke }

    expect(approveRequest.expectedVersion).toBe(1)
    expect(denyRequest.expectedRequestHash).toBe("hash-fixture-abc-123")
    expect(revokeRequest.expectedContractRevision).toBe(1)

    const approveParams: Parameters<Approvals["approve"]>[0] = {
      approvalID: fixture.record.approvalId,
      ...fixture.requests.approve,
    }
    const denyParams: Parameters<Approvals["deny"]>[0] = {
      approvalID: fixture.record.approvalId,
      ...fixture.requests.deny,
    }
    const revokeParams: Parameters<Approvals["revoke"]>[0] = {
      approvalID: fixture.record.approvalId,
      ...fixture.requests.revoke,
    }
    expect(approveParams.approvalID).toBe("appr_fixture_1")
    expect(denyParams.directory).toBeUndefined()
    expect(revokeParams.workspace).toBeUndefined()
  })

  test("client can decode every approval response from the fixture", () => {
    const success: RuntimeApprovalsApproveResponses[200] = fixture.responses.success
    expect(success.success).toBe(true)
    expect(success.approval.approvalId).toBe("appr_fixture_1")

    const staleHash: RuntimeApprovalsApproveResponses[200] = fixture.responses.staleHash
    expect(staleHash.success).toBe(false)
    expect(staleHash.stale).toBe(true)
    expect(typeof staleHash.reason).toBe("string")

    const staleVersion: RuntimeApprovalsApproveResponses[200] = fixture.responses.staleVersion
    expect(staleVersion.stale).toBe(true)

    const staleRevision: RuntimeApprovalsApproveResponses[200] = fixture.responses.staleRevision
    expect(staleRevision.stale).toBe(true)

    for (const response of [
      fixture.responses.notFound,
      fixture.responses.notActionable,
      fixture.responses.wrongSession,
      fixture.responses.wrongWorkspace,
      fixture.responses.unauthorized,
      fixture.responses.routeDenied,
    ]) {
      const decoded: RuntimeApprovalsApproveResponses[200] = response
      expect(decoded.success).toBe(false)
      expect(decoded.stale).toBeUndefined()
    }
  })

  test("fixture stale triples are distinct and machine-readable", () => {
    const reasons = [
      fixture.responses.staleHash.reason,
      fixture.responses.staleVersion.reason,
      fixture.responses.staleRevision.reason,
    ]
    expect(new Set(reasons).size).toBe(3)
    for (const response of [
      fixture.responses.staleHash,
      fixture.responses.staleVersion,
      fixture.responses.staleRevision,
    ]) {
      expect(response.success).toBe(false)
      expect(response.stale).toBe(true)
    }
  })
})
