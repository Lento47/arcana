// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

export const ARCANA_SECURITY_ASSETS = [
  "source_code",
  "secret",
  "credential",
  "dependency_manifest",
  "lockfile",
  "auth",
  "billing",
  "crypto",
  "serialization",
  "upload_download",
  "network",
  "infrastructure",
  "ci_cd",
  "container",
  "model_route",
  "user_data",
] as const

export type ArcanaSecurityAsset = (typeof ARCANA_SECURITY_ASSETS)[number]

export const ARCANA_TRUST_BOUNDARIES = [
  "local_filesystem",
  "shell",
  "network",
  "mcp",
  "model_provider",
  "cloud",
  "git_remote",
  "ci_runner",
  "container_runtime",
  "secret_store",
] as const

export type ArcanaTrustBoundary = (typeof ARCANA_TRUST_BOUNDARIES)[number]

export const ARCANA_DANGEROUS_CAPABILITIES = [
  "read_secret",
  "write_file",
  "delete_file",
  "execute_shell",
  "network_egress",
  "modify_dependency",
  "modify_auth",
  "modify_billing",
  "modify_crypto",
  "modify_ci",
  "modify_infrastructure",
  "publish_artifact",
  "change_permissions",
  "external_process",
] as const

export type ArcanaDangerousCapability = (typeof ARCANA_DANGEROUS_CAPABILITIES)[number]

export const ARCANA_SECURITY_CONTROLS = [
  "approval",
  "checkpoint",
  "diff",
  "verifier",
  "human_review",
  "sandbox",
  "redaction",
  "sbom_scan",
  "sarif_scan",
  "osv_scan",
  "provenance",
  "policy_exception",
  "rollback",
] as const

export type ArcanaSecurityControl = (typeof ARCANA_SECURITY_CONTROLS)[number]

export type ArcanaSecurityRisk = "low" | "medium" | "high" | "critical"

export type ArcanaSecurityContextInput = {
  readonly action_kind: "model" | "tool" | "mcp" | "shell" | "file_read" | "file_write" | "network" | "provider"
  readonly paths?: readonly string[]
  readonly command?: string
  readonly network_egress?: boolean
  readonly uses_secret?: boolean
  readonly modifies_dependencies?: boolean
  readonly modifies_auth?: boolean
  readonly modifies_infrastructure?: boolean
  readonly model_provider?: string
}

export type ArcanaSecurityContext = {
  readonly assets: readonly ArcanaSecurityAsset[]
  readonly trust_boundaries: readonly ArcanaTrustBoundary[]
  readonly dangerous_capabilities: readonly ArcanaDangerousCapability[]
  readonly required_controls: readonly ArcanaSecurityControl[]
  readonly risk: ArcanaSecurityRisk
  readonly reasons: readonly string[]
}

function addUnique<T>(items: T[], value: T): void {
  if (!items.includes(value)) items.push(value)
}

function pathLooksLikeSecret(path: string): boolean {
  const normalized = path.toLowerCase()
  return (
    normalized.endsWith(".env") ||
    normalized.includes("/.env.") ||
    normalized.includes("secret") ||
    normalized.includes("credential") ||
    normalized.includes("token") ||
    normalized.includes("keychain")
  )
}

function pathLooksLikeDependency(path: string): boolean {
  const filename = path.toLowerCase().split("/").pop() ?? path.toLowerCase()
  return [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "requirements.txt",
    "pyproject.toml",
    "uv.lock",
    "cargo.toml",
    "cargo.lock",
    "go.mod",
    "go.sum",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "gradle.lockfile",
  ].includes(filename)
}

function pathLooksLikeAuth(path: string): boolean {
  const normalized = path.toLowerCase()
  return normalized.includes("auth") || normalized.includes("session") || normalized.includes("jwt") || normalized.includes("oauth")
}

function pathLooksLikeBilling(path: string): boolean {
  const normalized = path.toLowerCase()
  return normalized.includes("billing") || normalized.includes("payment") || normalized.includes("invoice") || normalized.includes("checkout")
}

function pathLooksLikeCrypto(path: string): boolean {
  const normalized = path.toLowerCase()
  return normalized.includes("crypto") || normalized.includes("cipher") || normalized.includes("wallet") || normalized.includes("signature")
}

