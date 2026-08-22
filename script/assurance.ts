#!/usr/bin/env bun
/**
 * External assurance evidence tooling.
 *
 * Local Arcana code may create an audit manifest and verify externally signed
 * attestations. It can never create an L3/L4 passing claim by itself.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative } from "node:path"
import { spawnSync } from "node:child_process"

export const ASSURANCE_MANIFEST_SCHEMA = "arcana.assurance-manifest.v1" as const
export const L3_ATTESTATION_SCHEMA = "arcana.l3-reproduction.v1" as const
export const L4_ATTESTATION_SCHEMA = "arcana.l4-assessment.v1" as const

const repoRoot = dirname(import.meta.dir)
const sha256Pattern = /^[0-9a-f]{64}$/
const commitPattern = /^[0-9a-f]{40}$/
const candidateTagPattern = /^v\d+\.\d+\.\d+-rc\.\d+$/
const deploymentControls = [
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
] as const
const deploymentExercises = [
  "restartRecovery",
  "backupRestore",
  "keyRotation",
  "compromisedNode",
  "tlsNegativeClients",
  "bypassAttempts",
] as const
const conformanceCommand = ["bun", "run", "conformance", "--json", "--output", "conformance.json"] as const
const phaseCAdversarialCommand = [
  "bun",
  "test",
  "packages/engine/test/capability/phase-c-wave-1.test.ts",
  "packages/engine/test/capability/phase-c-wave-2a.test.ts",
  "packages/engine/test/capability/phase-c-wave-2b.test.ts",
  "packages/engine/test/capability/phase-c-wave-3.test.ts",
  "packages/engine/test/capability/phase-c-wave-4.test.ts",
  "packages/engine/test/capability/phase-c-wave-5.test.ts",
  "packages/engine/test/capability/phase-c-gap-closure.test.ts",
] as const

export const ASSURANCE_REQUIRED_ARTIFACTS = [
  "bun.lock",
  "package.json",
  "packages/arcana/package.json",
  "tools/acep-conformance-rust/vectors/conformance-vectors.json",
  "packages/sdk/js/src/v2/adapters/certified-vectors.ts",
  "script/assurance.ts",
  "docs/assurance/schemas/assurance-manifest.v1.schema.json",
  "docs/assurance/schemas/l3-reproduction.v1.schema.json",
  "docs/assurance/schemas/l4-assessment.v1.schema.json",
  "deploy/reference/deployment-manifest.schema.json",
  ".github/workflows/assurance.yml",
  ".github/workflows/assurance-import.yml",
  ".github/workflows/build.yml",
  ".github/workflows/promote-release.yml",
  ".github/workflows/release.yml",
] as const

export type ArtifactDigest = {
  readonly path: string
  readonly sha256: string
}

export type AssuranceManifest = {
  readonly schemaVersion: typeof ASSURANCE_MANIFEST_SCHEMA
  readonly generatedAt: string
  readonly projectOrganization: "Arcana"
  readonly scope: "full_platform"
  readonly candidate: {
    readonly tag: string
    readonly commit: string
    readonly clean: true
    readonly sourceArchiveSha256: string
  }
  readonly deployment: {
    readonly name: "hardened-linux-reference"
    readonly manifestPath: string
    readonly sha256: string
  }
  readonly artifacts: readonly ArtifactDigest[]
  readonly requiredEnvironments: readonly [
    { readonly id: "linux-x64"; readonly platform: "linux"; readonly architecture: "x64" },
    { readonly id: "macos-arm64"; readonly platform: "darwin"; readonly architecture: "arm64" },
  ]
  readonly requiredSuites: readonly [
    {
      readonly id: "acep-1-conformance"
      readonly command: readonly ["bun", "run", "conformance", "--json", "--output", "conformance.json"]
      readonly cwd: "."
    },
    {
      readonly id: "phase-c-adversarial"
      readonly command: readonly string[]
      readonly cwd: "."
      readonly expected: {
        readonly unexpectedAllows: 0
        readonly protectedExecutorCallsOnDeniedPaths: 0
      }
    },
  ]
}

export type ExternalSignature = {
  readonly algorithm: "ed25519"
  readonly keyId: string
  readonly publicKeyPem: string
  readonly signedAt: string
  readonly valueBase64: string
}

type AttestationSubject = {
  readonly candidateTag: string
  readonly candidateCommit: string
  readonly manifestSha256: string
}

type ExternalParty = {
  readonly organization: string
  readonly reviewer: string
  readonly independenceStatement: string
}

export type L3Attestation = {
  readonly schemaVersion: typeof L3_ATTESTATION_SCHEMA
  readonly generatedAt: string
  readonly subject: AttestationSubject
  readonly scope: "full_platform"
  readonly party: ExternalParty
  readonly environments: readonly {
    readonly id: string
    readonly platform: string
    readonly architecture: string
    readonly bun: string
    readonly rust: string
  }[]
  readonly results: readonly {
    readonly environmentId: string
    readonly suiteId: string
    readonly status: "passed" | "failed"
    readonly sourceClean: boolean
    readonly reportSha256: string
  }[]
  readonly deviations: readonly string[]
  readonly reportSha256: string
  readonly conclusion: "passed" | "failed"
  readonly signature: ExternalSignature
}

type FindingSeverity = {
  readonly total: number
  readonly open: number
}

export type L4Attestation = {
  readonly schemaVersion: typeof L4_ATTESTATION_SCHEMA
  readonly generatedAt: string
  readonly subject: AttestationSubject
  readonly scope: "full_platform"
  readonly party: ExternalParty
  readonly deploymentSha256: string
  readonly reviews: {
    readonly architecture: "completed"
    readonly threatModel: "completed"
    readonly penetrationTest: "completed"
    readonly supplyChain: "completed"
    readonly remediationVerification: "completed"
  }
  readonly findings: {
    readonly critical: FindingSeverity
    readonly high: FindingSeverity
    readonly medium: FindingSeverity
    readonly low: FindingSeverity
    readonly informational: number
  }
  readonly retestCompleted: boolean
  readonly limitations: readonly string[]
  readonly reportSha256: string
  readonly conclusion: "passed" | "failed"
  readonly signature: ExternalSignature
}

export type AssuranceVerificationOptions = {
  readonly expectedCommit?: string
  readonly trustedL3KeySha256?: string
  readonly trustedL4KeySha256?: string
}

export type AssuranceVerification = {
  readonly ok: boolean
  readonly errors: readonly string[]
  readonly candidateCommit?: string
  readonly candidateTag?: string
  readonly l3Organization?: string
  readonly l4Organization?: string
}

function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

export function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path))
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`
}

export function assuranceManifestSha256(manifest: AssuranceManifest): string {
  return sha256Bytes(canonicalize(manifest))
}

function signedPayload(value: L3Attestation | L4Attestation): string {
  const signature = { ...value.signature } as Partial<ExternalSignature>
  delete signature.valueBase64
  return canonicalize({ ...value, signature })
}

function publicKeyFingerprint(key: KeyObject): string {
  const der = key.export({ type: "spki", format: "der" })
  return sha256Bytes(der)
}

export function signExternalAttestation<T extends L3Attestation | L4Attestation>(
  input: Omit<T, "signature">,
  privateKeyPem: string,
  signedAt = new Date().toISOString(),
): T {
  const privateKey = createPrivateKey(privateKeyPem)
  const publicKey = createPublicKey(privateKey)
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString()
  const unsigned = {
    ...input,
    signature: {
      algorithm: "ed25519",
      keyId: publicKeyFingerprint(publicKey),
      publicKeyPem,
      signedAt,
      valueBase64: "",
    },
  } as T
  const valueBase64 = cryptoSign(null, Buffer.from(signedPayload(unsigned)), privateKey).toString("base64")
  return { ...unsigned, signature: { ...unsigned.signature, valueBase64 } }
}

export function verifyExternalSignature(value: L3Attestation | L4Attestation): boolean {
  try {
    if (value.signature.algorithm !== "ed25519") return false
    const publicKey = createPublicKey(value.signature.publicKeyPem)
    if (publicKeyFingerprint(publicKey) !== value.signature.keyId) return false
    return cryptoVerify(
      null,
      Buffer.from(signedPayload(value)),
      publicKey,
      Buffer.from(value.signature.valueBase64, "base64"),
    )
  } catch {
    return false
  }
}

function commandText(command: readonly string[], cwd = repoRoot): string {
  const proc = spawnSync(command[0]!, command.slice(1), { cwd, encoding: "utf8" })
  if (proc.status !== 0) throw new Error(`${command.join(" ")} failed: ${(proc.stderr || proc.stdout).trim()}`)
  return proc.stdout.trim()
}

function sourceArchiveSha256(commit: string): string {
  const proc = spawnSync("git", ["archive", "--format=tar", commit], { cwd: repoRoot })
  if (proc.status !== 0 || !proc.stdout) throw new Error(`git archive failed: ${proc.stderr?.toString().trim()}`)
  return sha256Bytes(proc.stdout)
}

function repoPath(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path)
}

function artifactPath(path: string): { relativePath: string; absolutePath: string } {
  const absolutePath = repoPath(path)
  const relativePath = relative(repoRoot, absolutePath).replaceAll("\\", "/")
  if (!relativePath || relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath)) {
    throw new Error(`artifact must be inside the repository: ${path}`)
  }
  return { relativePath, absolutePath }
}

export function createAssuranceManifest(input: {
  readonly tag: string
  readonly commit: string
  readonly sourceArchiveSha256: string
  readonly deploymentManifestPath: string
  readonly deploymentSha256: string
  readonly artifacts: readonly ArtifactDigest[]
  readonly generatedAt?: string
}): AssuranceManifest {
  return {
    schemaVersion: ASSURANCE_MANIFEST_SCHEMA,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    projectOrganization: "Arcana",
    scope: "full_platform",
    candidate: {
      tag: input.tag,
      commit: input.commit,
      clean: true,
      sourceArchiveSha256: input.sourceArchiveSha256,
    },
    deployment: {
      name: "hardened-linux-reference",
      manifestPath: input.deploymentManifestPath,
      sha256: input.deploymentSha256,
    },
    artifacts: [...input.artifacts].sort((a, b) => a.path.localeCompare(b.path)),
    requiredEnvironments: [
      { id: "linux-x64", platform: "linux", architecture: "x64" },
      { id: "macos-arm64", platform: "darwin", architecture: "arm64" },
    ],
    requiredSuites: [
      {
        id: "acep-1-conformance",
        command: conformanceCommand,
        cwd: ".",
      },
      {
        id: "phase-c-adversarial",
        command: phaseCAdversarialCommand,
        cwd: ".",
        expected: { unexpectedAllows: 0, protectedExecutorCallsOnDeniedPaths: 0 },
      },
    ],
  }
}

export function generateAssuranceManifest(input: {
  readonly tag: string
  readonly deploymentManifest: string
  readonly artifacts?: readonly string[]
}): AssuranceManifest {
  if (!candidateTagPattern.test(input.tag)) throw new Error(`invalid release candidate tag: ${input.tag}`)
  const commit = commandText(["git", "rev-parse", "HEAD"])
  const taggedCommit = commandText(["git", "rev-list", "-n", "1", input.tag])
  if (taggedCommit !== commit) throw new Error(`tag ${input.tag} does not resolve to HEAD ${commit}`)
  const dirty = commandText(["git", "status", "--porcelain", "--untracked-files=all"])
  if (dirty) throw new Error("assurance manifests require a clean checkout")

  const deploymentPath = repoPath(input.deploymentManifest)
  const deploymentErrors = validateReferenceDeploymentManifest(readJson(deploymentPath), commit)
  if (deploymentErrors.length > 0) {
    throw new Error(`reference deployment is not verified:\n- ${deploymentErrors.join("\n- ")}`)
  }
  const paths = [...new Set([...ASSURANCE_REQUIRED_ARTIFACTS, ...(input.artifacts ?? [])])]
  const artifacts = paths.map((path) => {
    const resolved = artifactPath(path)
    return { path: resolved.relativePath, sha256: sha256File(resolved.absolutePath) }
  })
  return createAssuranceManifest({
    tag: input.tag,
    commit,
    sourceArchiveSha256: sourceArchiveSha256(commit),
    deploymentManifestPath: "hardened-linux-deployment.json",
    deploymentSha256: sha256File(deploymentPath),
    artifacts,
  })
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function validDate(value: unknown): boolean {
  return nonEmpty(value) && Number.isFinite(Date.parse(value))
}

export function validateReferenceDeploymentManifest(value: unknown, expectedCommit: string): string[] {
  const errors: string[] = []
  if (!object(value)) return ["deployment manifest must be an object"]
  if (value.schemaVersion !== "arcana.hardened-linux-deployment.v1") {
    errors.push("deployment schemaVersion is unsupported")
  }
  if (!validDate(value.generatedAt)) errors.push("deployment generatedAt is invalid")
  if (value.candidateCommit !== expectedCommit) errors.push("deployment candidate commit does not match candidate")
  if (
    !object(value.profile) ||
    value.profile.architecture !== "x64" ||
    !nonEmpty(value.profile.os) ||
    !nonEmpty(value.profile.kernel) ||
    !nonEmpty(value.profile.arcanaServiceUser)
  ) {
    errors.push("deployment profile must describe an x64 Linux target")
  }

  const evidenceIds = new Set<string>()
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
    errors.push("deployment evidence is required")
  } else {
    for (const [index, evidence] of value.evidence.entries()) {
      if (
        !object(evidence) ||
        !nonEmpty(evidence.id) ||
        !nonEmpty(evidence.kind) ||
        !nonEmpty(evidence.sha256) ||
        !sha256Pattern.test(evidence.sha256)
      ) {
        errors.push(`deployment evidence ${index} is invalid`)
        continue
      }
      if (evidenceIds.has(evidence.id)) errors.push(`deployment evidence id ${evidence.id} is duplicated`)
      evidenceIds.add(evidence.id)
    }
  }

  for (const [sectionName, requiredNames] of [
    ["controls", deploymentControls],
    ["exercises", deploymentExercises],
  ] as const) {
    const section = value[sectionName]
    if (!object(section)) {
      errors.push(`deployment ${sectionName} are required`)
      continue
    }
    for (const controlName of requiredNames) {
      const control = section[controlName]
      if (!object(control) || control.status !== "verified") {
        errors.push(`deployment ${sectionName}.${controlName} must be verified`)
        continue
      }
      if (
        !Array.isArray(control.evidenceIds) ||
        control.evidenceIds.length === 0 ||
        !control.evidenceIds.every(nonEmpty)
      ) {
        errors.push(`deployment ${sectionName}.${controlName} must cite evidence`)
        continue
      }
      for (const evidenceId of control.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          errors.push(`deployment ${sectionName}.${controlName} cites unknown evidence ${evidenceId}`)
        }
      }
    }
  }
  return errors
}

function validateSubject(value: unknown, errors: string[], label: string): value is AttestationSubject {
  if (!object(value)) {
    errors.push(`${label}.subject must be an object`)
    return false
  }
  if (!nonEmpty(value.candidateTag) || !candidateTagPattern.test(value.candidateTag)) {
    errors.push(`${label}.subject.candidateTag must be a release candidate tag`)
  }
  if (!nonEmpty(value.candidateCommit) || !commitPattern.test(value.candidateCommit)) {
    errors.push(`${label}.subject.candidateCommit must be a 40-character lowercase Git SHA`)
  }
  if (!nonEmpty(value.manifestSha256) || !sha256Pattern.test(value.manifestSha256)) {
    errors.push(`${label}.subject.manifestSha256 must be a lowercase SHA-256 digest`)
  }
  return true
}

function validateParty(value: unknown, errors: string[], label: string): value is ExternalParty {
  if (!object(value)) {
    errors.push(`${label}.party must be an object`)
    return false
  }
  if (!nonEmpty(value.organization)) errors.push(`${label}.party.organization is required`)
  if (!nonEmpty(value.reviewer)) errors.push(`${label}.party.reviewer is required`)
  if (!nonEmpty(value.independenceStatement) || value.independenceStatement.length < 20) {
    errors.push(`${label}.party.independenceStatement must be substantive`)
  }
  return true
}

function validateSignature(value: unknown, errors: string[], label: string): value is ExternalSignature {
  if (!object(value)) {
    errors.push(`${label}.signature must be an object`)
    return false
  }
  if (value.algorithm !== "ed25519") errors.push(`${label}.signature.algorithm must be ed25519`)
  if (!nonEmpty(value.keyId) || !sha256Pattern.test(value.keyId)) errors.push(`${label}.signature.keyId is invalid`)
  if (!nonEmpty(value.publicKeyPem)) errors.push(`${label}.signature.publicKeyPem is required`)
  if (!validDate(value.signedAt)) errors.push(`${label}.signature.signedAt is invalid`)
  if (!nonEmpty(value.valueBase64)) errors.push(`${label}.signature.valueBase64 is required`)
  return true
}

function validateManifest(value: unknown, errors: string[]): value is AssuranceManifest {
  if (!object(value)) {
    errors.push("manifest must be an object")
    return false
  }
  if (value.schemaVersion !== ASSURANCE_MANIFEST_SCHEMA) errors.push("manifest schemaVersion is unsupported")
  if (value.projectOrganization !== "Arcana") errors.push("manifest projectOrganization must be Arcana")
  if (value.scope !== "full_platform") errors.push("manifest scope must be full_platform")
  if (!validDate(value.generatedAt)) errors.push("manifest generatedAt is invalid")
  if (!object(value.candidate)) errors.push("manifest candidate is required")
  else {
    if (!nonEmpty(value.candidate.tag) || !candidateTagPattern.test(value.candidate.tag)) {
      errors.push("manifest candidate tag is invalid")
    }
    if (!nonEmpty(value.candidate.commit) || !commitPattern.test(value.candidate.commit)) {
      errors.push("manifest candidate commit is invalid")
    }
    if (value.candidate.clean !== true) errors.push("manifest candidate must be clean")
    if (!nonEmpty(value.candidate.sourceArchiveSha256) || !sha256Pattern.test(value.candidate.sourceArchiveSha256)) {
      errors.push("manifest source archive digest is invalid")
    }
  }
  if (
    !object(value.deployment) ||
    value.deployment.name !== "hardened-linux-reference" ||
    !nonEmpty(value.deployment.manifestPath) ||
    !nonEmpty(value.deployment.sha256) ||
    !sha256Pattern.test(value.deployment.sha256)
  ) {
    errors.push("manifest deployment digest is invalid")
  }
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) errors.push("manifest artifacts are required")
  else {
    for (const [index, artifact] of value.artifacts.entries()) {
      if (
        !object(artifact) ||
        !nonEmpty(artifact.path) ||
        isAbsolute(String(artifact.path)) ||
        String(artifact.path).replaceAll("\\", "/").split("/").includes("..") ||
        !nonEmpty(artifact.sha256) ||
        !sha256Pattern.test(artifact.sha256)
      ) {
        errors.push(`manifest artifact ${index} is invalid`)
      }
    }
    const artifactPaths = new Set(value.artifacts.filter(object).map((artifact) => artifact.path))
    for (const requiredPath of ASSURANCE_REQUIRED_ARTIFACTS) {
      if (!artifactPaths.has(requiredPath)) errors.push(`manifest is missing required artifact ${requiredPath}`)
    }
  }
  if (!Array.isArray(value.requiredEnvironments) || value.requiredEnvironments.length !== 2) {
    errors.push("manifest must require exactly two reproduction environments")
  } else {
    for (const [index, environment] of value.requiredEnvironments.entries()) {
      if (
        !object(environment) ||
        !nonEmpty(environment.id) ||
        !nonEmpty(environment.platform) ||
        !nonEmpty(environment.architecture)
      ) {
        errors.push(`manifest required environment ${index} is invalid`)
      }
    }
    const environments = new Set(
      value.requiredEnvironments
        .filter(object)
        .map((environment) => `${environment.id}:${environment.platform}:${environment.architecture}`),
    )
    if (!environments.has("linux-x64:linux:x64") || !environments.has("macos-arm64:darwin:arm64")) {
      errors.push("manifest reproduction environments do not match the fixed L3 contract")
    }
  }
  if (!Array.isArray(value.requiredSuites) || value.requiredSuites.length < 2) {
    errors.push("manifest must require conformance and adversarial suites")
  } else {
    for (const [index, suite] of value.requiredSuites.entries()) {
      if (
        !object(suite) ||
        !nonEmpty(suite.id) ||
        !Array.isArray(suite.command) ||
        suite.command.length === 0 ||
        !suite.command.every(nonEmpty) ||
        typeof suite.cwd !== "string"
      ) {
        errors.push(`manifest required suite ${index} is invalid`)
      }
    }
    const suites = new Map(value.requiredSuites.filter(object).map((suite) => [suite.id, suite]))
    const conformance = suites.get("acep-1-conformance")
    const phaseC = suites.get("phase-c-adversarial")
    if (
      !object(conformance) ||
      conformance.cwd !== "." ||
      canonicalize(conformance.command) !== canonicalize(conformanceCommand)
    ) {
      errors.push("manifest ACEP-1 suite does not match the fixed L3 contract")
    }
    if (
      !object(phaseC) ||
      phaseC.cwd !== "." ||
      canonicalize(phaseC.command) !== canonicalize(phaseCAdversarialCommand) ||
      !object(phaseC.expected) ||
      phaseC.expected.unexpectedAllows !== 0 ||
      phaseC.expected.protectedExecutorCallsOnDeniedPaths !== 0
    ) {
      errors.push("manifest Phase C suite does not match the fixed L3 contract")
    }
  }
  return errors.length === 0
}

export function verifyCheckoutAgainstManifest(manifestValue: unknown, expectedCommit?: string): string[] {
  const errors: string[] = []
  const manifestErrors: string[] = []
  if (!validateManifest(manifestValue, manifestErrors)) return manifestErrors
  const manifest = manifestValue
  try {
    const commit = commandText(["git", "rev-parse", "HEAD"])
    if (commit !== manifest.candidate.commit) errors.push("checkout commit does not match assurance manifest")
    if (expectedCommit && commit !== expectedCommit) errors.push("checkout commit does not match expected commit")

    for (const args of [
      ["diff", "--quiet"],
      ["diff", "--cached", "--quiet"],
    ]) {
      const result = spawnSync("git", args, { cwd: repoRoot })
      if (result.status !== 0) errors.push("checkout has modified tracked files")
    }
    if (sourceArchiveSha256(commit) !== manifest.candidate.sourceArchiveSha256) {
      errors.push("checkout source archive digest does not match assurance manifest")
    }
    for (const artifact of manifest.artifacts) {
      try {
        const resolved = artifactPath(artifact.path)
        if (sha256File(resolved.absolutePath) !== artifact.sha256) {
          errors.push(`checkout artifact digest does not match: ${artifact.path}`)
        }
      } catch (error) {
        errors.push(`checkout artifact cannot be verified: ${artifact.path} (${String(error)})`)
      }
    }
  } catch (error) {
    errors.push(`checkout verification failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  return [...new Set(errors)]
}

function validateL3(value: unknown, errors: string[]): value is L3Attestation {
  if (!object(value)) {
    errors.push("l3 attestation must be an object")
    return false
  }
  if (value.schemaVersion !== L3_ATTESTATION_SCHEMA) errors.push("l3 schemaVersion is unsupported")
  if (!validDate(value.generatedAt)) errors.push("l3 generatedAt is invalid")
  if (value.scope !== "full_platform") errors.push("l3 scope must be full_platform")
  validateSubject(value.subject, errors, "l3")
  validateParty(value.party, errors, "l3")
  if (!Array.isArray(value.environments)) errors.push("l3 environments must be an array")
  else {
    for (const [index, environment] of value.environments.entries()) {
      if (
        !object(environment) ||
        !nonEmpty(environment.id) ||
        !nonEmpty(environment.platform) ||
        !nonEmpty(environment.architecture) ||
        !nonEmpty(environment.bun) ||
        !nonEmpty(environment.rust)
      ) {
        errors.push(`l3 environment ${index} is invalid`)
      }
    }
  }
  if (!Array.isArray(value.results)) errors.push("l3 results must be an array")
  else {
    for (const [index, result] of value.results.entries()) {
      if (
        !object(result) ||
        !nonEmpty(result.environmentId) ||
        !nonEmpty(result.suiteId) ||
        (result.status !== "passed" && result.status !== "failed") ||
        typeof result.sourceClean !== "boolean" ||
        !nonEmpty(result.reportSha256) ||
        !sha256Pattern.test(result.reportSha256)
      ) {
        errors.push(`l3 result ${index} is invalid`)
      }
    }
  }
  if (!Array.isArray(value.deviations) || !value.deviations.every((item) => typeof item === "string")) {
    errors.push("l3 deviations must be a string array")
  }
  if (!nonEmpty(value.reportSha256) || !sha256Pattern.test(value.reportSha256))
    errors.push("l3 report digest is invalid")
  if (value.conclusion !== "passed" && value.conclusion !== "failed") errors.push("l3 conclusion is invalid")
  validateSignature(value.signature, errors, "l3")
  return errors.length === 0
}

function validateL4(value: unknown, errors: string[]): value is L4Attestation {
  if (!object(value)) {
    errors.push("l4 attestation must be an object")
    return false
  }
  if (value.schemaVersion !== L4_ATTESTATION_SCHEMA) errors.push("l4 schemaVersion is unsupported")
  if (!validDate(value.generatedAt)) errors.push("l4 generatedAt is invalid")
  if (value.scope !== "full_platform") errors.push("l4 scope must be full_platform")
  validateSubject(value.subject, errors, "l4")
  validateParty(value.party, errors, "l4")
  if (!nonEmpty(value.deploymentSha256) || !sha256Pattern.test(value.deploymentSha256)) {
    errors.push("l4 deployment digest is invalid")
  }
  if (!object(value.reviews)) errors.push("l4 reviews are required")
  else {
    for (const review of ["architecture", "threatModel", "penetrationTest", "supplyChain", "remediationVerification"]) {
      if (value.reviews[review] !== "completed") errors.push(`l4 review ${review} must be completed`)
    }
  }
  if (!object(value.findings)) errors.push("l4 findings are required")
  else {
    for (const severity of ["critical", "high", "medium", "low"]) {
      const finding = value.findings[severity]
      if (
        !object(finding) ||
        !Number.isInteger(finding.total) ||
        !Number.isInteger(finding.open) ||
        (finding.total as number) < 0 ||
        (finding.open as number) < 0
      ) {
        errors.push(`l4 ${severity} finding counts are invalid`)
      }
    }
    if (!Number.isInteger(value.findings.informational) || (value.findings.informational as number) < 0) {
      errors.push("l4 informational finding count is invalid")
    }
  }
  if (value.retestCompleted !== true && value.retestCompleted !== false) errors.push("l4 retestCompleted is invalid")
  if (!Array.isArray(value.limitations) || !value.limitations.every((item) => typeof item === "string")) {
    errors.push("l4 limitations must be a string array")
  }
  if (!nonEmpty(value.reportSha256) || !sha256Pattern.test(value.reportSha256))
    errors.push("l4 report digest is invalid")
  if (value.conclusion !== "passed" && value.conclusion !== "failed") errors.push("l4 conclusion is invalid")
  validateSignature(value.signature, errors, "l4")
  return errors.length === 0
}

export function verifyAssuranceBundle(
  manifestValue: unknown,
  l3Value: unknown,
  l4Value: unknown,
  options: AssuranceVerificationOptions = {},
): AssuranceVerification {
  const errors: string[] = []
  const manifestErrors: string[] = []
  const l3Errors: string[] = []
  const l4Errors: string[] = []
  const manifestValid = validateManifest(manifestValue, manifestErrors)
  const l3Valid = validateL3(l3Value, l3Errors)
  const l4Valid = validateL4(l4Value, l4Errors)
  errors.push(...manifestErrors, ...l3Errors, ...l4Errors)
  if (!manifestValid || !l3Valid || !l4Valid) return { ok: false, errors }

  const manifest = manifestValue
  const l3 = l3Value
  const l4 = l4Value
  const manifestSha256 = assuranceManifestSha256(manifest)

  if (options.expectedCommit && manifest.candidate.commit !== options.expectedCommit) {
    errors.push(`manifest commit ${manifest.candidate.commit} does not match expected ${options.expectedCommit}`)
  }
  for (const [label, attestation] of [
    ["l3", l3],
    ["l4", l4],
  ] as const) {
    if (attestation.subject.candidateCommit !== manifest.candidate.commit) {
      errors.push(`${label} candidate commit does not match manifest`)
    }
    if (attestation.subject.candidateTag !== manifest.candidate.tag) {
      errors.push(`${label} candidate tag does not match manifest`)
    }
    if (attestation.subject.manifestSha256 !== manifestSha256) {
      errors.push(`${label} manifest digest does not match the supplied manifest`)
    }
    if (!verifyExternalSignature(attestation)) errors.push(`${label} signature is invalid`)
  }

  if (options.trustedL3KeySha256 && l3.signature.keyId !== options.trustedL3KeySha256) {
    errors.push("l3 signer key does not match the trusted reproducer key")
  }
  if (options.trustedL4KeySha256 && l4.signature.keyId !== options.trustedL4KeySha256) {
    errors.push("l4 signer key does not match the trusted assessor key")
  }
  if (l3.party.organization.trim().toLowerCase() === l4.party.organization.trim().toLowerCase()) {
    errors.push("l3 reproducer and l4 assessor must be separate organizations")
  }
  for (const [label, party] of [
    ["l3", l3.party],
    ["l4", l4.party],
  ] as const) {
    if (party.organization.trim().toLowerCase() === manifest.projectOrganization.toLowerCase()) {
      errors.push(`${label} party cannot be the Arcana project organization`)
    }
  }

  if (l3.conclusion !== "passed") errors.push("l3 conclusion must be passed")
  if (l3.deviations.length !== 0) errors.push("l3 reproduction has unexplained deviations")
  if (l3.environments.length !== manifest.requiredEnvironments.length) {
    errors.push("l3 environment set must exactly match the manifest")
  }
  const expectedResultKeys = new Set(
    manifest.requiredEnvironments.flatMap((environment) =>
      manifest.requiredSuites.map((suite) => `${environment.id}:${suite.id}`),
    ),
  )
  if (l3.results.length !== expectedResultKeys.size) errors.push("l3 result matrix must exactly match the manifest")
  const observedResultKeys = new Set<string>()
  for (const result of l3.results) {
    const key = `${result.environmentId}:${result.suiteId}`
    if (!expectedResultKeys.has(key)) errors.push(`l3 contains unexpected result ${key}`)
    if (observedResultKeys.has(key)) errors.push(`l3 contains duplicate result ${key}`)
    observedResultKeys.add(key)
  }
  for (const environment of manifest.requiredEnvironments) {
    const observed = l3.environments.find(
      (item) =>
        item.id === environment.id &&
        item.platform === environment.platform &&
        item.architecture === environment.architecture,
    )
    if (!observed) errors.push(`l3 is missing required environment ${environment.id}`)
    for (const suite of manifest.requiredSuites) {
      const result = l3.results.find((item) => item.environmentId === environment.id && item.suiteId === suite.id)
      if (!result) errors.push(`l3 is missing ${suite.id} on ${environment.id}`)
      else {
        if (result.status !== "passed") errors.push(`l3 ${suite.id} failed on ${environment.id}`)
        if (result.sourceClean !== true) errors.push(`l3 ${suite.id} did not use clean source on ${environment.id}`)
        if (!sha256Pattern.test(result.reportSha256)) errors.push(`l3 ${suite.id} report digest is invalid`)
      }
    }
  }

  if (l4.conclusion !== "passed") errors.push("l4 conclusion must be passed")
  if (l4.deploymentSha256 !== manifest.deployment.sha256) errors.push("l4 deployment digest does not match manifest")
  if (l4.retestCompleted !== true) errors.push("l4 remediation retest must be completed")
  for (const [review, status] of Object.entries(l4.reviews)) {
    if (status !== "completed") errors.push(`l4 review ${review} is not completed`)
  }
  for (const severity of ["critical", "high", "medium", "low"] as const) {
    const finding = l4.findings[severity]
    if (!object(finding) || !Number.isInteger(finding.total) || !Number.isInteger(finding.open)) {
      errors.push(`l4 ${severity} finding counts are invalid`)
      continue
    }
    if (finding.total < 0 || finding.open < 0 || finding.open > finding.total) {
      errors.push(`l4 ${severity} finding counts are inconsistent`)
    }
    if (finding.open !== 0) errors.push(`l4 has ${finding.open} open ${severity} finding(s)`)
  }

  return {
    ok: errors.length === 0,
    errors,
    candidateCommit: manifest.candidate.commit,
    candidateTag: manifest.candidate.tag,
    l3Organization: l3.party.organization,
    l4Organization: l4.party.organization,
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"))
}

function writeJson(path: string, value: unknown): string {
  const resolved = isAbsolute(path) ? path : join(process.cwd(), path)
  mkdirSync(dirname(resolved), { recursive: true })
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`)
  return relative(process.cwd(), resolved) || resolved
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index !== -1) return args[index + 1]
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

function options(args: readonly string[], name: string): string[] {
  const values: string[] = []
  for (let index = 0; index < args.length; index++) {
    if (args[index] === name && args[index + 1]) values.push(args[++index]!)
    else if (args[index]?.startsWith(`${name}=`)) values.push(args[index]!.slice(name.length + 1))
  }
  return values
}

function usage(): string {
  return [
    "Usage:",
    "  bun run assurance manifest --tag <vX.Y.Z-rc.N> --deployment <file> --output <file> [--artifact <file>]",
    "  bun run assurance sign --input <attestation.json> --private-key <ed25519.pem> --output <file>",
    "  bun run assurance verify --manifest <file> --l3 <file> --l4 <file> [--expected-commit <sha>] [--l3-key <sha256>] [--l4-key <sha256>] [--verify-checkout]",
  ].join("\n")
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const command = args[0]
  try {
    if (command === "manifest") {
      const tag = option(args, "--tag")
      const deployment = option(args, "--deployment")
      const output = option(args, "--output")
      if (!tag || !deployment || !output) throw new Error("manifest requires --tag, --deployment, and --output")
      const manifest = generateAssuranceManifest({
        tag,
        deploymentManifest: deployment,
        artifacts: options(args, "--artifact"),
      })
      console.log(`assurance manifest: ${writeJson(output, manifest)}`)
      return 0
    }
    if (command === "sign") {
      const input = option(args, "--input")
      const privateKey = option(args, "--private-key")
      const output = option(args, "--output")
      if (!input || !privateKey || !output) throw new Error("sign requires --input, --private-key, and --output")
      const unsigned = readJson(input)
      if (
        !object(unsigned) ||
        (unsigned.schemaVersion !== L3_ATTESTATION_SCHEMA && unsigned.schemaVersion !== L4_ATTESTATION_SCHEMA)
      ) {
        throw new Error("input is not an Arcana L3 or L4 attestation")
      }
      const { signature: _ignored, ...payload } = unsigned
      const signed = signExternalAttestation(
        payload as Omit<L3Attestation | L4Attestation, "signature">,
        readFileSync(privateKey, "utf8"),
      )
      console.log(`signed attestation: ${writeJson(output, signed)}`)
      return 0
    }
    if (command === "verify") {
      const manifestPath = option(args, "--manifest")
      const l3Path = option(args, "--l3")
      const l4Path = option(args, "--l4")
      if (!manifestPath || !l3Path || !l4Path) throw new Error("verify requires --manifest, --l3, and --l4")
      const manifest = readJson(manifestPath)
      const result = verifyAssuranceBundle(manifest, readJson(l3Path), readJson(l4Path), {
        expectedCommit: option(args, "--expected-commit"),
        trustedL3KeySha256: option(args, "--l3-key"),
        trustedL4KeySha256: option(args, "--l4-key"),
      })
      if (!result.ok) {
        for (const error of result.errors) console.error(`assurance: ${error}`)
        return 1
      }
      if (args.includes("--verify-checkout")) {
        const checkoutErrors = verifyCheckoutAgainstManifest(manifest, option(args, "--expected-commit"))
        if (checkoutErrors.length > 0) {
          for (const error of checkoutErrors) console.error(`assurance: ${error}`)
          return 1
        }
      }
      console.log(
        `assurance: L3 (${result.l3Organization}) and L4 (${result.l4Organization}) verified for ${result.candidateTag} ${result.candidateCommit}`,
      )
      return 0
    }
    if (command === "--help" || command === "-h" || command === undefined) {
      console.log(usage())
      return command === undefined ? 2 : 0
    }
    throw new Error(`unknown command: ${command}`)
  } catch (error) {
    console.error(`assurance: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
}

if (import.meta.main) process.exitCode = await main()
