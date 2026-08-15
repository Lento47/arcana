/**
 * F7: key backup and rotation automation through the enterprise HTTP surface.
 *
 * Exercises preview/execute rotation, rotation evidence, digest-verified key
 * backup/restore with the active-key fingerprint gate, privileged-action
 * audit, and the tenant/RBAC boundary.
 */

import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { createJoinToken } from "@arcana/core/crypto/node-enrollment"
import { EnrollmentPaths } from "../../src/server/routes/instance/httpapi/groups/enrollment"
import { EnterprisePaths } from "../../src/server/routes/instance/httpapi/groups/enterprise"
import { Session } from "@/session/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES
const originalTrustDomain = process.env.ARCANA_CONTROL_TRUST_DOMAIN
const originalIssuerSeed = process.env.ARCANA_CONTROL_ISSUER_SEED
const originalIssuerId = process.env.ARCANA_CONTROL_ISSUER_ID
const originalOrgId = process.env.ARCANA_CONTROL_ORGANIZATION_ID

const context = Context.empty() as Context.Context<unknown>
const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const issuerSeed = new Uint8Array(32).fill(0xcd)
const issuerKey = ed25519.keygen(issuerSeed)

const TENANT = "tenant-kr"

afterEach(async () => {
  mock.restore()
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  if (originalTrustDomain === undefined) delete process.env.ARCANA_CONTROL_TRUST_DOMAIN
  else process.env.ARCANA_CONTROL_TRUST_DOMAIN = originalTrustDomain
  if (originalIssuerSeed === undefined) delete process.env.ARCANA_CONTROL_ISSUER_SEED
  else process.env.ARCANA_CONTROL_ISSUER_SEED = originalIssuerSeed
  if (originalIssuerId === undefined) delete process.env.ARCANA_CONTROL_ISSUER_ID
  else process.env.ARCANA_CONTROL_ISSUER_ID = originalIssuerId
  if (originalOrgId === undefined) delete process.env.ARCANA_CONTROL_ORGANIZATION_ID
  else process.env.ARCANA_CONTROL_ORGANIZATION_ID = originalOrgId
  await disposeAllInstances()
  await resetDatabase()
})

function configure() {
  process.env.ARCANA_CONTROL_TRUST_DOMAIN = "arcana.test"
  process.env.ARCANA_CONTROL_ISSUER_SEED = encodeBase64url(issuerSeed)
  process.env.ARCANA_CONTROL_ISSUER_ID = "issuer-arcana"
  process.env.ARCANA_CONTROL_ORGANIZATION_ID = TENANT
}

