/**
 * F12: Commercial readiness.
 *
 * Licensing/entitlements, usage metering that can NEVER affect security
 * decisions, redacted support diagnostics, and upgrade/migration policy.
 * Metering is observability-only: an outage or overage must not change an
 * authorization outcome.
 */

export type LicenseTier = "COMMUNITY" | "TEAM" | "ENTERPRISE"

export type Feature =
  | "local_runtime"
  | "shared_policy"
  | "shared_approvals"
  | "fleet_control"
  | "sso"
  | "federation"
  | "compliance_exports"

const TIER_FEATURES: Record<LicenseTier, ReadonlySet<Feature>> = {
  COMMUNITY: new Set(["local_runtime"]),
  TEAM: new Set(["local_runtime", "shared_policy", "shared_approvals"]),
  ENTERPRISE: new Set([
    "local_runtime",
    "shared_policy",
    "shared_approvals",
    "fleet_control",
    "sso",
    "federation",
    "compliance_exports",
  ]),
}

export function entitled(tier: LicenseTier, feature: Feature): boolean {
  return TIER_FEATURES[tier].has(feature)
}

/**
 * Metering is strictly observability: its failure or overage never changes a
 * security decision. The function exists to make that invariant explicit and
 * testable.
 */
export function meteringNeverAffectsDecision(
  decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL",
  _meteringStatus: { ok: boolean; overQuota?: boolean },
): "ALLOW" | "DENY" | "REQUIRE_APPROVAL" {
  return decision
}

export type Diagnostics = {
  version: string
  runtime: Record<string, string>
  config: Record<string, string>
  logs: string[]
}

/**
 * Redact secrets from diagnostics before export. Any value containing a
 * secret fragment (or a config key marked secret) is replaced.
 */
export function redactDiagnostics(
  diagnostics: Diagnostics,
  secretFragments: readonly string[],
): Diagnostics {
  const redact = (value: string): string =>
    secretFragments.reduce(
      (current, fragment) =>
        fragment.length > 0 ? current.split(fragment).join("[REDACTED]") : current,
      value,
    )

  return {
    version: diagnostics.version,
    runtime: Object.fromEntries(Object.entries(diagnostics.runtime).map(([k, v]) => [k, redact(v)])),
    config: Object.fromEntries(
      Object.entries(diagnostics.config).map(([k, v]) => [
        k,
        /secret|token|key|password/i.test(k) ? "[REDACTED]" : redact(v),
      ]),
    ),
    logs: diagnostics.logs.map(redact),
  }
}

export type UpgradePolicy = {
  supportedFrom: string
  breakingChangesRequire: "major_version" | "migration_runbook"
  rollbackAllowed: boolean
}

export const DEFAULT_UPGRADE_POLICY: UpgradePolicy = {
  supportedFrom: "0.3.x",
  breakingChangesRequire: "migration_runbook",
  rollbackAllowed: true,
}
