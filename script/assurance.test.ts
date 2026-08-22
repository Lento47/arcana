import { generateKeyPairSync } from "node:crypto"
import { describe, expect, test } from "bun:test"
import {
  createAssuranceManifest,
  assuranceManifestSha256,
  ASSURANCE_REQUIRED_ARTIFACTS,
  L3_ATTESTATION_SCHEMA,
  L4_ATTESTATION_SCHEMA,
  signExternalAttestation,
  validateReferenceDeploymentManifest,
  verifyAssuranceBundle,
  type L3Attestation,
  type L4Attestation,
} from "./assurance"

const commit = "1".repeat(40)
const fileDigest = "a".repeat(64)

function key() {
  return generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString()
}

function fixture() {
  const manifest = createAssuranceManifest({
    tag: "v1.0.0-rc.1",
    commit,
    sourceArchiveSha256: "b".repeat(64),
    deploymentManifestPath: "deploy/reference/deployment.json",
    deploymentSha256: "c".repeat(64),
    artifacts: [
      ...ASSURANCE_REQUIRED_ARTIFACTS.map((path) => ({ path, sha256: fileDigest })),
      { path: "z.json", sha256: "d".repeat(64) },
      { path: "a.json", sha256: "e".repeat(64) },
    ],
    generatedAt: "2026-08-22T00:00:00.000Z",
  })
  const manifestSha256 = assuranceManifestSha256(manifest)
  const subject = {
    candidateTag: manifest.candidate.tag,
    candidateCommit: manifest.candidate.commit,
    manifestSha256,
  }
  const l3 = signExternalAttestation<L3Attestation>(
    {
      schemaVersion: L3_ATTESTATION_SCHEMA,
      generatedAt: "2026-08-23T00:00:00.000Z",
      subject,
      scope: "full_platform",
      party: {
        organization: "External Reproduction Lab",
        reviewer: "R. Reproducer",
        independenceStatement: "No contributor, employment, or implementation relationship with Arcana.",
      },
      environments: [
        { id: "linux-x64", platform: "linux", architecture: "x64", bun: "1.3.14", rust: "1.97.1" },
        { id: "macos-arm64", platform: "darwin", architecture: "arm64", bun: "1.3.14", rust: "1.97.1" },
      ],
      results: manifest.requiredEnvironments.flatMap((environment) =>
        manifest.requiredSuites.map((suite) => ({
          environmentId: environment.id,
          suiteId: suite.id,
          status: "passed" as const,
          sourceClean: true,
          reportSha256: fileDigest,
        })),
      ),
      deviations: [],
      reportSha256: "f".repeat(64),
      conclusion: "passed",
    },
    key(),
    "2026-08-23T01:00:00.000Z",
  )
  const l4 = signExternalAttestation<L4Attestation>(
    {
      schemaVersion: L4_ATTESTATION_SCHEMA,
      generatedAt: "2026-08-24T00:00:00.000Z",
      subject,
      scope: "full_platform",
      party: {
        organization: "Independent Security Partners",
        reviewer: "A. Assessor",
        independenceStatement: "No contributor, employment, or implementation relationship with Arcana.",
      },
      deploymentSha256: manifest.deployment.sha256,
      reviews: {
        architecture: "completed",
        threatModel: "completed",
        penetrationTest: "completed",
        supplyChain: "completed",
        remediationVerification: "completed",
      },
      findings: {
        critical: { total: 1, open: 0 },
        high: { total: 2, open: 0 },
        medium: { total: 3, open: 0 },
        low: { total: 4, open: 0 },
        informational: 2,
      },
      retestCompleted: true,
      limitations: ["Third-party LLM provider internals were outside the assessment boundary."],
      reportSha256: "9".repeat(64),
      conclusion: "passed",
    },
    key(),
    "2026-08-24T01:00:00.000Z",
  )
  return { manifest, l3, l4 }
}

