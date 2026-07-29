/**
 * Phase C Task 1: Security-Boundary Audit
 *
 * Machine-readable inventory of every effectful path in Arcana.
 *
 * Audit rule: Not only registered tools — raw primitives included.
 * A hidden direct call is more dangerous than an obviously effectful tool.
 */

import type { CapabilityAction, RiskClass } from "./types"

// ─── Effect Boundary ──────────────────────────────────────────────────

export type EnforcementLevel =
  | "NONE"
  | "MODEL_ONLY"
  | "PERMISSION_PROMPT"
  | "DETERMINISTIC_POLICY"

export type ResourceDerivation =
  | "tool_input"
  | "runtime_context"
  | "configuration"
  | "external_content"

export type MigrationPriority = "P0" | "P1" | "P2"

export interface EffectBoundary {
  id: string
  tool: string
  implementationFile: string
  entryFunction: string

  actions: CapabilityAction[]
  riskClass: RiskClass

  resourcesDerivedFrom: ResourceDerivation

  currentEnforcement: EnforcementLevel

  bypassPaths: string[]
  proposedPEP: string
  migrationPriority: MigrationPriority
}

// ─── Complete Inventory ───────────────────────────────────────────────

export const EFFECT_BOUNDARY_INVENTORY: EffectBoundary[] = [
  // ── P0: Critical — model-facing tools with direct effect ────────────

  {
    id: "eff-001",
    tool: "terminal",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('terminal', ...)",
    actions: ["process.execute"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "DETERMINISTIC_POLICY",
    bypassPaths: [],
    proposedPEP: "packages/engine/src/session/processor.ts:terminal branch",
    migrationPriority: "P0",
  },
  {
    id: "eff-002",
    tool: "write_file",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('write_file', ...)",
    actions: ["filesystem.write"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "PERMISSION_PROMPT",
    bypassPaths: [],
    proposedPEP: "packages/engine/src/session/processor.ts:write_file branch",
    migrationPriority: "P0",
  },
  {
    id: "eff-003",
    tool: "patch",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('patch', ...)",
    actions: ["filesystem.write"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "PERMISSION_PROMPT",
    bypassPaths: [],
    proposedPEP: "packages/engine/src/session/processor.ts:patch branch",
    migrationPriority: "P0",
  },
  {
    id: "eff-004",
    tool: "read_file",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('read_file', ...)",
    actions: ["filesystem.read"],
    riskClass: "LOW",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "MODEL_ONLY",
    bypassPaths: [],
    proposedPEP: "packages/engine/src/session/processor.ts:read_file branch",
    migrationPriority: "P1",
  },
  {
    id: "eff-005",
    tool: "search_files",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('search_files', ...)",
    actions: ["filesystem.read"],
    riskClass: "LOW",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "MODEL_ONLY",
    bypassPaths: [],
    proposedPEP: "packages/engine/src/session/processor.ts:search_files branch",
    migrationPriority: "P1",
  },
  {
    id: "eff-006",
    tool: "web_fetch",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "webFetch.execute",
    actions: ["network.read"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "MODEL_ONLY",
    bypassPaths: [],
    proposedPEP: "packages/arcana/src/agent/tools.ts:webFetch",
    migrationPriority: "P0",
  },
  {
    id: "eff-007",
    tool: "web_search",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "webSearch.execute",
    actions: ["network.read"],
    riskClass: "LOW",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "MODEL_ONLY",
    bypassPaths: [],
    proposedPEP: "packages/arcana/src/agent/tools.ts:webSearch",
    migrationPriority: "P1",
  },
  {
    id: "eff-008",
    tool: "mcp_*",
    implementationFile: "packages/engine/src/mcp/catalog.ts",
    entryFunction: "client.callTool(...)",
    actions: ["process.execute", "filesystem.read", "filesystem.write", "network.read", "network.write"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "external_content",
    currentEnforcement: "MODEL_ONLY",
    bypassPaths: ["MCP server can register arbitrary tools", "tool descriptions are untrusted data"],
    proposedPEP: "packages/engine/src/mcp/catalog.ts:callTool entry",
    migrationPriority: "P0",
  },
  {
    id: "eff-009",
    tool: "delegate_task",
    implementationFile: "packages/engine/src/tool/task.ts",
    entryFunction: "TaskTool.run",
    actions: ["delegate"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "PERMISSION_PROMPT",
    bypassPaths: ["child inherits parent tool access unless explicitly denied"],
    proposedPEP: "packages/engine/src/tool/task.ts:TaskTool.run",
    migrationPriority: "P0",
  },
  {
    id: "eff-010",
    tool: "git_commit (builtin)",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "git_commit.execute / git_autocommit.execute",
    actions: ["git.commit"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "DETERMINISTIC_POLICY",
    bypassPaths: [],
    proposedPEP: "packages/arcana/src/agent/tools.ts:git_commit",
    migrationPriority: "P0",
  },
  {
    id: "eff-011",
    tool: "send_message",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('send_message', ...)",
    actions: ["network.write"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "PERMISSION_PROMPT",
    bypassPaths: [],
    proposedPEP: "packages/engine/src/session/processor.ts:send_message branch",
    migrationPriority: "P0",
  },
  {
    id: "eff-012",
    tool: "write_file (Hermes)",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('write_file', ...)",
    actions: ["filesystem.write"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "PERMISSION_PROMPT",
    bypassPaths: [],
    proposedPEP: "packages/engine/src/session/processor.ts:write_file branch",
    migrationPriority: "P0",
  },
  {
    id: "eff-013",
    tool: "image_generate",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "imageGenerate.execute",
    actions: ["network.write"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "MODEL_ONLY",
    bypassPaths: [],
    proposedPEP: "packages/arcana/src/agent/tools.ts:imageGenerate",
    migrationPriority: "P1",
  },
  {
    id: "eff-014",
    tool: "speak (TTS)",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "speak.execute",
    actions: ["network.write"],
    riskClass: "LOW",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "MODEL_ONLY",
    bypassPaths: [],
    proposedPEP: "packages/arcana/src/agent/tools.ts:speak",
    migrationPriority: "P1",
  },
  {
    id: "eff-015",
    tool: "env_install",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "envInstall.execute",
    actions: ["process.execute", "filesystem.write"],
    riskClass: "CRITICAL",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "DETERMINISTIC_POLICY",
    bypassPaths: [],
    proposedPEP: "packages/arcana/src/agent/tools.ts:envInstall",
    migrationPriority: "P0",
  },
  {
    id: "eff-016",
    tool: "env_write",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "envWrite.execute",
    actions: ["filesystem.write"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "DETERMINISTIC_POLICY",
    bypassPaths: [],
    proposedPEP: "packages/arcana/src/agent/tools.ts:envWrite",
    migrationPriority: "P0",
  },
  {
    id: "eff-017",
    tool: "env_clean",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "envClean.execute",
    actions: ["filesystem.delete"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "DETERMINISTIC_POLICY",
    bypassPaths: [],
    proposedPEP: "packages/arcana/src/agent/tools.ts:envClean",
    migrationPriority: "P0",
  },
  {
    id: "eff-018",
    tool: "skill_create",
    implementationFile: "packages/arcana/src/agent/tools.ts",
    entryFunction: "skillCreate.execute",
    actions: ["filesystem.write"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "model_output",
    currentEnforcement: "DETERMINISTIC_POLICY",
    bypassPaths: ["model generates skill content that is written to disk"],
    proposedPEP: "packages/arcana/src/agent/tools.ts:skillCreate",
    migrationPriority: "P0",
  },

  // ── P1: Infrastructure effect paths ─────────────────────────────────

  {
    id: "eff-019",
    tool: "LSP server spawn",
    implementationFile: "packages/engine/src/lsp/server.ts",
    entryFunction: "spawn(serverCommand, ...)",
    actions: ["process.execute"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["20+ LSP servers spawned directly via child_process.spawn", "no authorization check"],
    proposedPEP: "packages/engine/src/lsp/server.ts:spawn wrapper",
    migrationPriority: "P1",
  },
  {
    id: "eff-020",
    tool: "MCP server spawn",
    implementationFile: "packages/engine/src/mcp/index.ts",
    entryFunction: "StdioClientTransport / SSEClientTransport",
    actions: ["process.execute", "network.read"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["MCP servers spawned as child processes", "transport connects via stdio/SSE/HTTP"],
    proposedPEP: "packages/engine/src/mcp/index.ts:transport creation",
    migrationPriority: "P0",
  },
  {
    id: "eff-021",
    tool: "plugin execution",
    implementationFile: "packages/plugin/src/index.ts",
    entryFunction: "Plugin(input, options)",
    actions: ["process.execute", "filesystem.read", "filesystem.write"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["plugins run in-process with full Node.js access", "can import arbitrary modules"],
    proposedPEP: "packages/plugin/src/index.ts:Plugin invocation",
    migrationPriority: "P1",
  },
  {
    id: "eff-022",
    tool: "GitHub Copilot fetch",
    implementationFile: "packages/engine/src/plugin/github-copilot/copilot.ts",
    entryFunction: "customFetch",
    actions: ["network.read", "network.write", "secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["token passthrough to GitHub API", "no per-request authorization"],
    proposedPEP: "packages/engine/src/plugin/github-copilot/copilot.ts:customFetch",
    migrationPriority: "P1",
  },
  {
    id: "eff-023",
    tool: "OpenAI Codex fetch",
    implementationFile: "packages/engine/src/plugin/openai/codex.ts",
    entryFunction: "customFetch",
    actions: ["network.read", "network.write", "secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["token passthrough to OpenAI API"],
    proposedPEP: "packages/engine/src/plugin/openai/codex.ts:customFetch",
    migrationPriority: "P1",
  },
  {
    id: "eff-024",
    tool: "OpenAI WebSocket",
    implementationFile: "packages/engine/src/plugin/openai/ws.ts",
    entryFunction: "connectResponsesWebSocket",
    actions: ["network.read", "network.write", "secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["WebSocket connection to OpenAI with API key", "no per-message authorization"],
    proposedPEP: "packages/engine/src/plugin/openai/ws.ts:connect",
    migrationPriority: "P1",
  },
  {
    id: "eff-025",
    tool: "xAI provider fetch",
    implementationFile: "packages/engine/src/plugin/xai.ts",
    entryFunction: "customFetch",
    actions: ["network.read", "network.write", "secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["token passthrough to xAI API"],
    proposedPEP: "packages/engine/src/plugin/xai.ts:customFetch",
    migrationPriority: "P1",
  },
  {
    id: "eff-026",
    tool: "Snowflake Cortex fetch",
    implementationFile: "packages/engine/src/plugin/snowflake-cortex.ts",
    entryFunction: "customFetch",
    actions: ["network.read", "network.write", "secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["token passthrough to Snowflake API"],
    proposedPEP: "packages/engine/src/plugin/snowflake-cortex.ts:customFetch",
    migrationPriority: "P1",
  },
  {
    id: "eff-027",
    tool: "DigitalOcean fetch",
    implementationFile: "packages/engine/src/plugin/digitalocean.ts",
    entryFunction: "fetch (API calls)",
    actions: ["network.read", "network.write", "secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["token passthrough to DigitalOcean API"],
    proposedPEP: "packages/engine/src/plugin/digitalocean.ts:fetch",
    migrationPriority: "P1",
  },
  {
    id: "eff-028",
    tool: "license service",
    implementationFile: "packages/core/src/license/service.ts",
    entryFunction: "licenseFetch",
    actions: ["network.read", "secret.use"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["license key sent to license server"],
    proposedPEP: "packages/core/src/license/service.ts:licenseFetch",
    migrationPriority: "P2",
  },
  {
    id: "eff-029",
    tool: "proxy client",
    implementationFile: "packages/arcana/src/proxy-client.ts",
    entryFunction: "proxy request",
    actions: ["network.read", "network.write", "secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["proxy key sent to Arcana proxy", "model requests forwarded"],
    proposedPEP: "packages/arcana/src/proxy-client.ts:fetch",
    migrationPriority: "P1",
  },
  {
    id: "eff-030",
    tool: "plugin-store git",
    implementationFile: "packages/engine/src/cli/cmd/plugin-store.ts",
    entryFunction: "execSync('git ...')",
    actions: ["process.execute", "filesystem.write"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["7 execSync calls with string interpolation for git operations"],
    proposedPEP: "packages/engine/src/cli/cmd/plugin-store.ts:git wrapper",
    migrationPriority: "P1",
  },
  {
    id: "eff-031",
    tool: "cronjob (Hermes)",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('cronjob', ...)",
    actions: ["process.execute"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "PERMISSION_PROMPT",
    bypassPaths: ["scheduled jobs run autonomously", "can spawn sessions with tool access"],
    proposedPEP: "packages/engine/src/session/processor.ts:cronjob branch",
    migrationPriority: "P0",
  },
  {
    id: "eff-032",
    tool: "delegate_task (Hermes subagent)",
    implementationFile: "packages/engine/src/session/processor.ts",
    entryFunction: "executeTool('delegate_task', ...)",
    actions: ["delegate", "process.execute"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "PERMISSION_PROMPT",
    bypassPaths: ["child sessions inherit parent tool access"],
    proposedPEP: "packages/engine/src/session/processor.ts:delegate_task branch",
    migrationPriority: "P0",
  },

  // ── P2: Indirect / infrastructure ───────────────────────────────────

  {
    id: "eff-033",
    tool: "database mutations",
    implementationFile: "packages/core/src/database/",
    entryFunction: "db.insert / db.update / db.delete / tx.run",
    actions: ["filesystem.write"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "runtime_context",
    currentEnforcement: "NONE",
    bypassPaths: ["SQLite writes bypass all authorization", "used by event store, permission store, session store"],
    proposedPEP: "packages/core/src/database/:mutation wrapper",
    migrationPriority: "P2",
  },
  {
    id: "eff-034",
    tool: "secret access (process.env)",
    implementationFile: "multiple files",
    entryFunction: "process.env[KEY]",
    actions: ["secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: [
      "OPENAI_API_KEY read in 5+ files",
      "GITHUB_TOKEN read in 3+ files",
      "ARCANA_API_KEY read in 4+ files",
      "ELEVENLABS_API_KEY read in tools.ts",
      "ARCANA_STORAGE_*_KEY read in enterprise/storage.ts",
    ],
    proposedPEP: "centralized secret access service",
    migrationPriority: "P1",
  },
  {
    id: "eff-035",
    tool: "WhatsApp gateway send",
    implementationFile: "packages/gateway/src/platforms/whatsapp.ts",
    entryFunction: "WhatsAppPlatform.send",
    actions: ["network.write"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "NONE",
    bypassPaths: ["sends messages via WhatsApp Cloud API", "no per-message authorization"],
    proposedPEP: "packages/gateway/src/platforms/whatsapp.ts:send",
    migrationPriority: "P1",
  },
  {
    id: "eff-036",
    tool: "Discord gateway send",
    implementationFile: "packages/gateway/src/platforms/discord.ts",
    entryFunction: "DiscordPlatform.send",
    actions: ["network.write"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "NONE",
    bypassPaths: ["sends messages via Discord API", "no per-message authorization"],
    proposedPEP: "packages/gateway/src/platforms/discord.ts:send",
    migrationPriority: "P1",
  },
  {
    id: "eff-037",
    tool: "Telegram gateway send",
    implementationFile: "packages/gateway/src/platforms/telegram.ts",
    entryFunction: "TelegramPlatform.send",
    actions: ["network.write"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "tool_input",
    currentEnforcement: "NONE",
    bypassPaths: ["sends messages via Telegram Bot API", "can send files/media"],
    proposedPEP: "packages/gateway/src/platforms/telegram.ts:send",
    migrationPriority: "P1",
  },
  {
    id: "eff-038",
    tool: "engine spawn (TUI)",
    implementationFile: "packages/arcana/src/index.ts",
    entryFunction: "Bun.spawn(['opencode', ...])",
    actions: ["process.execute"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "runtime_context",
    currentEnforcement: "NONE",
    bypassPaths: ["spawns engine process as child"],
    proposedPEP: "packages/arcana/src/index.ts:spawn wrapper",
    migrationPriority: "P2",
  },
  {
    id: "eff-039",
    tool: "git operations (project)",
    implementationFile: "packages/engine/src/project/project.ts",
    entryFunction: "spawner.spawn(ChildProcess.make('git', ...))",
    actions: ["process.execute", "git.commit"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "runtime_context",
    currentEnforcement: "NONE",
    bypassPaths: ["git init, add, commit for project management"],
    proposedPEP: "packages/engine/src/project/project.ts:git wrapper",
    migrationPriority: "P2",
  },
  {
    id: "eff-040",
    tool: "deployment tools",
    implementationFile: "packages/engine/src/cli/cmd/",
    entryFunction: "various deploy commands",
    actions: ["deploy"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "PERMISSION_PROMPT",
    bypassPaths: ["Cloudflare, Vercel, etc. deployments via CLI"],
    proposedPEP: "deployment command wrapper",
    migrationPriority: "P1",
  },
  {
    id: "eff-041",
    tool: "LSP binary downloads",
    implementationFile: "packages/engine/src/lsp/server.ts",
    entryFunction: "fetch(releaseUrl)",
    actions: ["network.read", "filesystem.write"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["downloads LSP server binaries from GitHub releases", "14 fetch calls for different servers"],
    proposedPEP: "packages/engine/src/lsp/server.ts:download wrapper",
    migrationPriority: "P1",
  },
  {
    id: "eff-042",
    tool: "OAuth callback servers",
    implementationFile: "packages/engine/src/plugin/xai.ts, codex.ts, snowflake.ts, digitalocean.ts",
    entryFunction: "http.createServer + startOAuthServer",
    actions: ["network.read"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["opens local HTTP server for OAuth callbacks", "listens on random port"],
    proposedPEP: "centralized OAuth callback manager",
    migrationPriority: "P2",
  },
  {
    id: "eff-043",
    tool: "image download",
    implementationFile: "packages/arcana/src/agent/image-generate.ts",
    entryFunction: "downloadImage",
    actions: ["network.read", "filesystem.write"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "external_content",
    currentEnforcement: "NONE",
    bypassPaths: ["downloads generated image from URL to local file"],
    proposedPEP: "packages/arcana/src/agent/image-generate.ts:downloadImage",
    migrationPriority: "P1",
  },
  {
    id: "eff-044",
    tool: "GitHub API (engine CLI)",
    implementationFile: "packages/engine/src/cli/cmd/github.handler.ts",
    entryFunction: "fetch (GitHub API calls)",
    actions: ["network.read", "network.write", "secret.use"],
    riskClass: "HIGH",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["5+ fetch calls to GitHub API", "token exchange, image download, installation management"],
    proposedPEP: "packages/engine/src/cli/cmd/github.handler.ts:fetch wrapper",
    migrationPriority: "P1",
  },
  {
    id: "eff-045",
    tool: "MCP OAuth callback",
    implementationFile: "packages/engine/src/mcp/oauth-callback.ts",
    entryFunction: "startCallbackServer",
    actions: ["network.read"],
    riskClass: "MODERATE",
    resourcesDerivedFrom: "configuration",
    currentEnforcement: "NONE",
    bypassPaths: ["opens local HTTP server for MCP OAuth", "net.createConnection for port check"],
    proposedPEP: "packages/engine/src/mcp/oauth-callback.ts:server",
    migrationPriority: "P2",
  },
]

// ─── Aggregate Report ─────────────────────────────────────────────────

export interface AuditAggregate {
  effectPathsDiscovered: number
  currentlyDeterministic: number
  permissionOnly: number
  modelGoverned: number
  completelyUnguarded: number
  byRiskClass: Record<RiskClass, number>
  byPriority: Record<MigrationPriority, number>
  byAction: Partial<Record<CapabilityAction, number>>
}

export function computeAuditAggregate(): AuditAggregate {
  const inv = EFFECT_BOUNDARY_INVENTORY

  const byRisk: Record<RiskClass, number> = {
    LOW: 0,
    MODERATE: 0,
    HIGH: 0,
    CRITICAL: 0,
  }
  const byPri: Record<MigrationPriority, number> = { P0: 0, P1: 0, P2: 0 }
  const byAction: Partial<Record<CapabilityAction, number>> = {}

  let deterministic = 0
  let permissionOnly = 0
  let modelGoverned = 0
  let unguarded = 0

  for (const e of inv) {
    byRisk[e.riskClass]++
    byPri[e.migrationPriority]++
    for (const a of e.actions) {
      byAction[a] = (byAction[a] ?? 0) + 1
    }
    switch (e.currentEnforcement) {
      case "DETERMINISTIC_POLICY":
        deterministic++
        break
      case "PERMISSION_PROMPT":
        permissionOnly++
        break
      case "MODEL_ONLY":
        modelGoverned++
        break
      case "NONE":
        unguarded++
        break
    }
  }

  return {
    effectPathsDiscovered: inv.length,
    currentlyDeterministic: deterministic,
    permissionOnly: permissionOnly,
    modelGoverned: modelGoverned,
    completelyUnguarded: unguarded,
    byRiskClass: byRisk,
    byPriority: byPri,
    byAction: byAction,
  }
}
