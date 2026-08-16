import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import type { ApprovalRoute } from "./crypto/approval-routing"

export type GovernanceConfig = {
  version: 1
  display: {
    tui: {
      enabled: boolean
      collapseGovernanceGroups: boolean
      collapseThreshold: number
      hideEventTypes: string[]
    }
    desktop: {
      enabled: boolean
      includePrefixes: string[]
      excludePrefixes: string[]
    }
  }
  policy: {
    approvalRoute?: ApprovalRoute
    localFallbackAllowed?: boolean
  }
}

export type LoadedGovernanceConfig = {
  config: GovernanceConfig
  path?: string
}

export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  version: 1,
  display: {
    tui: {
      // Governance noise belongs in Arcana Desktop, not the conversation
      // spine. Operators can re-enable TUI rows explicitly; the desktop
      // stream remains enabled independently.
      enabled: false,
      collapseGovernanceGroups: true,
      collapseThreshold: 12,
      hideEventTypes: ["authorization.executed", "verification.recorded"],
    },
    desktop: {
      enabled: true,
      includePrefixes: [
        "contract.",
        "claim.",
        "evidence.",
        "obligation.",
        "completion.",
        "intent.",
        "authorization.",
        "capability.",
        "verification.",
      ],
      excludePrefixes: [],
    },
  },
  policy: {},
}

const FILE_NAMES = ["governance.yml", "governance.yaml", "governance.json"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

type GovernanceOverride = {
  display: {
    tui: {
      enabled?: boolean
      collapseGovernanceGroups?: boolean
      collapseThreshold?: number
      hideEventTypes?: string[]
    }
    desktop: {
      enabled?: boolean
      includePrefixes?: string[]
      excludePrefixes?: string[]
    }
  }
  policy: {
    approvalRoute?: ApprovalRoute
    localFallbackAllowed?: boolean
  }
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function optionalThreshold(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.max(1, Math.floor(value))
}

function optionalStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === "string" && item.length > 0)
}

function asApprovalRoute(value: unknown): ApprovalRoute | undefined {
  return value === "LOCAL_TUI" ||
    value === "DESKTOP_PREFERRED" ||
    value === "DESKTOP_REQUIRED" ||
    value === "CENTRAL_REQUIRED"
    ? value
    : undefined
}

function parseGovernanceOverride(input: unknown): GovernanceOverride {
  if (!isRecord(input)) {
    return { display: { tui: {}, desktop: {} }, policy: {} }
  }
  const display = isRecord(input.display) ? input.display : {}
  const tui = isRecord(display.tui) ? display.tui : {}
  const desktop = isRecord(display.desktop) ? display.desktop : {}
  const policy = isRecord(input.policy) ? input.policy : {}

  return {
    display: {
      tui: {
        enabled: optionalBoolean(tui.enabled),
        collapseGovernanceGroups: optionalBoolean(tui.collapseGovernanceGroups),
        collapseThreshold: optionalThreshold(tui.collapseThreshold),
        hideEventTypes: optionalStrings(tui.hideEventTypes),
      },
      desktop: {
        enabled: optionalBoolean(desktop.enabled),
        includePrefixes: optionalStrings(desktop.includePrefixes),
        excludePrefixes: optionalStrings(desktop.excludePrefixes),
      },
    },
    policy: {
      approvalRoute: asApprovalRoute(policy.approvalRoute),
      localFallbackAllowed:
        typeof policy.localFallbackAllowed === "boolean" ? policy.localFallbackAllowed : undefined,
    },
  }
}

/** Parse and normalize to a complete concrete config against defaults. */
export function normalizeGovernanceConfig(input: unknown): GovernanceConfig {
  return mergeConfig(DEFAULT_GOVERNANCE_CONFIG, parseGovernanceOverride(input))
}

/** Merge a parsed partial update over an existing config without overwriting omitted fields. */
export function resolveGovernanceConfig(base: GovernanceConfig, input: unknown): GovernanceConfig {
  return mergeConfig(base, parseGovernanceOverride(input))
}