describe("external assurance evidence", () => {
  test("requires verified, commit-bound reference deployment evidence", () => {
    const deployment = {
      schemaVersion: "arcana.hardened-linux-deployment.v1",
      generatedAt: "2026-08-22T00:00:00.000Z",
      candidateCommit: commit,
      profile: { os: "Ubuntu 24.04", architecture: "x64", kernel: "6.8", arcanaServiceUser: "arcana" },
      controls: Object.fromEntries(
        [
          "leastPrivilege",
          "filesystemIsolation",
          "networkDefaultDeny",
          "tls13",
          "mutualTls",
          "channelBinding",
          "osKeyProtection",
          "secretRedaction",
          "auditAndProof",
          "timeSync",
          "monitoring",
        ].map((name) => [name, { status: "verified", evidenceIds: ["tls"] }]),
      ),
      exercises: Object.fromEntries(
        [
          "restartRecovery",
          "backupRestore",
          "keyRotation",
          "compromisedNode",
          "tlsNegativeClients",
          "bypassAttempts",
        ].map((name) => [name, { status: "verified", evidenceIds: ["restart"] }]),
      ),
      evidence: [
        { id: "tls", kind: "handshake-report", sha256: fileDigest },
        { id: "restart", kind: "exercise-report", sha256: "b".repeat(64) },
      ],
    }
    expect(validateReferenceDeploymentManifest(deployment, commit)).toEqual([])
    expect(
      validateReferenceDeploymentManifest(
        {
          ...deployment,
          candidateCommit: "2".repeat(40),
          controls: { ...deployment.controls, mutualTls: { status: "pending", evidenceIds: ["missing"] } },
        },
        commit,
      ),
    ).toEqual([
      "deployment candidate commit does not match candidate",
      "deployment controls.mutualTls must be verified",
    ])
  })

  test("creates a deterministic full-platform manifest contract", () => {
    const { manifest } = fixture()
    expect(manifest.scope).toBe("full_platform")
    expect(manifest.artifacts.map((artifact) => artifact.path)).toEqual(
      [...ASSURANCE_REQUIRED_ARTIFACTS, "z.json", "a.json"].sort((a, b) => a.localeCompare(b)),
    )
    expect(manifest.requiredEnvironments.map((environment) => environment.id)).toEqual(["linux-x64", "macos-arm64"])
    expect(manifest.requiredSuites.map((suite) => suite.id)).toEqual(["acep-1-conformance", "phase-c-adversarial"])
  })

  test("accepts separate trusted parties bound to the exact candidate", () => {
    const { manifest, l3, l4 } = fixture()
    const result = verifyAssuranceBundle(manifest, l3, l4, {
      expectedCommit: commit,
      trustedL3KeySha256: l3.signature.keyId,
      trustedL4KeySha256: l4.signature.keyId,
    })
    expect(result).toEqual({
      ok: true,
      errors: [],
      candidateCommit: commit,
      candidateTag: "v1.0.0-rc.1",
      l3Organization: "External Reproduction Lab",
      l4Organization: "Independent Security Partners",
    })
  })

  test("rejects a tampered signed attestation", () => {
    const { manifest, l3, l4 } = fixture()
    const tampered = { ...l3, conclusion: "failed" as const }
    const result = verifyAssuranceBundle(manifest, tampered, l4)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("l3 signature is invalid")
    expect(result.errors).toContain("l3 conclusion must be passed")
  })

  test("rejects a different release commit and untrusted signer", () => {
    const { manifest, l3, l4 } = fixture()
    const result = verifyAssuranceBundle(manifest, l3, l4, {
      expectedCommit: "2".repeat(40),
      trustedL3KeySha256: "3".repeat(64),
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes("does not match expected"))).toBe(true)
    expect(result.errors).toContain("l3 signer key does not match the trusted reproducer key")
  })

  test("rejects a manifest that weakens the fixed L3 contract", () => {
    const { manifest, l3, l4 } = fixture()
    const weakened = {
      ...manifest,
      requiredEnvironments: [
        { id: "windows-1", platform: "win32", architecture: "x64" },
        { id: "windows-2", platform: "win32", architecture: "x64" },
      ],
      requiredSuites: manifest.requiredSuites.map((suite) => ({ ...suite, command: ["bun", "--version"] })),
    }
    const result = verifyAssuranceBundle(weakened, l3, l4)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("manifest reproduction environments do not match the fixed L3 contract")
    expect(result.errors).toContain("manifest ACEP-1 suite does not match the fixed L3 contract")
    expect(result.errors).toContain("manifest Phase C suite does not match the fixed L3 contract")
  })

  test("rejects one organization acting as both reproducer and assessor", () => {
    const { manifest, l3, l4 } = fixture()
    const unsigned = { ...l4, party: { ...l4.party, organization: l3.party.organization } }
    const { signature: _signature, ...payload } = unsigned
    const resigned = signExternalAttestation<L4Attestation>(payload, key())
    const result = verifyAssuranceBundle(manifest, l3, resigned)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("l3 reproducer and l4 assessor must be separate organizations")
  })

  test("rejects incomplete L3 matrices and reproduction deviations", () => {
    const { manifest, l3, l4 } = fixture()
    const unsigned = { ...l3, results: l3.results.slice(1), deviations: ["macOS suite was skipped"] }
    const { signature: _signature, ...payload } = unsigned
    const resigned = signExternalAttestation<L3Attestation>(payload, key())
    const result = verifyAssuranceBundle(manifest, resigned, l4)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("l3 reproduction has unexplained deviations")
    expect(result.errors.some((error) => error.startsWith("l3 is missing"))).toBe(true)
  })

  test("rejects any unresolved L4 finding or missing retest", () => {
    const { manifest, l3, l4 } = fixture()
    const unsigned = {
      ...l4,
      retestCompleted: false,
      findings: { ...l4.findings, low: { total: 4, open: 1 } },
    }
    const { signature: _signature, ...payload } = unsigned
    const resigned = signExternalAttestation<L4Attestation>(payload, key())
    const result = verifyAssuranceBundle(manifest, l3, resigned)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("l4 remediation retest must be completed")
    expect(result.errors).toContain("l4 has 1 open low finding(s)")
  })

  test("fails closed on malformed nested evidence instead of throwing", () => {
    const { manifest, l3, l4 } = fixture()
    const malformed = { ...l3, environments: [null], results: [null] }
    const result = verifyAssuranceBundle(manifest, malformed, l4)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("l3 environment 0 is invalid")
    expect(result.errors).toContain("l3 result 0 is invalid")
  })
})