function joinTokenBody(nodeId: string, publicKey: Uint8Array) {
  return {
    joinToken: createJoinToken(
      {
        organizationId: TENANT,
        trustDomain: "arcana.test",
        nodeId,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      issuerKey.secretKey,
    ),
    publicKey: encodeBase64url(publicKey),
  }
}

describe("enterprise HttpApi key backup and rotation automation (F7)", () => {
  it.instance(
    "previews, rotates (GENERATE + RECEIVE), records evidence, and audits privileged actions",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const org = yield* requestInDirectory(
          EnterprisePaths.createOrganization,
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({ tenantId: TENANT, name: TENANT }) },
        )
        expect(org.status).toBe(200)

        const nodeKey = ed25519.keygen(new Uint8Array(32).fill(0x11))
        const enrolled = yield* requestInDirectory(
          EnrollmentPaths.enroll,
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify(joinTokenBody("node-kr", nodeKey.publicKey)) },
        )
        expect(enrolled.status).toBe(200)
        const enrolledBody = (yield* enrolled.json) as { kind?: string; record?: { nodeKeyEpoch?: number } }
        expect(enrolledBody.kind).toBe("ENROLLED")
        expect(enrolledBody.record?.nodeKeyEpoch).toBe(1)

        // Dry-run preview: reports what would rotate, never touches the key.
        const preview = yield* requestInDirectory(
          EnterprisePaths.keyRotationPreview.replace(":tenantId", TENANT),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({ nodeId: "node-kr" }) },
        )
        const previewBody = (yield* preview.json) as {
          kind: string
          currentEpoch?: number
          nextEpoch?: number
          currentFingerprint?: string
          nextFingerprint?: string
          record?: { mode?: string }
        }
        expect(previewBody.kind).toBe("PREVIEW")
        expect(previewBody.currentEpoch).toBe(1)
        expect(previewBody.nextEpoch).toBe(2)
        expect(previewBody.currentFingerprint).toBeTruthy()
        expect(previewBody.nextFingerprint).not.toBe(previewBody.currentFingerprint)
        expect(previewBody.record?.mode).toBe("DRY_RUN")

        // Confirmed GENERATE rotation: epoch advances, secret returned once.
        const rotated = yield* requestInDirectory(
          EnterprisePaths.keyRotation.replace(":tenantId", TENANT),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({ nodeId: "node-kr", mode: "GENERATE" }) },
        )
        const rotatedBody = (yield* rotated.json) as {
          kind: string
          record?: { mode?: string; previousEpoch?: number; nextEpoch?: number; previousFingerprint?: string; nextFingerprint?: string }
          nodeRecord?: { nodeKeyEpoch?: number; publicKey?: string; status?: string }
          newSecretKeyB64?: string
        }
        expect(rotatedBody.kind).toBe("ROTATED")
        expect(rotatedBody.record?.mode).toBe("CONFIRMED")
        expect(rotatedBody.record?.previousEpoch).toBe(1)
        expect(rotatedBody.record?.nextEpoch).toBe(2)
        expect(rotatedBody.record?.previousFingerprint).toBe(previewBody.currentFingerprint)
        expect(rotatedBody.newSecretKeyB64).toBeTruthy()
        expect(rotatedBody.nodeRecord?.nodeKeyEpoch).toBe(2)
        expect(rotatedBody.nodeRecord?.status).toBe("TRUSTED")

        // The registry (D-1 store) now holds the rotated key.
        const nodeView = yield* requestInDirectory(
          EnrollmentPaths.get.replace(":nodeId", "node-kr"),
          tmp.directory,
          { method: "GET", headers },
        )
        const nodeBody = (yield* nodeView.json) as { nodeKeyEpoch?: number; publicKey?: string }
        expect(nodeBody.nodeKeyEpoch).toBe(2)
        expect(nodeBody.publicKey).toBe(rotatedBody.nodeRecord?.publicKey)

        // RECEIVE mode: operator-submitted public key, no secret returned.
        const receivedKey = ed25519.keygen(new Uint8Array(32).fill(0x22))
        const received = yield* requestInDirectory(
          EnterprisePaths.keyRotation.replace(":tenantId", TENANT),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ nodeId: "node-kr", mode: "RECEIVE", publicKey: encodeBase64url(receivedKey.publicKey) }),
          },
        )
        const receivedBody = (yield* received.json) as {
          kind: string
          newSecretKeyB64?: string
          record?: { previousEpoch?: number; nextEpoch?: number }
          nodeRecord?: { publicKey?: string }
        }
        expect(receivedBody.kind).toBe("ROTATED")
        // RECEIVE mode never returns a secret (serialized absent).
        expect(receivedBody.newSecretKeyB64).toBeFalsy()
        expect(receivedBody.record?.previousEpoch).toBe(2)
        expect(receivedBody.record?.nextEpoch).toBe(3)
        expect(receivedBody.nodeRecord?.publicKey).toBe(encodeBase64url(receivedKey.publicKey))

        // Rotation evidence: DRY_RUN + 2 CONFIRMED, tenant-scoped.
        const evidence = yield* requestInDirectory(
          EnterprisePaths.keyRotations.replace(":tenantId", TENANT),
          tmp.directory,
          { method: "GET", headers },
        )
        const evidenceBody = (yield* evidence.json) as Array<{ mode?: string; nodeId?: string }>
        expect(evidenceBody).toHaveLength(3)
        expect(evidenceBody.map((row) => row.mode).sort()).toEqual(["CONFIRMED", "CONFIRMED", "DRY_RUN"])
        expect(evidenceBody.every((row) => row.nodeId === "node-kr")).toBe(true)

        // Privileged actions audited against the authenticated principal.
        const audit = yield* requestInDirectory(
          EnterprisePaths.audit.replace(":tenantId", TENANT),
          tmp.directory,
          { method: "GET", headers },
        )
        const auditBody = (yield* audit.json) as Array<{
          action?: string
          resource?: string
          outcome?: string
          actorUserId?: string
        }>
        const rotateAudits = auditBody.filter((row) => row.resource?.startsWith("key-rotate:"))
        // One ALLOWED audit per confirmed rotation (previews are not mutations).
        expect(rotateAudits.length).toBe(2)
        expect(rotateAudits.every((row) => row.action === "node.manage" && row.outcome === "ALLOWED")).toBe(true)
        expect(rotateAudits.every((row) => row.actorUserId === "local-operator")).toBe(true)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "backs up keys with server-computed digests and restores only digest- and fingerprint-verified material",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        yield* requestInDirectory(EnterprisePaths.createOrganization, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ tenantId: TENANT, name: TENANT }),
        })

        const nodeKey = ed25519.keygen(new Uint8Array(32).fill(0x11))
        yield* requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(joinTokenBody("node-kr", nodeKey.publicKey)),
        })

        // Rotate so the backup carries the current key pair (secret delivered once).
        const rotated = yield* requestInDirectory(
          EnterprisePaths.keyRotation.replace(":tenantId", TENANT),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({ nodeId: "node-kr", mode: "GENERATE" }) },
        )
        const rotatedBody = (yield* rotated.json) as {
          kind: string
          nodeRecord?: { publicKey?: string }
          newSecretKeyB64?: string
        }
        expect(rotatedBody.kind).toBe("ROTATED")
        const activePublicKey = rotatedBody.nodeRecord?.publicKey
        const activeSecretKey = rotatedBody.newSecretKeyB64
        expect(activePublicKey).toBeTruthy()
        expect(activeSecretKey).toBeTruthy()

        const material = { nodeId: "node-kr", publicKey: activePublicKey!, secretKey: activeSecretKey! }

        // Back up the active key: digest computed server-side from the material.
        const backedUp = yield* requestInDirectory(
          EnterprisePaths.backupKeys.replace(":tenantId", TENANT),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({ backupId: "keys-1", material }) },
        )
        const backupBody = (yield* backedUp.json) as {
          kind: string
          record?: { backupId?: string; kind?: string; digest?: string; fingerprint?: string }
        }
        expect(backupBody.kind).toBe("BACKED_UP")
        expect(backupBody.record?.kind).toBe("KEYS")
        expect(backupBody.record?.digest).toBeTruthy()
        expect(backupBody.record?.fingerprint).toBeTruthy()

        // Tampered material (same key identity, altered secret) fails closed.
        const tampered = yield* requestInDirectory(
          EnterprisePaths.restoreKeys
            .replace(":tenantId", TENANT)
            .replace(":backupId", "keys-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              presentedMaterial: { ...material, secretKey: encodeBase64url(new Uint8Array(32).fill(0x99)) },
            }),
          },
        )
        expect(((yield* tampered.json) as { kind?: string }).kind).toBe("REJECTED")

        // Invalid key material is rejected at backup time.
        const badBackup = yield* requestInDirectory(
          EnterprisePaths.backupKeys.replace(":tenantId", TENANT),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ backupId: "keys-bad", material: { ...material, publicKey: "nope" } }),
          },
        )
        expect(((yield* badBackup.json) as { kind?: string }).kind).toBe("REJECTED")

        // Exact material restores while the active key matches.
        const restored = yield* requestInDirectory(
          EnterprisePaths.restoreKeys
            .replace(":tenantId", TENANT)
            .replace(":backupId", "keys-1"),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({ presentedMaterial: material }) },
        )
        const restoredBody = (yield* restored.json) as {
          kind: string
          record?: { restoredAt?: string }
        }
        expect(restoredBody.kind).toBe("RESTORED")
        expect(restoredBody.record?.restoredAt).toBeTruthy()

        // After RECEIVE rotation the old key backup cannot activate: the
        // restored fingerprint no longer matches the active key.
        const receivedKey = ed25519.keygen(new Uint8Array(32).fill(0x33))
        yield* requestInDirectory(EnterprisePaths.keyRotation.replace(":tenantId", TENANT), tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ nodeId: "node-kr", mode: "RECEIVE", publicKey: encodeBase64url(receivedKey.publicKey) }),
        })
        const stale = yield* requestInDirectory(
          EnterprisePaths.restoreKeys
            .replace(":tenantId", TENANT)
            .replace(":backupId", "keys-1"),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({ presentedMaterial: material }) },
        )
        expect(((yield* stale.json) as { kind?: string }).kind).toBe("REJECTED")

        // Key backup/restore are privileged actions: audited ALLOWED/DENIED.
        const audit = yield* requestInDirectory(
          EnterprisePaths.audit.replace(":tenantId", TENANT),
          tmp.directory,
          { method: "GET", headers },
        )
        const auditBody = (yield* audit.json) as Array<{ resource?: string; outcome?: string }>
        expect(auditBody.some((row) => row.resource === "key-backup:keys-1" && row.outcome === "ALLOWED")).toBe(true)
        expect(auditBody.some((row) => row.resource === "key-restore:keys-1" && row.outcome === "ALLOWED")).toBe(true)
        expect(auditBody.some((row) => row.resource === "key-restore:keys-1" && row.outcome === "DENIED")).toBe(true)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "fails closed across tenants: rotation, backup, and restore reject unbound principals",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        // Principal is bound to TENANT only; tenant-other has no binding.
        yield* requestInDirectory(EnterprisePaths.createOrganization, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ tenantId: TENANT, name: TENANT }),
        })

        const nodeKey = ed25519.keygen(new Uint8Array(32).fill(0x11))
        yield* requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(joinTokenBody("node-kr", nodeKey.publicKey)),
        })

        const rotate = yield* requestInDirectory(
          EnterprisePaths.keyRotation.replace(":tenantId", "tenant-other"),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({ nodeId: "node-kr", mode: "GENERATE" }) },
        )
        expect(rotate.status).toBe(403)

        const backup = yield* requestInDirectory(
          EnterprisePaths.backupKeys.replace(":tenantId", "tenant-other"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              backupId: "keys-x",
              material: { nodeId: "node-kr", publicKey: encodeBase64url(nodeKey.publicKey) },
            }),
          },
        )
        expect(backup.status).toBe(403)

        const restore = yield* requestInDirectory(
          EnterprisePaths.restoreKeys
            .replace(":tenantId", "tenant-other")
            .replace(":backupId", "keys-x"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              presentedMaterial: { nodeId: "node-kr", publicKey: encodeBase64url(nodeKey.publicKey) },
            }),
          },
        )
        expect(restore.status).toBe(403)

        // Evidence reads are tenant-gated too: unbound principal fails closed.
        const evidence = yield* requestInDirectory(
          EnterprisePaths.keyRotations.replace(":tenantId", "tenant-other"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(evidence.status).toBe(403)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
