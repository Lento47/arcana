/**
 * Runtime-owned approval routing policy loading (Phase D).
 *
 * Policy precedence:
 *   1. `<workspace>/.arcana/approval-routing.json` when present and valid
 *      (validated with a strict schema; an invalid file fails closed to the
 *      deployment default rather than guessing).
 *   2. `defaultApprovalRoutingPolicy(deploymentMode)`.
 *
 * Deployment mode precedence:
 *   1. `deploymentMode` field in the policy file (when the file exists).
 *   2. `ARCANA_DEPLOYMENT_MODE` env var.
 *   3. "LOCAL".
 */

import { Schema } from "effect"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  defaultApprovalRoutingPolicy,
  resolveApprovalRoute,
  type ApprovalRoute,
  type ApprovalRoutingInput,
  type ApprovalRoutingPolicy,
  type ApprovalRouteResolution,
  type DeploymentMode,
} from "@arcana/core/crypto/approval-routing"

export type {
  ApprovalRoute,
  ApprovalRoutingInput,
  ApprovalRoutingPolicy,
  ApprovalRouteResolution,
  DeploymentMode,
}

const RiskClassSchema = Schema.Literals(["LOW", "MODERATE", "HIGH", "CRITICAL"])
const DeploymentModeSchema = Schema.Literals(["LOCAL", "HYBRID", "ENTERPRISE"])
const ApprovalRouteSchema = Schema.Literals([
  "LOCAL_TUI",
  "DESKTOP_PREFERRED",
  "DESKTOP_REQUIRED",
  "CENTRAL_REQUIRED",
])

const SelectorSchema = Schema.Struct({
  workspace: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  action: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  capabilityId: Schema.optional(Schema.String),
  riskClass: Schema.optional(Schema.Union([RiskClassSchema, Schema.Array(RiskClassSchema)])),
  deploymentModes: Schema.optional(Schema.Array(DeploymentModeSchema)),
})

const RuleSchema = Schema.Struct({
  ...SelectorSchema.fields,
  id: Schema.String,
  route: ApprovalRouteSchema,
  localFallbackAllowed: Schema.optional(Schema.Boolean),
})

const PolicyFileSchema = Schema.Struct({
  policyVersion: Schema.String,
  defaultRoute: ApprovalRouteSchema,
  defaultLocalFallbackAllowed: Schema.Boolean,
  deploymentMode: Schema.optional(DeploymentModeSchema),
  rules: Schema.Array(RuleSchema),
})

const POLICY_FILE = ".arcana/approval-routing.json"

export function deploymentModeFromEnv(env: NodeJS.ProcessEnv = process.env): DeploymentMode {
  const value = env["ARCANA_DEPLOYMENT_MODE"]?.toUpperCase()
  return value === "HYBRID" || value === "ENTERPRISE" ? value : "LOCAL"
}

/**
 * Load the routing policy for a workspace. Falls back to the deployment
 * default when no file exists, the file is unreadable, or the file is
 * invalid. Invalid policy files fail closed to the deployment default.
 *
 * Synchronous by design: approval creation already performs synchronous
 * durable-store writes, and the policy file is small.
 */
export function loadApprovalRoutingPolicy(
  workspaceCwd: string,
  deploymentMode?: DeploymentMode,
): ApprovalRoutingPolicy {
  const mode = deploymentMode ?? deploymentModeFromEnv()
  const path = join(workspaceCwd, POLICY_FILE)
  if (!existsSync(path)) return defaultApprovalRoutingPolicy(mode)

  try {
    const raw = readFileSync(path, "utf8")
    if (raw.trim() === "") return defaultApprovalRoutingPolicy(mode)
    const parsed = JSON.parse(raw) as unknown
    const decoded = Schema.decodeUnknownSync(PolicyFileSchema)(parsed)
    const fileMode = decoded.deploymentMode ?? mode
    return {
      policyVersion: decoded.policyVersion,
      defaultRoute: decoded.defaultRoute,
      defaultLocalFallbackAllowed: decoded.defaultLocalFallbackAllowed,
      rules: decoded.rules,
    }
  } catch {
    return defaultApprovalRoutingPolicy(mode)
  }
}

export { resolveApprovalRoute }
