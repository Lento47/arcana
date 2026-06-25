// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"
import { RequiredControl, RiskAssessment } from "./action"

export const SecurityAsset = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(["auth", "secret", "user_data", "payment", "network", "filesystem", "dependency", "runtime", "unknown"]),
  path: Schema.optional(Schema.String),
  reason: Schema.String,
})
export type SecurityAsset = typeof SecurityAsset.Type

export const TrustBoundary = Schema.Struct({
  name: Schema.String,
  from: Schema.String,
  to: Schema.String,
  reason: Schema.String,
})
export type TrustBoundary = typeof TrustBoundary.Type

export const DangerousCapability = Schema.Literals([
  "shell",
  "network",
  "file_write",
  "secret_read",
  "dependency_change",
  "permission_change",
  "auth_change",
  "destructive_operation",
])
export type DangerousCapability = typeof DangerousCapability.Type

export const SecurityContext = Schema.Struct({
  touched_assets: Schema.Array(SecurityAsset),
  trust_boundaries: Schema.Array(TrustBoundary),
  sensitive_paths: Schema.Array(Schema.String),
  dangerous_capabilities: Schema.Array(DangerousCapability),
  threat_model_required: Schema.Boolean,
  security_tests_required: Schema.Boolean,
  required_controls: Schema.Array(RequiredControl),
})
export type SecurityContext = typeof SecurityContext.Type

const authPatterns = [/auth/i, /session/i, /token/i, /jwt/i, /oauth/i, /saml/i, /cookie/i]
const secretPatterns = [/\.env/i, /secret/i, /credential/i, /private[_-]?key/i, /api[_-]?key/i]
const dependencyPatterns = [/package\.json$/i, /bun\.lock/i, /package-lock\.json$/i, /pnpm-lock\.yaml$/i, /yarn\.lock$/i]
const permissionPatterns = [/permission/i, /policy/i, /rbac/i, /acl/i, /allowlist/i]

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

export function inferSecurityContext(input: {
  paths?: string[]
  action_names?: string[]
  risk?: RiskAssessment
}): SecurityContext {
  const paths = input.paths ?? []
  const names = input.action_names ?? []
  const haystack = [...paths, ...names].join("\n")

  const touched_assets: SecurityAsset[] = []
  const dangerous_capabilities: DangerousCapability[] = []
  const required_controls: RequiredControl[] = [...(input.risk?.required_controls ?? [])]

  for (const path of paths) {
    if (authPatterns.some((pattern) => pattern.test(path))) {
      touched_assets.push({ name: path, kind: "auth", path, reason: "Path appears to touch authentication or session state." })
      dangerous_capabilities.push("auth_change")
      required_controls.push("verifier", "human_review")
    }
    if (secretPatterns.some((pattern) => pattern.test(path))) {
      touched_assets.push({ name: path, kind: "secret", path, reason: "Path appears to contain secrets or credentials." })
      dangerous_capabilities.push("secret_read")
      required_controls.push("approval", "human_review")
    }
    if (dependencyPatterns.some((pattern) => pattern.test(path))) {
      touched_assets.push({ name: path, kind: "dependency", path, reason: "Path changes dependency or lockfile state." })
      dangerous_capabilities.push("dependency_change")
      required_controls.push("verifier")
    }
    if (permissionPatterns.some((pattern) => pattern.test(path))) {
      touched_assets.push({ name: path, kind: "auth", path, reason: "Path appears to alter authorization or policy behavior." })
      dangerous_capabilities.push("permission_change")
      required_controls.push("verifier", "human_review")
    }
  }

  if (/\b(curl|wget|ssh|scp|nc|ncat)\b/i.test(haystack)) {
    dangerous_capabilities.push("network")
    required_controls.push("approval", "sandbox")
  }

  if (/\b(rm\s+-rf|git\s+reset\s+--hard|git\s+clean\s+-fd|chmod\s+-R|chown\s+-R)\b/i.test(haystack)) {
    dangerous_capabilities.push("destructive_operation")
    required_controls.push("approval", "checkpoint", "human_review")
  }

  const sensitive_paths = paths.filter((path) => secretPatterns.some((pattern) => pattern.test(path)))
  const hasSecuritySensitiveWork = touched_assets.length > 0 || dangerous_capabilities.length > 0

  return {
    touched_assets,
    trust_boundaries: dangerous_capabilities.includes("network")
      ? [{ name: "local_to_network", from: "local_runtime", to: "external_network", reason: "Action may communicate outside the local project boundary." }]
      : [],
    sensitive_paths,
    dangerous_capabilities: unique(dangerous_capabilities),
    threat_model_required: hasSecuritySensitiveWork,
    security_tests_required: dangerous_capabilities.some((capability) =>
      capability === "auth_change" || capability === "permission_change" || capability === "dependency_change",
    ),
    required_controls: unique(required_controls),
  }
}
