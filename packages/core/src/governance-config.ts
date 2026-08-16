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
      enabled: true,
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

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
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

export function normalizeGovernanceConfig(input: unknown): GovernanceConfig {
  if (!isRecord(input)) return structuredClone(DEFAULT_GOVERNANCE_CONFIG)
  const display = isRecord(input.display) ? input.display : {}
  const tui = isRecord(display.tui) ? display.tui : {}
  const desktop = isRecord(display.desktop) ? display.desktop : {}
  const policy = isRecord(input.policy) ? input.policy : {}
  const approvalRoute = asApprovalRoute(policy.approvalRoute)
  const localFallbackAllowed =
    typeof policy.localFallbackAllowed === "boolean" ? policy.localFallbackAllowed : undefined

  return {
    version: 1,
    display: {
      tui: {
        enabled: asBoolean(tui.enabled, DEFAULT_GOVERNANCE_CONFIG.display.tui.enabled),
        collapseGovernanceGroups: asBoolean(
          tui.collapseGovernanceGroups,
          DEFAULT_GOVERNANCE_CONFIG.display.tui.collapseGovernanceGroups,
        ),
        collapseThreshold: Math.max(
          1,
          Math.floor(asNumber(tui.collapseThreshold, DEFAULT_GOVERNANCE_CONFIG.display.tui.collapseThreshold)),
        ),
        hideEventTypes: asStrings(tui.hideEventTypes, DEFAULT_GOVERNANCE_CONFIG.display.tui.hideEventTypes),
      },
      desktop: {
        enabled: asBoolean(desktop.enabled, DEFAULT_GOVERNANCE_CONFIG.display.desktop.enabled),
        includePrefixes: asStrings(desktop.includePrefixes, DEFAULT_GOVERNANCE_CONFIG.display.desktop.includePrefixes),
        excludePrefixes: asStrings(desktop.excludePrefixes, DEFAULT_GOVERNANCE_CONFIG.display.desktop.excludePrefixes),
      },
    },
    policy: {
      ...(approvalRoute ? { approvalRoute } : {}),
      ...(localFallbackAllowed === undefined ? {} : { localFallbackAllowed }),
    },
  }
}

function parseContent(content: string, filename: string): unknown {
  if (filename.endsWith(".json")) return JSON.parse(content)
  return parseYaml(content)
}

function mergeConfig(base: GovernanceConfig, override: GovernanceConfig): GovernanceConfig {
  const tui = override.display.tui
  const desktop = override.display.desktop
  return {
    version: 1,
    display: {
      tui: {
        enabled: tui.enabled,
        collapseGovernanceGroups: tui.collapseGovernanceGroups,
        collapseThreshold: tui.collapseThreshold,
        hideEventTypes: tui.hideEventTypes.length > 0 ? tui.hideEventTypes : base.display.tui.hideEventTypes,
      },
      desktop: {
        enabled: desktop.enabled,
        includePrefixes:
          desktop.includePrefixes.length > 0 ? desktop.includePrefixes : base.display.desktop.includePrefixes,
        excludePrefixes: desktop.excludePrefixes,
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
      config = mergeConfig(config, normalizeGovernanceConfig(parseContent(readFileSync(candidate, "utf8"), candidate)))
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
        normalizeGovernanceConfig(parseContent(readFileSync(workspacePath, "utf8"), workspacePath)),
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
  if (desktop.excludePrefixes.some((prefix) => eventType.startsWith(prefix))) return false
  return desktop.includePrefixes.some((prefix) => eventType.startsWith(prefix))
}

export function writeGovernanceConfigYaml(workspaceDir: string, config: GovernanceConfig): string {
  const directory = join(workspaceDir, ".arcana")
  mkdirSync(directory, { recursive: true })
  const path = join(directory, "governance.yml")
  writeFileSync(path, stringifyYaml(config, { lineWidth: 120 }), "utf8")
  return path
}

export * as GovernanceConfigModule from "./governance-config"