function parseContent(content: string, filename: string): unknown {
  if (filename.endsWith(".json")) return JSON.parse(content)
  return parseYaml(content)
}

function mergeConfig(base: GovernanceConfig, override: GovernanceOverride): GovernanceConfig {
  const tui = override.display.tui
  const desktop = override.display.desktop
  return {
    version: 1,
    display: {
      tui: {
        enabled: tui.enabled ?? base.display.tui.enabled,
        collapseGovernanceGroups:
          tui.collapseGovernanceGroups ?? base.display.tui.collapseGovernanceGroups,
        collapseThreshold: tui.collapseThreshold ?? base.display.tui.collapseThreshold,
        // Empty is an explicit "show everything / hide nothing" choice and
        // must not be silently replaced with the default suppression list.
        hideEventTypes: tui.hideEventTypes ?? [...base.display.tui.hideEventTypes],
      },
      desktop: {
        enabled: desktop.enabled ?? base.display.desktop.enabled,
        // Empty is an explicit "forward nothing" choice.
        includePrefixes:
          desktop.includePrefixes ?? [...base.display.desktop.includePrefixes],
        excludePrefixes:
          desktop.excludePrefixes ?? [...base.display.desktop.excludePrefixes],
      },
    },
    policy: {
      approvalRoute: override.policy.approvalRoute ?? base.policy.approvalRoute,
      localFallbackAllowed: override.policy.localFallbackAllowed ?? base.policy.localFallbackAllowed,
    },
  }
}

export function governanceConfigPath(workspaceDir: string): string | undefined {
  for (const name of FILE_NAMES) {
    const candidate = join(workspaceDir, ".arcana", name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

export function loadGovernanceConfig(workspaceDir: string, globalDir?: string): LoadedGovernanceConfig {
  let config = structuredClone(DEFAULT_GOVERNANCE_CONFIG)
  let path: string | undefined

  const globalCandidates = globalDir ? FILE_NAMES.map((name) => join(globalDir, name)) : []
  for (const candidate of globalCandidates) {
    if (!existsSync(candidate)) continue
    try {
      config = mergeConfig(config, parseGovernanceOverride(parseContent(readFileSync(candidate, "utf8"), candidate)))
      path = candidate
    } catch {
      // Invalid global config is advisory only; keep the last valid config.
    }
  }

  const workspacePath = governanceConfigPath(workspaceDir)
  if (workspacePath) {
    try {
      config = mergeConfig(
        config,
        parseGovernanceOverride(parseContent(readFileSync(workspacePath, "utf8"), workspacePath)),
      )
      path = workspacePath
    } catch {
      // Invalid workspace config is fail-visible but non-fatal.
    }
  }

  return { config, path }
}

export function shouldShowGovernanceEvent(config: GovernanceConfig, eventType: string): boolean {
  const tui = config.display.tui
  if (!tui.enabled) return false
  return !tui.hideEventTypes.some(
    (pattern) => eventType === pattern || (pattern.endsWith("*") && eventType.startsWith(pattern.slice(0, -1))),
  )
}

export function shouldForwardGovernanceEventToDesktop(config: GovernanceConfig, eventType: string): boolean {
  const desktop = config.display.desktop
  if (!desktop.enabled) return false
  const matches = (pattern: string) =>
    pattern === "*"
      || eventType === pattern
      || (pattern.endsWith("*") && eventType.startsWith(pattern.slice(0, -1)))
      || eventType.startsWith(pattern)
  if (desktop.excludePrefixes.some(matches)) return false
  return desktop.includePrefixes.some(matches)
}

export function writeGovernanceConfigYaml(workspaceDir: string, config: GovernanceConfig): string {
  const directory = join(workspaceDir, ".arcana")
  mkdirSync(directory, { recursive: true })
  const path = join(directory, "governance.yml")
  writeFileSync(path, stringifyYaml(config, { lineWidth: 120 }), "utf8")
  return path
}

export * as GovernanceConfigModule from "./governance-config"