function pathLooksLikeUploadDownload(path: string): boolean {
  const normalized = path.toLowerCase()
  return normalized.includes("upload") || normalized.includes("download") || normalized.includes("multipart") || normalized.includes("blob")
}

function pathLooksLikeInfrastructure(path: string): boolean {
  const normalized = path.toLowerCase()
  return (
    normalized.includes("terraform") ||
    normalized.endsWith(".tf") ||
    normalized.includes("k8s") ||
    normalized.includes("kubernetes") ||
    normalized.includes("helm") ||
    normalized.includes("dockerfile") ||
    normalized.includes("compose.yaml") ||
    normalized.includes("compose.yml")
  )
}

function pathLooksLikeCI(path: string): boolean {
  const normalized = path.toLowerCase()
  return normalized.includes(".github/workflows") || normalized.includes(".gitlab-ci") || normalized.includes("ci/")
}

function commandLooksDestructive(command: string): boolean {
  const normalized = command.toLowerCase()
  return /(^|\s)(rm\s+-rf|rm\s+-r|chmod\s+-r|chown\s+-r|git\s+reset\s+--hard|git\s+clean\s+-fd|kubectl\s+delete|terraform\s+destroy)(\s|$)/.test(normalized)
}

export function deriveSecurityContext(input: ArcanaSecurityContextInput): ArcanaSecurityContext {
  const assets: ArcanaSecurityAsset[] = []
  const trustBoundaries: ArcanaTrustBoundary[] = []
  const capabilities: ArcanaDangerousCapability[] = []
  const controls: ArcanaSecurityControl[] = []
  const reasons: string[] = []

  addUnique(assets, "source_code")

  if (input.action_kind === "shell") {
    addUnique(trustBoundaries, "shell")
    addUnique(capabilities, "execute_shell")
    addUnique(controls, "sandbox")
  }

  if (input.action_kind === "mcp") {
    addUnique(trustBoundaries, "mcp")
    addUnique(capabilities, "external_process")
    addUnique(controls, "sandbox")
  }

  if (input.action_kind === "provider") {
    addUnique(assets, "model_route")
    addUnique(trustBoundaries, "model_provider")
    reasons.push("model/provider route affects AI sovereignty and must be visible")
  }

  if (input.network_egress || input.action_kind === "network") {
    addUnique(assets, "network")
    addUnique(trustBoundaries, "network")
    addUnique(capabilities, "network_egress")
    addUnique(controls, "approval")
    reasons.push("network egress crosses local trust boundary")
  }

  if (input.uses_secret) {
    addUnique(assets, "secret")
    addUnique(assets, "credential")
    addUnique(trustBoundaries, "secret_store")
    addUnique(capabilities, "read_secret")
    addUnique(controls, "approval")
    addUnique(controls, "redaction")
    addUnique(controls, "human_review")
    reasons.push("secret or credential access requires explicit user control")
  }

  for (const path of input.paths ?? []) {
    if (pathLooksLikeSecret(path)) {
      addUnique(assets, "secret")
      addUnique(assets, "credential")
      addUnique(capabilities, "read_secret")
      addUnique(controls, "approval")
      addUnique(controls, "redaction")
      addUnique(controls, "human_review")
      reasons.push(`sensitive path detected: ${path}`)
    }

    if (pathLooksLikeDependency(path)) {
      addUnique(assets, "dependency_manifest")
      if (path.toLowerCase().includes("lock")) addUnique(assets, "lockfile")
      addUnique(capabilities, "modify_dependency")
      addUnique(controls, "sbom_scan")
      addUnique(controls, "osv_scan")
      addUnique(controls, "verifier")
      reasons.push(`dependency surface detected: ${path}`)
    }

    if (pathLooksLikeAuth(path)) {
      addUnique(assets, "auth")
      addUnique(capabilities, "modify_auth")
      addUnique(controls, "verifier")
      addUnique(controls, "human_review")
      reasons.push(`authentication surface detected: ${path}`)
    }

    if (pathLooksLikeBilling(path)) {
      addUnique(assets, "billing")
      addUnique(capabilities, "modify_billing")
      addUnique(controls, "verifier")
      addUnique(controls, "human_review")
      reasons.push(`billing/payment surface detected: ${path}`)
    }

    if (pathLooksLikeCrypto(path)) {
      addUnique(assets, "crypto")
      addUnique(capabilities, "modify_crypto")
      addUnique(controls, "verifier")
      addUnique(controls, "human_review")
      reasons.push(`cryptographic surface detected: ${path}`)
    }

    if (pathLooksLikeUploadDownload(path)) {
      addUnique(assets, "upload_download")
      addUnique(controls, "sarif_scan")
      addUnique(controls, "verifier")
      reasons.push(`upload/download surface detected: ${path}`)
    }

    if (pathLooksLikeInfrastructure(path)) {
      addUnique(assets, "infrastructure")
      addUnique(trustBoundaries, "cloud")
      addUnique(trustBoundaries, "container_runtime")
      addUnique(capabilities, "modify_infrastructure")
      addUnique(controls, "approval")
      addUnique(controls, "checkpoint")
      addUnique(controls, "rollback")
      addUnique(controls, "human_review")
      reasons.push(`infrastructure surface detected: ${path}`)
    }

    if (pathLooksLikeCI(path)) {
      addUnique(assets, "ci_cd")
      addUnique(trustBoundaries, "ci_runner")
      addUnique(capabilities, "modify_ci")
      addUnique(controls, "approval")
      addUnique(controls, "verifier")
      reasons.push(`CI/CD surface detected: ${path}`)
    }
  }

  if (input.action_kind === "file_write") {
    addUnique(trustBoundaries, "local_filesystem")
    addUnique(capabilities, "write_file")
    addUnique(controls, "checkpoint")
    addUnique(controls, "rollback")
  }

  if (input.modifies_dependencies) {
    addUnique(assets, "dependency_manifest")
    addUnique(capabilities, "modify_dependency")
    addUnique(controls, "sbom_scan")
    addUnique(controls, "osv_scan")
    addUnique(controls, "verifier")
    reasons.push("dependency mutation requested")
  }

  if (input.modifies_auth) {
    addUnique(assets, "auth")
    addUnique(capabilities, "modify_auth")
    addUnique(controls, "human_review")
    addUnique(controls, "verifier")
    reasons.push("authentication mutation requested")
  }

  if (input.modifies_infrastructure) {
    addUnique(assets, "infrastructure")
    addUnique(capabilities, "modify_infrastructure")
    addUnique(controls, "approval")
    addUnique(controls, "checkpoint")
    addUnique(controls, "rollback")
    addUnique(controls, "human_review")
    reasons.push("infrastructure mutation requested")
  }

  if (input.command && commandLooksDestructive(input.command)) {
    addUnique(capabilities, "delete_file")
    addUnique(controls, "approval")
    addUnique(controls, "checkpoint")
    addUnique(controls, "rollback")
    addUnique(controls, "human_review")
    reasons.push("destructive shell command detected")
  }

  const risk = assessSecurityRisk({ assets, dangerous_capabilities: capabilities, required_controls: controls })

  return {
    assets,
    trust_boundaries: trustBoundaries,
    dangerous_capabilities: capabilities,
    required_controls: controls,
    risk,
    reasons: reasons.length > 0 ? reasons : ["no elevated security surface detected"],
  }
}

export function assessSecurityRisk(input: Pick<ArcanaSecurityContext, "assets" | "dangerous_capabilities" | "required_controls">): ArcanaSecurityRisk {
  if (input.required_controls.includes("human_review")) return "critical"
  if (input.assets.includes("secret") || input.dangerous_capabilities.includes("delete_file")) return "critical"
  if (
    input.assets.includes("auth") ||
    input.assets.includes("billing") ||
    input.assets.includes("crypto") ||
    input.assets.includes("infrastructure") ||
    input.dangerous_capabilities.includes("network_egress")
  ) return "high"
  if (input.assets.includes("dependency_manifest") || input.dangerous_capabilities.includes("execute_shell")) return "medium"
  return "low"
}

export function securityContextRequiresHumanReview(context: ArcanaSecurityContext): boolean {
  return context.required_controls.includes("human_review") || context.risk === "critical"
}

export function securityContextBlocksAutoApply(context: ArcanaSecurityContext): boolean {
  return context.risk === "high" || context.risk === "critical" || context.required_controls.includes("approval")
}
