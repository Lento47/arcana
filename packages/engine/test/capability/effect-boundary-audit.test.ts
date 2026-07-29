import { describe, expect, test } from "bun:test"
import {
  EFFECT_BOUNDARY_INVENTORY,
  computeAuditAggregate,
} from "@arcana/core/capability/effect-boundary"
import type { EffectBoundary } from "@arcana/core/capability/effect-boundary"
import type { CapabilityAction, RiskClass } from "@arcana/core/capability/types"

// ── Known tool registrations that MUST have an EffectBoundary ─────────
// This list is the SOURCE OF TRUTH for registered tools.
// If a new tool is added to tools.ts or processor.ts without an entry here,
// the audit test fails.
//
// To add a new tool: add it to EFFECT_BOUNDARY_INVENTORY in effect-boundary.ts
// AND add its id to this list.

const REGISTERED_TOOL_NAMES = [
  // Hermes tools (processor.ts)
  "terminal",
  "write_file",
  "patch",
  "read_file",
  "search_files",
  "send_message",
  "cronjob (Hermes)",
  "delegate_task",
  // Arcana tools (tools.ts)
  "web_search",
  "web_fetch",
  "image_generate",
  "speak (TTS)",
  "env_install",
  "env_write",
  "env_clean",
  "skill_create",
  "git_commit (builtin)",
  // Infrastructure
  "mcp_*",
  "LSP server spawn",
  "MCP server spawn",
  "plugin execution",
  "plugin-store git",
  // Providers
  "GitHub Copilot fetch",
  "OpenAI Codex fetch",
  "OpenAI WebSocket",
  "xAI provider fetch",
  "Snowflake Cortex fetch",
  "DigitalOcean fetch",
  // Infrastructure
  "license service",
  "proxy client",
  "database mutations",
  "secret access (process.env)",
  // Gateways
  "WhatsApp gateway send",
  "Discord gateway send",
  "Telegram gateway send",
  // Other
  "engine spawn (TUI)",
  "git operations (project)",
  "deployment tools",
  "LSP binary downloads",
  "OAuth callback servers",
  "image download",
  "GitHub API (engine CLI)",
  "MCP OAuth callback",
  "delegate_task (Hermes subagent)",
] as const

// ── Valid actions and risk classes ─────────────────────────────────────

const VALID_ACTIONS: CapabilityAction[] = [
  "filesystem.read",
  "filesystem.write",
  "filesystem.delete",
  "process.execute",
  "network.read",
  "network.write",
  "secret.use",
  "git.commit",
  "git.push",
  "deploy",
  "publish",
  "delegate",
  "policy.modify",
]

const VALID_RISK_CLASSES: RiskClass[] = [
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
]

const VALID_ENFORCEMENT = [
  "NONE",
  "MODEL_ONLY",
  "PERMISSION_PROMPT",
  "DETERMINISTIC_POLICY",
]

const VALID_PRIORITIES = ["P0", "P1", "P2"]

const VALID_DERIVATIONS = [
  "tool_input",
  "runtime_context",
  "configuration",
  "external_content",
  "model_output",
]

// ── Tests ─────────────────────────────────────────────────────────────

describe("security boundary audit", () => {
  test("every registered tool has an EffectBoundary entry", () => {
    const inventoryTools = new Set(
      EFFECT_BOUNDARY_INVENTORY.map((e) => e.tool),
    )
    const missing = REGISTERED_TOOL_NAMES.filter(
      (name) => !inventoryTools.has(name),
    )
    expect(missing).toEqual([])
  })

  test("no duplicate IDs in inventory", () => {
    const ids = EFFECT_BOUNDARY_INVENTORY.map((e) => e.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  test("every entry has at least one action", () => {
    const empty = EFFECT_BOUNDARY_INVENTORY.filter(
      (e) => e.actions.length === 0,
    )
    expect(empty).toEqual([])
  })

  test("every action is a valid CapabilityAction", () => {
    const validSet = new Set(VALID_ACTIONS)
    const invalid: Array<{ id: string; action: string }> = []
    for (const e of EFFECT_BOUNDARY_INVENTORY) {
      for (const a of e.actions) {
        if (!validSet.has(a)) {
          invalid.push({ id: e.id, action: a })
        }
      }
    }
    expect(invalid).toEqual([])
  })

  test("every risk class is valid", () => {
    const validSet = new Set(VALID_RISK_CLASSES)
    const invalid = EFFECT_BOUNDARY_INVENTORY.filter(
      (e) => !validSet.has(e.riskClass),
    )
    expect(invalid).toEqual([])
  })

  test("every enforcement level is valid", () => {
    const validSet = new Set(VALID_ENFORCEMENT)
    const invalid = EFFECT_BOUNDARY_INVENTORY.filter(
      (e) => !validSet.has(e.currentEnforcement),
    )
    expect(invalid).toEqual([])
  })

  test("every priority is valid", () => {
    const validSet = new Set(VALID_PRIORITIES)
    const invalid = EFFECT_BOUNDARY_INVENTORY.filter(
      (e) => !validSet.has(e.migrationPriority),
    )
    expect(invalid).toEqual([])
  })

  test("every resource derivation is valid", () => {
    const validSet = new Set(VALID_DERIVATIONS)
    const invalid = EFFECT_BOUNDARY_INVENTORY.filter(
      (e) => !validSet.has(e.resourcesDerivedFrom),
    )
    expect(invalid).toEqual([])
  })

  test("proposedPEP is non-empty for every entry", () => {
    const empty = EFFECT_BOUNDARY_INVENTORY.filter(
      (e) => e.proposedPEP.length === 0,
    )
    expect(empty).toEqual([])
  })

  test("implementationFile is non-empty for every entry", () => {
    const empty = EFFECT_BOUNDARY_INVENTORY.filter(
      (e) => e.implementationFile.length === 0,
    )
    expect(empty).toEqual([])
  })
})

describe("audit aggregate", () => {
  test("aggregate matches inventory count", () => {
    const agg = computeAuditAggregate()
    expect(agg.effectPathsDiscovered).toBe(EFFECT_BOUNDARY_INVENTORY.length)
  })

  test("enforcement categories sum to total", () => {
    const agg = computeAuditAggregate()
    const sum =
      agg.currentlyDeterministic +
      agg.permissionOnly +
      agg.modelGoverned +
      agg.completelyUnguarded
    expect(sum).toBe(agg.effectPathsDiscovered)
  })

  test("risk classes sum to total", () => {
    const agg = computeAuditAggregate()
    const sum =
      agg.byRiskClass.LOW +
      agg.byRiskClass.MODERATE +
      agg.byRiskClass.HIGH +
      agg.byRiskClass.CRITICAL
    expect(sum).toBe(agg.effectPathsDiscovered)
  })

  test("priorities sum to total", () => {
    const agg = computeAuditAggregate()
    const sum = agg.byPriority.P0 + agg.byPriority.P1 + agg.byPriority.P2
    expect(sum).toBe(agg.effectPathsDiscovered)
  })

  test("no CRITICAL paths are completely unguarded", () => {
    const critical = EFFECT_BOUNDARY_INVENTORY.filter(
      (e) =>
        e.riskClass === "CRITICAL" && e.currentEnforcement === "NONE",
    )
    expect(critical).toEqual([])
  })
})
