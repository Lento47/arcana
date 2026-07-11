import { render, TimeToFirstDraw, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { readFile, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { Deferred, Effect } from "effect"
import { Global } from "@arcana/core/global"
import { Flag } from "@arcana/core/flag/flag"
import { InstallationVersion } from "@arcana/core/installation/version"
import { APP_NAME, APP_ABBR, DOCS_URL, COPY } from "./branding"
import { ClipboardProvider, useClipboard } from "./context/clipboard"
import { ExitProvider, useExit } from "./context/exit"
import { EpilogueProvider } from "./context/epilogue"
import * as Selection from "./util/selection"
import { createCliRenderer, MouseButton, type CliRenderer } from "@opentui/core"
import { RouteProvider, useRoute } from "./context/route"
import {
  Switch,
  Match,
  createEffect,
  createMemo,
  ErrorBoundary,
  createSignal,
  onMount,
  onCleanup,
  batch,
  Show,
  on,
  For,
} from "solid-js"
import { TuiPathsProvider, TuiStartupProvider, TuiTerminalEnvironmentProvider, useTuiStartup } from "./context/runtime"
import { DialogProvider, useDialog } from "./ui/dialog"
import { ArcanaMetricLine, ArcanaSection, ArcanaSurface, ArcanaTapeItem } from "./ui/arcana"
import { DialogProvider as DialogProviderList } from "./component/dialog-provider"
import { ErrorComponent } from "./component/error-component"
import { PluginRouteMissing } from "./component/plugin-route-missing"
import { ProjectProvider, useProject } from "./context/project"
import { EditorContextProvider } from "./context/editor"
import { useEvent } from "./context/event"
import { SDKProvider, useSDK } from "./context/sdk"
import { StartupLoading } from "./component/startup-loading"
import { SyncProvider, useSync } from "./context/sync"
import { DataProvider } from "./context/data"
import { LocalProvider, useLocal } from "./context/local"
import { DialogModel } from "./component/dialog-model"
import { useConnected } from "./component/use-connected"
import { DialogMcp } from "./component/dialog-mcp"
import { DialogStatus } from "./component/dialog-status"
import { DialogThemeList } from "./component/dialog-theme-list"
import { DialogHelp } from "./ui/dialog-help"
import { DialogAgent } from "./component/dialog-agent"
import { DialogSessionList } from "./component/dialog-session-list"
import { DialogWorkspaceList } from "./component/dialog-workspace-list"
import { DialogConsoleOrg } from "./component/dialog-console-org"
import { ThemeProvider, useTheme } from "./context/theme"
import { Home } from "./routes/home"
import { Session } from "./routes/session"
import { PromptHistoryProvider } from "./component/prompt/history"
import { FrecencyProvider } from "./component/prompt/frecency"
import { PromptStashProvider } from "./component/prompt/stash"
import { DialogAlert } from "./ui/dialog-alert"
import { DialogConfirm } from "./ui/dialog-confirm"
import { ToastProvider, useToast } from "./ui/toast"
import { isDefaultTitle } from "./util/session"
import { KVProvider, useKV } from "./context/kv"
import * as Model from "./util/model"
import { ArgsProvider, useArgs, type Args } from "./context/args"

import { PromptRefProvider, usePromptRef } from "./context/prompt"
import { TuiConfigProvider, useTuiConfig, type TuiConfig } from "./config"
import { createTuiApiAdapters } from "./plugin/adapters"
import { createTuiApi } from "./plugin/api"
import { createPluginRuntime, PluginRuntimeProvider, usePluginRuntime, type TuiPluginHost } from "./plugin/runtime"
import { CommandPaletteDialog } from "./component/command-palette"
import {
  COMMAND_PALETTE_COMMAND,
  ARCANA_BASE_MODE,
  OpencodeKeymapProvider,
  registerOpencodeKeymap,
  useBindings,
  useOpencodeKeymap,
} from "./keymap"

import type { EventSource } from "./context/sdk"
import { DialogVariant } from "./component/dialog-variant"
import { createTuiAttention } from "./attention"
import * as TuiAudio from "./audio"
import { win32DisableProcessedInput, win32FlushInputBuffer } from "./terminal-win32"
import { destroyRenderer } from "./util/renderer"
import { cliErrorMessage, errorFormat } from "./util/error"

const appGlobalBindingCommands = [
  "session.list",
  "session.new",
  "session.quick_switch.1",
  "session.quick_switch.2",
  "session.quick_switch.3",
  "session.quick_switch.4",
  "session.quick_switch.5",
  "session.quick_switch.6",
  "session.quick_switch.7",
  "session.quick_switch.8",
  "session.quick_switch.9",
] as const

const appBindingCommands = [
  "command.palette.show",
  "model.list",
  "model.cycle_recent",
  "model.cycle_recent_reverse",
  "model.cycle_favorite",
  "model.cycle_favorite_reverse",
  "agent.list",
  "mcp.list",
  "agent.cycle",
  "agent.cycle.reverse",
  "variant.cycle",
  "variant.list",
  "provider.connect",
  "console.org.switch",
  "arcana.status",
  "theme.switch",
  "theme.switch_mode",
  "theme.mode.lock",
  "help.show",
  "docs.open",
  "workspace.list",
  "app.debug",
  "app.console",
  "app.heap_snapshot",
  "terminal.suspend",
  "terminal.title.toggle",
  "app.toggle.animations",
  "app.toggle.file_context",
  "app.toggle.diffwrap",
  "app.toggle.paste_summary",
  "app.toggle.session_directory_filter",
] as const

type RunProofContractView = {
  goal?: string
  scope?: string
  allowed_files?: string[]
  allowed_commands?: string[]
  risk_level?: string
  required_approvals?: string[]
  expected_artifacts?: string[]
  rollback_plan?: string
  verification_steps?: string[]
  status?: string
}

type RunProofEventView = {
  timestamp?: string
  type?: string
  actor?: string
  summary?: string
  risk?: string
  status?: string
  refs?: Record<string, string>
  data?: Record<string, unknown>
}

type RunProofLifecycleView = {
  status?: string
  started_at?: string
  ended_at?: string
}

type RunProofRiskView = {
  level?: string
  reasons?: string[]
  required_approval?: boolean
}

type RunProofRollbackView = {
  checkpoint_id?: string
  strategy?: string
  restore_command?: string
  valid_until?: string
  restore_status?: string
  staged_at?: string
  approval_required?: boolean
  approved_at?: string
  approved_by?: string
  executed_at?: string
  execution_status?: string
  execution_exit_code?: number
}

type RunProofFinalEvidenceView = {
  completed?: boolean
  summary?: string
  proof_score?: number
  human_review_recommended?: boolean
}

type RunProofDiffView = {
  id?: string
  path?: string
  status?: string
  additions?: number
  deletions?: number
  summary?: string
}

type RunProofFileReadView = {
  id?: string
  path?: string
  reason?: string
  exists?: boolean
  bytes_read?: number
}

type RunProofFileWriteView = {
  id?: string
  path?: string
  mode?: string
  reason?: string
  bytes_written?: number
}

type RunProofShellCommandView = {
  id?: string
  command?: string
  cwd?: string
  status?: string
  risk?: string
  exit_code?: number
  stdout_summary?: string
  stderr_summary?: string
}

type RunProofCheckView = {
  id?: string
  command?: string
  source?: string
  description?: string
  status?: string
  summary?: string
  evidence?: string
  passed?: number
  failed?: number
  skipped?: number
  duration_ms?: number
}

type RunProofVerifierReviewView = {
  model?: string
  status?: string
  summary?: string
  concerns?: string[]
}

type RunProofVerificationView = {
  diagnostics: RunProofCheckView[]
  tests: RunProofCheckView[]
  manual_checks: RunProofCheckView[]
  typecheck?: RunProofCheckView
  lint?: RunProofCheckView
  build?: RunProofCheckView
  verifier_review?: RunProofVerifierReviewView
}

type RunProofSovereigntyView = {
  provider?: string
  model?: string
  route?: string
  reason?: string
  data_left_local?: boolean
  selection_source?: string
  fallback_provider?: string
  fallback_model?: string
  data_boundary?: string
  estimated_cost_usd?: number
  latency_ms?: number
  timestamp?: string
  summary?: string
}

type RunProofTokenUsageView = {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  tool_calls: number
  turns: number
}

type RunProofContextBudgetView = {
  estimated_tokens: number
  system_tokens: number
  tool_tokens: number
  message_count: number
  threshold: number
  action: string
  risk?: string
  status?: string
  summary?: string
  timestamp?: string
}

type RunProofConsensusView = {
  council_id?: string
  prompt?: string
  models: string[]
  rounds?: number
  vote_mode?: string
  status?: string
  winner_model?: string
  vote_tally: Record<string, number>
  cost_tokens?: {
    input: number
    output: number
  }
  errored: string[]
  transcript?: string
  timestamp?: string
  summary?: string
}

type RunProofMLEvidenceView = {
  kind?: "turn" | "tool"
  timestamp?: string
  summary?: string
  intent?: string
  tool?: string
  risk?: string
  posture?: string
  confidence?: number
  labels?: string[]
  reasons?: string[]
  route?: string
  route_reason?: string
  decision_action?: string
  decision_posture?: string
  decision_confidence?: number
  decision_reasons?: string[]
}

type RunProofView = {
  id?: string
  user_intent?: string
  timestamp?: string
  lifecycle?: RunProofLifecycleView
  contract?: RunProofContractView
  events?: RunProofEventView[]
  risk?: RunProofRiskView
  rollback?: RunProofRollbackView
  final_evidence?: RunProofFinalEvidenceView
  diffs?: {
    proposed: RunProofDiffView[]
    applied: RunProofDiffView[]
    rejected: RunProofDiffView[]
  }
  execution?: {
    file_reads: RunProofFileReadView[]
    file_writes: RunProofFileWriteView[]
    shell_commands: RunProofShellCommandView[]
  }
  verification?: RunProofVerificationView
  sovereignty?: RunProofSovereigntyView
  token_usage?: RunProofTokenUsageView
  consensus?: RunProofConsensusView[]
  ml_evidence?: RunProofMLEvidenceView[]
}

type ProofLoadResult =
  | { status: "ready"; proof: RunProofView; path: string }
  | { status: "unbound" }
  | { status: "error"; message: string }

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function proofString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function proofNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function proofBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined
}

function normalizeDiffs(value: unknown): RunProofDiffView[] {
  return Array.isArray(value)
    ? value.flatMap((item): RunProofDiffView[] => {
        const diff = asRecord(item)
        if (!diff) return []
        return [
          {
            id: proofString(diff.id),
            path: proofString(diff.path),
            status: proofString(diff.status),
            additions: proofNumber(diff.additions),
            deletions: proofNumber(diff.deletions),
            summary: proofString(diff.summary),
          },
        ]
      })
    : []
}

function normalizeFileReads(value: unknown): RunProofFileReadView[] {
  return Array.isArray(value)
    ? value.flatMap((item): RunProofFileReadView[] => {
        const read = asRecord(item)
        return read
          ? [
              {
                id: proofString(read.id),
                path: proofString(read.path),
                reason: proofString(read.reason),
                exists: proofBoolean(read.exists),
                bytes_read: proofNumber(read.bytes_read),
              },
            ]
          : []
      })
    : []
}

function normalizeFileWrites(value: unknown): RunProofFileWriteView[] {
  return Array.isArray(value)
    ? value.flatMap((item): RunProofFileWriteView[] => {
        const write = asRecord(item)
        return write
          ? [
              {
                id: proofString(write.id),
                path: proofString(write.path),
                mode: proofString(write.mode),
                reason: proofString(write.reason),
                bytes_written: proofNumber(write.bytes_written),
              },
            ]
          : []
      })
    : []
}

function normalizeShellCommands(value: unknown): RunProofShellCommandView[] {
  return Array.isArray(value)
    ? value.flatMap((item): RunProofShellCommandView[] => {
        const cmd = asRecord(item)
        return cmd
          ? [
              {
                id: proofString(cmd.id),
                command: proofString(cmd.command),
                cwd: proofString(cmd.cwd),
                status: proofString(cmd.status),
                risk: proofString(cmd.risk),
                exit_code: proofNumber(cmd.exit_code),
                stdout_summary: proofString(cmd.stdout_summary),
                stderr_summary: proofString(cmd.stderr_summary),
              },
            ]
          : []
      })
    : []
}

function normalizeCheck(value: unknown): RunProofCheckView | undefined {
  const check = asRecord(value)
  if (!check) return undefined
  return {
    id: proofString(check.id),
    command: proofString(check.command),
    source: proofString(check.source),
    description: proofString(check.description),
    status: proofString(check.status),
    summary: proofString(check.summary),
    evidence: proofString(check.evidence),
    passed: proofNumber(check.passed),
    failed: proofNumber(check.failed),
    skipped: proofNumber(check.skipped),
    duration_ms: proofNumber(check.duration_ms),
  }
}

function normalizeChecks(value: unknown): RunProofCheckView[] {
  return Array.isArray(value) ? value.flatMap((item) => normalizeCheck(item) ?? []) : []
}

function normalizeProofView(value: unknown): RunProofView {
  const proof = asRecord(value) ?? {}
  const contract = asRecord(proof.contract)
  const lifecycle = asRecord(proof.lifecycle)
  const risk = asRecord(proof.risk)
  const rollback = asRecord(proof.rollback)
  const finalEvidence = asRecord(proof.final_evidence)
  const diffs = asRecord(proof.diffs)
  const execution = asRecord(proof.execution)
  const verification = asRecord(proof.verification)
  const verifierReview = asRecord(verification?.verifier_review)
  const events = Array.isArray(proof.events) ? proof.events : []
  const normalizedEvents = events.flatMap((item): RunProofEventView[] => {
    const event = asRecord(item)
    if (!event) return []
    const refs = asRecord(event.refs)
    return [
      {
        timestamp: proofString(event.timestamp),
        type: proofString(event.type),
        actor: proofString(event.actor),
        summary: proofString(event.summary),
        risk: proofString(event.risk),
        status: proofString(event.status),
        refs: refs
          ? Object.fromEntries(
              Object.entries(refs).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
            )
          : undefined,
        data: asRecord(event.data),
      },
    ]
  })
  return {
    id: proofString(proof.id),
    user_intent: proofString(proof.user_intent),
    timestamp: proofString(proof.timestamp),
    lifecycle: lifecycle
      ? {
          status: proofString(lifecycle.status),
          started_at: proofString(lifecycle.started_at),
          ended_at: proofString(lifecycle.ended_at),
        }
      : undefined,
    contract: contract
      ? {
          goal: proofString(contract.goal),
          scope: proofString(contract.scope),
          allowed_files: asStringArray(contract.allowed_files),
          allowed_commands: asStringArray(contract.allowed_commands),
          risk_level: proofString(contract.risk_level),
          required_approvals: asStringArray(contract.required_approvals),
          expected_artifacts: asStringArray(contract.expected_artifacts),
          rollback_plan: proofString(contract.rollback_plan),
          verification_steps: asStringArray(contract.verification_steps),
          status: proofString(contract.status),
        }
      : undefined,
    risk: risk
      ? {
          level: proofString(risk.level),
          reasons: asStringArray(risk.reasons),
          required_approval: proofBoolean(risk.required_approval),
        }
      : undefined,
    rollback: rollback
      ? {
          checkpoint_id: proofString(rollback.checkpoint_id),
          strategy: proofString(rollback.strategy),
          restore_command: proofString(rollback.restore_command),
          valid_until: proofString(rollback.valid_until),
          restore_status: proofString(rollback.restore_status),
          staged_at: proofString(rollback.staged_at),
          approval_required: proofBoolean(rollback.approval_required),
          approved_at: proofString(rollback.approved_at),
          approved_by: proofString(rollback.approved_by),
          executed_at: proofString(rollback.executed_at),
          execution_status: proofString(rollback.execution_status),
          execution_exit_code: proofNumber(rollback.execution_exit_code),
        }
      : undefined,
    final_evidence: finalEvidence
      ? {
          completed: proofBoolean(finalEvidence.completed),
          summary: proofString(finalEvidence.summary),
          proof_score: proofNumber(finalEvidence.proof_score),
          human_review_recommended: proofBoolean(finalEvidence.human_review_recommended),
        }
      : undefined,
    diffs: {
      proposed: normalizeDiffs(diffs?.proposed),
      applied: normalizeDiffs(diffs?.applied),
      rejected: normalizeDiffs(diffs?.rejected),
    },
    execution: {
      file_reads: normalizeFileReads(execution?.file_reads),
      file_writes: normalizeFileWrites(execution?.file_writes),
      shell_commands: normalizeShellCommands(execution?.shell_commands),
    },
    verification: {
      diagnostics: normalizeChecks(verification?.diagnostics),
      tests: normalizeChecks(verification?.tests),
      manual_checks: normalizeChecks(verification?.manual_checks),
      typecheck: normalizeCheck(verification?.typecheck),
      lint: normalizeCheck(verification?.lint),
      build: normalizeCheck(verification?.build),
      verifier_review: verifierReview
        ? {
            model: proofString(verifierReview.model),
            status: proofString(verifierReview.status),
            summary: proofString(verifierReview.summary),
            concerns: asStringArray(verifierReview.concerns),
          }
        : undefined,
    },
    sovereignty: sovereigntyFromEvents(normalizedEvents),
    token_usage: tokenUsageFromEvents(normalizedEvents),
    consensus: consensusFromEvents(normalizedEvents),
    ml_evidence: mlEvidenceFromEvents(normalizedEvents),
    events: normalizedEvents,
  }
}

function sovereigntyFromEvents(events: RunProofEventView[]): RunProofSovereigntyView | undefined {
  const event = events.findLast((item) => item.type === "sovereignty.routed")
  if (!event) return undefined
  const data = event.data ?? {}
  return {
    provider: proofString(data.provider) ?? event.refs?.provider,
    model: proofString(data.model) ?? event.refs?.model,
    route: proofString(data.route),
    reason: proofString(data.reason),
    data_left_local: proofBoolean(data.data_left_local),
    selection_source: proofString(data.selection_source),
    fallback_provider: proofString(data.fallback_provider),
    fallback_model: proofString(data.fallback_model),
    data_boundary: proofString(data.data_boundary),
    estimated_cost_usd: proofNumber(data.estimated_cost_usd),
    latency_ms: proofNumber(data.latency_ms),
    timestamp: event.timestamp,
    summary: event.summary,
  }
}

function mlEvidenceFromEvents(events: RunProofEventView[]): RunProofMLEvidenceView[] {
  return events
    .filter((event) => event.type === "ml.signal")
    .map((event) => {
      const data = event.data ?? {}
      const signal = asRecord(data.signal) ?? {}
      const decision = asRecord(data.decision)
      const route = asRecord(signal.modelRoute)
      const confidenceRecord = asRecord(signal.confidence)
      return {
        kind: proofString(data.kind) === "tool" ? "tool" : "turn",
        timestamp: event.timestamp,
        summary: event.summary,
        intent: proofString(signal.intent),
        tool: proofString(signal.toolName),
        risk: proofString(signal.risk),
        posture: proofString(signal.executionPosture),
        confidence: proofNumber(confidenceRecord?.value ?? signal.confidence),
        labels: asStringArray(signal.labels),
        reasons: asStringArray(signal.reasons),
        route: proofString(route?.profile),
        route_reason: proofString(route?.reason),
        decision_action: proofString(decision?.action),
        decision_posture: proofString(decision?.posture),
        decision_confidence: proofNumber(decision?.confidence),
        decision_reasons: asStringArray(decision?.reasons),
      }
    })
}

function consensusFromEvents(events: RunProofEventView[]): RunProofConsensusView[] {
  return events
    .filter((event) => event.type === "consensus.recorded")
    .map((event) => {
      const data = event.data ?? {}
      const cost = asRecord(data.cost_tokens)
      const tally = asRecord(data.vote_tally)
      const vote_tally: Record<string, number> = {}
      for (const [key, value] of Object.entries(tally ?? {})) {
        const count = proofNumber(value)
        if (count !== undefined) vote_tally[key] = count
      }
      return {
        council_id: proofString(data.council_id) ?? event.refs?.council_id,
        prompt: proofString(data.prompt),
        models: asStringArray(data.models),
        rounds: proofNumber(data.rounds),
        vote_mode: proofString(data.vote_mode),
        status: proofString(data.status) ?? event.status,
        winner_model: proofString(data.winner_model) ?? event.refs?.winner_model,
        vote_tally,
        cost_tokens: cost
          ? {
              input: proofNumber(cost.input) ?? 0,
              output: proofNumber(cost.output) ?? 0,
            }
          : undefined,
        errored: asStringArray(data.errored),
        transcript: proofString(data.transcript),
        timestamp: event.timestamp,
        summary: event.summary,
      }
    })
}

function tokenUsageFromEvents(events: RunProofEventView[]): RunProofTokenUsageView | undefined {
  const usage = events.filter((item) => item.type === "token.used")
  if (usage.length === 0) return undefined

  return usage.reduce<RunProofTokenUsageView>(
    (total, event) => {
      const data = event.data ?? {}
      total.input_tokens += proofNumber(data.input_tokens) ?? 0
      total.output_tokens += proofNumber(data.output_tokens) ?? 0
      total.total_tokens += proofNumber(data.total_tokens) ?? 0
      total.tool_calls += proofNumber(data.tool_calls) ?? 0
      total.turns += 1
      return total
    },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0, tool_calls: 0, turns: 0 },
  )
}

function contextBudgetsFromEvents(events: RunProofEventView[]): RunProofContextBudgetView[] {
  return events.flatMap((event): RunProofContextBudgetView[] => {
    if (event.type !== "context.budgeted") return []
    const data = event.data ?? {}
    return [
      {
        estimated_tokens: proofNumber(data.estimated_tokens) ?? 0,
        system_tokens: proofNumber(data.system_tokens) ?? 0,
        tool_tokens: proofNumber(data.tool_tokens) ?? 0,
        message_count: proofNumber(data.message_count) ?? 0,
        threshold: proofNumber(data.threshold) ?? 0,
        action: proofString(data.action) ?? "observe",
        risk: event.risk,
        status: event.status,
        summary: event.summary,
        timestamp: event.timestamp,
      },
    ]
  })
}

function activeProofPath(): string | undefined {
  const value = process.env.ARCANA_ACTIVE_RUNPROOF_PATH
  return typeof value === "string" && value.trim() ? value : undefined
}

async function loadActiveRunProof(): Promise<ProofLoadResult> {
  const path = activeProofPath()
  if (!path) return { status: "unbound" }

  try {
    return {
      status: "ready",
      proof: normalizeProofView(JSON.parse(await readFile(path, "utf8"))),
      path,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { status: "error", message: `Failed to read active RunProof at ${path}: ${detail}` }
  }
}

const runProofRiskRank: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

function maxRunProofRisk(current: string | undefined, next: "high"): string {
  const currentRank = current ? runProofRiskRank[current] : undefined
  return currentRank !== undefined && currentRank > runProofRiskRank[next] ? current! : next
}

function appendUniqueString(value: unknown, item: string): string[] {
  const items = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
  return items.includes(item) ? items : [...items, item]
}

async function stageActiveRunProofRollbackRestore(): Promise<ProofLoadResult> {
  const path = activeProofPath()
  if (!path) return { status: "unbound" }

  try {
    const parsed = JSON.parse(await readFile(path, "utf8"))
    const proof = asRecord(parsed)
    if (!proof) return { status: "error", message: `Active RunProof at ${path} is not an object.` }

    const rollback = asRecord(proof.rollback)
    const restoreCommand = proofString(rollback?.restore_command)
    if (!rollback || !restoreCommand) {
      return {
        status: "error",
        message: "Active RunProof has no rollback.restore_command to stage.",
      }
    }

    const timestamp = new Date().toISOString()
    rollback.restore_status = "staged"
    rollback.staged_at = timestamp
    rollback.approval_required = true

    const risk = asRecord(proof.risk) ?? {}
    risk.level = maxRunProofRisk(proofString(risk.level), "high")
    risk.reasons = appendUniqueString(
      risk.reasons,
      "Rollback restore command is staged and requires explicit approval before execution.",
    )
    risk.required_approval = true
    proof.risk = risk

    const contract = asRecord(proof.contract) ?? {}
    contract.risk_level = maxRunProofRisk(proofString(contract.risk_level), "high")
    contract.required_approvals = appendUniqueString(contract.required_approvals, "rollback restore execution")
    proof.contract = contract

    const events = Array.isArray(proof.events) ? proof.events : []
    events.push({
      id: `evt_${randomUUID()}`,
      timestamp,
      type: "rollback.staged",
      actor: "user",
      summary: `Rollback restore staged pending approval: ${restoreCommand}`,
      risk: "high",
      status: "awaiting_approval",
      refs: {
        checkpoint_id: proofString(rollback.checkpoint_id) ?? "none",
        restore_command: restoreCommand,
      },
      data: {
        approval_required: true,
        restore_status: "staged",
        staged_at: timestamp,
      },
    })
    proof.events = events

    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")
    return { status: "ready", proof: normalizeProofView(parsed), path }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { status: "error", message: `Failed to stage rollback restore in active RunProof at ${path}: ${detail}` }
  }
}

async function approveActiveRunProofRollbackRestore(): Promise<ProofLoadResult> {
  const path = activeProofPath()
  if (!path) return { status: "unbound" }

  try {
    const parsed = JSON.parse(await readFile(path, "utf8"))
    const proof = asRecord(parsed)
    if (!proof) return { status: "error", message: `Active RunProof at ${path} is not an object.` }

    const rollback = asRecord(proof.rollback)
    const restoreCommand = proofString(rollback?.restore_command)
    if (!rollback || !restoreCommand) {
      return {
        status: "error",
        message: "Active RunProof has no rollback.restore_command to approve.",
      }
    }
    if (rollback.restore_status !== "staged") {
      return {
        status: "error",
        message: "Rollback restore must be staged before approval.",
      }
    }

    const timestamp = new Date().toISOString()
    rollback.restore_status = "approved"
    rollback.approval_required = false
    rollback.approved_at = timestamp
    rollback.approved_by = "operator"

    const events = Array.isArray(proof.events) ? proof.events : []
    events.push({
      id: `evt_${randomUUID()}`,
      timestamp,
      type: "rollback.approved",
      actor: "user",
      summary: `Rollback restore approved but not executed: ${restoreCommand}`,
      risk: "high",
      status: proofString(asRecord(proof.lifecycle)?.status) ?? "awaiting_approval",
      refs: {
        checkpoint_id: proofString(rollback.checkpoint_id) ?? "none",
        restore_command: restoreCommand,
      },
      data: {
        restore_status: "approved",
        approved_at: timestamp,
        approved_by: "operator",
        executed: false,
      },
    })
    proof.events = events

    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")
    return { status: "ready", proof: normalizeProofView(parsed), path }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { status: "error", message: `Failed to approve rollback restore in active RunProof at ${path}: ${detail}` }
  }
}

function FieldList(props: { items: string[] | undefined; empty: string }) {
  const { theme } = useTheme()
  return (
    <Show when={props.items && props.items.length > 0} fallback={<text fg={theme.textMuted}>{props.empty}</text>}>
      <For each={props.items}>{(item) => <text fg={theme.text}>- {item}</text>}</For>
    </Show>
  )
}

function rollbackSummary(proof: RunProofView): string {
  const rollback = proof.rollback
  if (rollback?.strategy && rollback.strategy !== "none") {
    return [rollback.strategy, rollback.checkpoint_id].filter(Boolean).join("  ")
  }
  return proof.contract?.rollback_plan ?? "not recorded"
}

function rollbackRestoreCommand(proof: RunProofView): string {
  return proof.rollback?.restore_command ?? proof.contract?.rollback_plan ?? "not recorded"
}

function rollbackRestoreCommandValue(proof: RunProofView): string | undefined {
  return proof.rollback?.restore_command
}

function rollbackValidity(proof: RunProofView): string {
  return proof.rollback?.valid_until ?? "not recorded"
}

function rollbackRestoreStatus(proof: RunProofView): string {
  return proof.rollback?.restore_status ?? "not_staged"
}

function rollbackRestoreCanBeStaged(proof: RunProofView): boolean {
  const status = rollbackRestoreStatus(proof)
  return status === "not_staged" || status === "rejected"
}

function rollbackRestoreCanBeApproved(proof: RunProofView): boolean {
  return rollbackRestoreStatus(proof) === "staged"
}

function rollbackApprovalStatus(proof: RunProofView): string {
  if (proof.rollback?.approved_at) {
    return ["approved", proof.rollback.approved_by ? `by ${proof.rollback.approved_by}` : undefined]
      .filter(Boolean)
      .join(" ")
  }
  if (proof.rollback?.approval_required) return "required before execution"
  return "not required"
}

function rollbackExecutionStatus(proof: RunProofView): string | undefined {
  if (!proof.rollback?.executed_at && !proof.rollback?.execution_status) return undefined
  return [
    proof.rollback.execution_status ?? "unknown",
    proof.rollback.execution_exit_code === undefined ? undefined : `exit=${proof.rollback.execution_exit_code}`,
    proof.rollback.executed_at,
  ]
    .filter(Boolean)
    .join(" ")
}

function mlEvidenceSummary(evidence: RunProofMLEvidenceView): string {
  const parts = [
    evidence.kind === "tool" ? `tool=${evidence.tool ?? "unknown"}` : `intent=${evidence.intent ?? "unknown"}`,
    evidence.risk ? `risk=${evidence.risk}` : undefined,
    evidence.posture ? `posture=${evidence.posture}` : undefined,
    evidence.confidence !== undefined ? `confidence=${Math.round(evidence.confidence * 100)}%` : undefined,
    evidence.decision_action ? `decision=${evidence.decision_action}` : undefined,
  ].filter((item): item is string => Boolean(item))
  return parts.join("  ")
}

function MLEvidencePanel(props: { evidence: RunProofMLEvidenceView[]; latestOnly?: boolean }) {
  const { theme } = useTheme()
  const items = () => (props.latestOnly ? props.evidence.slice(-1) : props.evidence)
  return (
    <Show when={props.evidence.length > 0} fallback={<text fg={theme.textMuted}>No ML signal evidence recorded.</text>}>
      <box gap={0}>
        <For each={items()}>
          {(evidence) => (
            <box gap={0}>
              <text fg={theme.text}>{mlEvidenceSummary(evidence)}</text>
              <Show when={evidence.route}>
                <text fg={theme.textMuted}>
                  route={evidence.route}
                  {evidence.route_reason ? `  (${evidence.route_reason})` : ""}
                </text>
              </Show>
              <FieldList items={evidence.reasons} empty="" />
              <Show when={evidence.labels && evidence.labels.length > 0}>
                <text fg={theme.textMuted}>labels: {evidence.labels?.join(", ")}</text>
              </Show>
              <Show when={evidence.decision_reasons && evidence.decision_reasons.length > 0}>
                <FieldList items={evidence.decision_reasons} empty="" />
              </Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

function DialogRunProofContract(props: {
  proof: RunProofView
  path: string
  onCopyRollbackRestore?: (command: string) => void
  onStageRollbackRestore?: () => void
  onApproveRollbackRestore?: () => void
}) {
  const { theme } = useTheme()
  const contract = () => props.proof.contract
  const rollback = () => props.proof.rollback
  const restoreCommand = () => rollbackRestoreCommandValue(props.proof)
  const mlEvidence = () => props.proof.ml_evidence ?? []
  const latestTurnEvidence = () => mlEvidence().findLast((item) => item.kind === "turn")
  return (
    <ArcanaSurface
      title="CONTRACT"
      path={props.path}
      meta={`run ${compactProofId(props.proof.id)}  state ${props.proof.lifecycle?.status ?? "unknown"}`}
    >
      <Show when={contract()} fallback={<text fg={theme.warning}>Active RunProof has no execution contract.</text>}>
        {(value) => (
          <box gap={1}>
            <ArcanaSection title="Execution Terms">
              <box gap={0}>
                <text fg={theme.text}>Goal: {value().goal ?? props.proof.user_intent ?? "not recorded"}</text>
                <text fg={theme.text}>Scope: {value().scope ?? "not recorded"}</text>
                <ArcanaMetricLine
                  items={[`risk=${value().risk_level ?? "not recorded"}`, `status=${value().status ?? "not recorded"}`]}
                />
              </box>
            </ArcanaSection>
            <ArcanaSection title="Allowed Files">
              <FieldList items={value().allowed_files} empty="No file allowlist recorded." />
            </ArcanaSection>
            <ArcanaSection title="Allowed Commands">
              <FieldList items={value().allowed_commands} empty="No command allowlist recorded." />
            </ArcanaSection>
            <ArcanaSection title="Required Approvals">
              <FieldList items={value().required_approvals} empty="No required approvals recorded." />
            </ArcanaSection>
            <ArcanaSection title="Expected Artifacts">
              <FieldList items={value().expected_artifacts} empty="No expected artifacts recorded." />
            </ArcanaSection>
            <ArcanaTapeItem kind="ROLLBACK" summary={value().rollback_plan ?? "not recorded"} />
            <Show when={rollback()?.strategy && rollback()?.strategy !== "none"}>
              <box gap={0}>
                <text fg={theme.text}>Rollback checkpoint: {rollbackSummary(props.proof)}</text>
                <text fg={theme.textMuted}>Restore: {rollbackRestoreCommand(props.proof)}</text>
                <text fg={theme.textMuted}>Valid until: {rollbackValidity(props.proof)}</text>
                <text fg={theme.textMuted}>Restore status: {rollbackRestoreStatus(props.proof)}</text>
                <text fg={props.proof.rollback?.approval_required ? theme.warning : theme.textMuted}>
                  Restore approval: {rollbackApprovalStatus(props.proof)}
                </text>
                <Show when={rollbackExecutionStatus(props.proof)}>
                  {(value) => <text fg={theme.textMuted}>Restore execution: {value()}</text>}
                </Show>
                <Show when={restoreCommand()}>
                  {(command) => (
                    <box gap={0}>
                      <text fg={theme.primary} onMouseUp={() => props.onCopyRollbackRestore?.(command())}>
                        copy restore command
                      </text>
                      <Show when={rollbackRestoreCanBeStaged(props.proof)}>
                        <text fg={theme.warning} onMouseUp={() => props.onStageRollbackRestore?.()}>
                          stage restore for approval
                        </text>
                      </Show>
                      <Show when={rollbackRestoreCanBeApproved(props.proof)}>
                        <text fg={theme.warning} onMouseUp={() => props.onApproveRollbackRestore?.()}>
                          approve restore
                        </text>
                      </Show>
                    </box>
                  )}
                </Show>
              </box>
            </Show>
            <ArcanaSection title="Verification Steps">
              <FieldList items={value().verification_steps} empty="No verification steps recorded." />
            </ArcanaSection>
          </box>
        )}
      </Show>
      <Show when={latestTurnEvidence()}>
        {(evidence) => (
          <ArcanaSection title="ML Posture">
            <MLEvidencePanel evidence={[evidence()]} />
          </ArcanaSection>
        )}
      </Show>
    </ArcanaSurface>
  )
}

function voteTallyText(value: Record<string, number> | undefined): string {
  const entries = Object.entries(value ?? {})
  if (entries.length === 0) return "no valid votes"
  return entries.map(([key, count]) => `${key}:${count}`).join("  ")
}

function ConsensusEvidencePanel(props: { consensus: RunProofConsensusView[]; latestOnly?: boolean }) {
  const { theme } = useTheme()
  const items = () => (props.latestOnly ? props.consensus.slice(-1) : props.consensus)
  return (
    <Show when={props.consensus.length > 0} fallback={<text fg={theme.textMuted}>No consensus evidence recorded.</text>}>
      <box gap={0}>
        <For each={items()}>
          {(item) => (
            <box gap={0}>
              <text fg={theme.text}>
                {eventTime(item.timestamp)} consensus {item.status ?? "unknown"}
                {item.winner_model ? ` winner=${item.winner_model}` : ""}
              </text>
              <Show when={item.council_id}>
                {(id) => <text fg={theme.textMuted}>ledger={id()}</text>}
              </Show>
              <Show when={item.prompt}>
                {(prompt) => <text fg={theme.textMuted}>prompt={prompt()}</text>}
              </Show>
              <text fg={theme.textMuted}>
                models={item.models.length ? item.models.join(", ") : "not recorded"} rounds={item.rounds ?? "?"} vote=
                {item.vote_mode ?? "unknown"}
              </text>
              <text fg={theme.textMuted}>votes={voteTallyText(item.vote_tally)}</text>
              <Show when={item.cost_tokens}>
                {(cost) => (
                  <text fg={theme.textMuted}>
                    tokens={cost().input.toLocaleString()} in {cost().output.toLocaleString()} out
                  </text>
                )}
              </Show>
              <Show when={item.errored.length > 0}>
                <text fg={theme.warning}>errors={item.errored.length}</text>
              </Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

function refsText(refs: Record<string, string> | undefined): string | undefined {
  if (!refs || Object.keys(refs).length === 0) return undefined
  return Object.entries(refs)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join("  ")
}

function compactProofId(id: string | undefined): string {
  if (!id) return "unknown"
  return id.length > 16 ? `${id.slice(0, 10)}...${id.slice(-4)}` : id
}

function eventTime(value: string | undefined): string {
  if (!value) return "--:--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function eventLabel(value: string | undefined): string {
  const labels: Record<string, string> = {
    "plan.created": "PLAN",
    "context.budgeted": "BUDGET",
    "context.accessed": "READ",
    "tool.requested": "TOOL",
    "risk.evaluated": "RISK",
    "approval.required": "APPROVAL",
    "command.executed": "EXEC",
    "file.written": "WRITE",
    "diff.created": "DIFF",
    "verification.started": "VERIFY",
    "verification.passed": "PASS",
    "verification.failed": "FAIL",
    "rollback.available": "ROLLBACK",
    "rollback.staged": "RESTORE",
    "rollback.approved": "APPROVE",
    "rollback.executed": "RESTORE",
    "sovereignty.routed": "ROUTE",
    "token.used": "TOKENS",
    "consensus.recorded": "CONSENSUS",
    "ml.signal": "ML",
  }
  return labels[value ?? ""] ?? (value ?? "event").replace(/[._-]+/g, " ").toUpperCase()
}

function eventTone(event: RunProofEventView): "normal" | "muted" | "warning" | "error" {
  if (event.type === "verification.failed" || event.status === "failed" || event.risk === "critical") return "error"
  if (
    event.type === "approval.required" ||
    event.type === "rollback.staged" ||
    event.risk === "high" ||
    event.risk === "medium"
  ) {
    return "warning"
  }
  if (
    event.type === "context.accessed" ||
    event.type === "context.budgeted" ||
    event.type === "token.used" ||
    event.type === "ml.signal"
  ) {
    return "muted"
  }
  return "normal"
}

function DialogRunProofActions(props: {
  proof: RunProofView
  path: string
  onCopyRollbackRestore?: (command: string) => void
  onStageRollbackRestore?: () => void
  onApproveRollbackRestore?: () => void
}) {
  const { theme } = useTheme()
  const events = () => props.proof.events ?? []
  const fileReads = () => props.proof.execution?.file_reads ?? []
  const fileWrites = () => props.proof.execution?.file_writes ?? []
  const shellCommands = () => props.proof.execution?.shell_commands ?? []
  const status = () => props.proof.lifecycle?.status ?? props.proof.contract?.status ?? "unknown"
  const risk = () => props.proof.risk?.level ?? props.proof.contract?.risk_level ?? "unknown"
  const score = () => props.proof.final_evidence?.proof_score
  const tokens = () => props.proof.token_usage
  const contextBudgets = () => contextBudgetsFromEvents(events())
  const latestContextBudget = () => contextBudgets().at(-1)
  const restoreCommand = () => rollbackRestoreCommandValue(props.proof)
  return (
    <ArcanaSurface title="ACTIONS" path={props.path} meta={`run ${compactProofId(props.proof.id)}`}>
      <ArcanaSection title="Run State">
        <box gap={0}>
          <ArcanaMetricLine
            items={[`state=${status()}`, `risk=${risk()}`, score() === undefined ? undefined : `proof=${score()}/100`]}
          />
          <text fg={theme.text}>Intent: {props.proof.user_intent ?? "not recorded"}</text>
        </box>
      </ArcanaSection>
      <ArcanaSection title="Governance">
        <text fg={props.proof.risk?.required_approval ? theme.warning : theme.textMuted}>
          Approval: {props.proof.risk?.required_approval ? "required" : "not required"}
        </text>
        <FieldList items={props.proof.risk?.reasons} empty="No risk reasons recorded." />
        <text fg={theme.textMuted}>Rollback: {rollbackSummary(props.proof)}</text>
        <Show when={props.proof.rollback?.restore_command}>
          <box gap={0}>
            <text fg={theme.textMuted}>Restore: {rollbackRestoreCommand(props.proof)}</text>
            <Show when={restoreCommand()}>
              {(command) => (
                <box gap={0}>
                  <text fg={theme.primary} onMouseUp={() => props.onCopyRollbackRestore?.(command())}>
                    copy restore command
                  </text>
                  <Show when={rollbackRestoreCanBeStaged(props.proof)}>
                    <text fg={theme.warning} onMouseUp={() => props.onStageRollbackRestore?.()}>
                      stage restore for approval
                    </text>
                  </Show>
                  <Show when={rollbackRestoreCanBeApproved(props.proof)}>
                    <text fg={theme.warning} onMouseUp={() => props.onApproveRollbackRestore?.()}>
                      approve restore
                    </text>
                  </Show>
                </box>
              )}
            </Show>
          </box>
        </Show>
        <Show when={props.proof.rollback?.valid_until}>
          <text fg={theme.textMuted}>Rollback valid until: {rollbackValidity(props.proof)}</text>
        </Show>
        <Show when={props.proof.rollback?.restore_status || props.proof.rollback?.approval_required}>
          <text fg={props.proof.rollback?.approval_required ? theme.warning : theme.textMuted}>
            Restore status: {rollbackRestoreStatus(props.proof)} Approval: {rollbackApprovalStatus(props.proof)}
          </text>
        </Show>
        <Show when={rollbackExecutionStatus(props.proof)}>
          {(value) => <text fg={theme.textMuted}>Restore execution: {value()}</text>}
        </Show>
        <Show when={tokens()}>
          {(value) => (
            <text fg={theme.textMuted}>
              Tokens: {value().total_tokens.toLocaleString()} total {value().input_tokens.toLocaleString()} in{" "}
              {value().output_tokens.toLocaleString()} out Tool calls: {value().tool_calls}
            </text>
          )}
        </Show>
        <text fg={theme.textMuted}>
          Evidence: {fileReads().length} context read(s) {fileWrites().length} file write(s) {shellCommands().length}{" "}
          shell command(s)
        </text>
      </ArcanaSection>
      <ArcanaSection
        title="Token OS"
        detail={`${contextBudgets().length} budget event${contextBudgets().length === 1 ? "" : "s"}`}
      >
        <Show
          when={latestContextBudget()}
          fallback={<text fg={theme.textMuted}>No context budget pressure recorded.</text>}
        >
          {(budget) => (
            <box gap={0}>
              <ArcanaMetricLine
                items={[
                  `estimated=${budget().estimated_tokens.toLocaleString()}`,
                  budget().threshold ? `threshold=${budget().threshold.toLocaleString()}` : undefined,
                  `messages=${budget().message_count}`,
                  `action=${budget().action}`,
                  budget().risk ? `risk=${budget().risk}` : undefined,
                ]}
              />
              <text fg={theme.textMuted}>
                System: {budget().system_tokens.toLocaleString()} Tool: {budget().tool_tokens.toLocaleString()}
                {budget().timestamp ? ` Recorded: ${eventTime(budget().timestamp)}` : ""}
              </text>
              <text fg={theme.textMuted}>{budget().summary ?? "Context pressure recorded as RunProof evidence."}</text>
            </box>
          )}
        </Show>
      </ArcanaSection>
      <Show when={fileReads().length > 0 || fileWrites().length > 0 || shellCommands().length > 0}>
        <ArcanaSection title="Recent Evidence">
          <For each={fileReads().slice(-3)}>
            {(read) => (
              <ArcanaTapeItem
                kind="READ"
                summary={read.path ?? "unknown path"}
                detail={read.exists === false ? "missing" : (read.reason ?? "")}
                tone="muted"
              />
            )}
          </For>
          <For each={fileWrites().slice(-3)}>
            {(write) => (
              <ArcanaTapeItem
                kind="WRITE"
                summary={`${write.mode ?? "unknown"} ${write.path ?? "unknown path"}`}
                detail={write.reason ?? ""}
                tone="muted"
              />
            )}
          </For>
          <For each={shellCommands().slice(-3)}>
            {(cmd) => (
              <ArcanaTapeItem
                kind="SHELL"
                summary={`${cmd.status ?? "unknown"} ${cmd.command ?? "unknown command"}`}
                detail={cmd.risk ?? ""}
                tone="muted"
              />
            )}
          </For>
        </ArcanaSection>
      </Show>
      <ArcanaSection
        title="Consensus Evidence"
        detail={`${props.proof.consensus?.length ?? 0} record${props.proof.consensus?.length === 1 ? "" : "s"}`}
      >
        <ConsensusEvidencePanel consensus={props.proof.consensus ?? []} />
      </ArcanaSection>
      <ArcanaSection
        title="ML Evidence"
        detail={`${props.proof.ml_evidence?.length ?? 0} signal${props.proof.ml_evidence?.length === 1 ? "" : "s"}`}
      >
        <MLEvidencePanel evidence={props.proof.ml_evidence ?? []} />
      </ArcanaSection>
      <ArcanaSection title="Proof Tape" detail={`${events().length} event${events().length === 1 ? "" : "s"}`}>
        <Show when={events().length > 0} fallback={<text fg={theme.warning}>No RunProof events recorded.</text>}>
          <For each={events()}>
            {(event) => (
              <ArcanaTapeItem
                time={eventTime(event.timestamp)}
                kind={eventLabel(event.type)}
                summary={event.summary ?? "No summary recorded."}
                tone={eventTone(event)}
                detail={[
                  event.actor ? `actor=${event.actor}` : undefined,
                  event.risk ? `risk=${event.risk}` : undefined,
                  event.status ? `status=${event.status}` : undefined,
                  refsText(event.refs),
                ]
                  .filter(Boolean)
                  .join("  ")}
              />
            )}
          </For>
        </Show>
      </ArcanaSection>
    </ArcanaSurface>
  )
}

function DiffList(props: { title: string; diffs: RunProofDiffView[]; empty: string }) {
  const { theme } = useTheme()
  return (
    <ArcanaSection title={props.title}>
      <Show when={props.diffs.length > 0} fallback={<text fg={theme.textMuted}>{props.empty}</text>}>
        <For each={props.diffs}>
          {(diff) => (
            <ArcanaTapeItem
              kind={diff.status?.toUpperCase() ?? "DIFF"}
              summary={`${diff.path ?? "unknown path"} +${diff.additions ?? 0} -${diff.deletions ?? 0}`}
              detail={diff.summary ?? diff.id ?? "No diff summary recorded."}
            />
          )}
        </For>
      </Show>
    </ArcanaSection>
  )
}

function DialogRunProofDiffGate(props: {
  proof: RunProofView
  path: string
  onCopyRollbackRestore?: (command: string) => void
  onStageRollbackRestore?: () => void
  onApproveRollbackRestore?: () => void
}) {
  const { theme } = useTheme()
  const diffs = () => props.proof.diffs ?? { proposed: [], applied: [], rejected: [] }
  const pending = () => diffs().proposed.length
  const applied = () => diffs().applied.length
  const rejected = () => diffs().rejected.length
  const writes = () => props.proof.execution?.file_writes ?? []
  const risk = () => props.proof.risk?.level ?? props.proof.contract?.risk_level ?? "unknown"
  const restoreCommand = () => rollbackRestoreCommandValue(props.proof)
  const approval = () =>
    props.proof.risk?.required_approval || (props.proof.contract?.required_approvals?.length ?? 0) > 0
      ? "required"
      : "not required"
  return (
    <ArcanaSurface title="DIFF GATE" path={props.path} meta={`run ${compactProofId(props.proof.id)}`}>
      <ArcanaSection title="Mutation Gate">
        <ArcanaMetricLine
          items={[
            `pending=${pending()}`,
            `applied=${applied()}`,
            `rejected=${rejected()}`,
            `writes=${writes().length}`,
            `risk=${risk()}`,
            `approval=${approval()}`,
          ]}
        />
        <FieldList items={props.proof.risk?.reasons} empty="No risk reasons recorded." />
        <text fg={theme.textMuted}>Rollback: {rollbackSummary(props.proof)}</text>
        <text fg={theme.textMuted}>Restore: {rollbackRestoreCommand(props.proof)}</text>
        <text fg={theme.textMuted}>Valid until: {rollbackValidity(props.proof)}</text>
        <text fg={props.proof.rollback?.approval_required ? theme.warning : theme.textMuted}>
          Restore status: {rollbackRestoreStatus(props.proof)} Approval: {rollbackApprovalStatus(props.proof)}
        </text>
        <Show when={rollbackExecutionStatus(props.proof)}>
          {(value) => <text fg={theme.textMuted}>Restore execution: {value()}</text>}
        </Show>
        <Show when={restoreCommand()}>
          {(command) => (
            <box gap={0}>
              <text fg={theme.primary} onMouseUp={() => props.onCopyRollbackRestore?.(command())}>
                copy restore command
              </text>
              <Show when={rollbackRestoreCanBeStaged(props.proof)}>
                <text fg={theme.warning} onMouseUp={() => props.onStageRollbackRestore?.()}>
                  stage restore for approval
                </text>
              </Show>
              <Show when={rollbackRestoreCanBeApproved(props.proof)}>
                <text fg={theme.warning} onMouseUp={() => props.onApproveRollbackRestore?.()}>
                  approve restore
                </text>
              </Show>
            </box>
          )}
        </Show>
      </ArcanaSection>
      <DiffList title="Proposed diffs" diffs={diffs().proposed} empty="No proposed diffs." />
      <DiffList title="Applied diffs" diffs={diffs().applied} empty="No applied diffs." />
      <DiffList title="Rejected diffs" diffs={diffs().rejected} empty="No rejected diffs." />
    </ArcanaSurface>
  )
}

function checkLabel(check: RunProofCheckView): string {
  return check.command ?? check.description ?? check.source ?? check.id ?? "verification check"
}

function statusMark(status: string | undefined): string {
  if (status === "passed") return "PASS"
  if (status === "failed") return "FAIL"
  if (status === "skipped") return "SKIP"
  if (status === "not_run") return "WAIT"
  return (status ?? "unknown").toUpperCase()
}

function CheckList(props: { title: string; checks: RunProofCheckView[]; empty: string }) {
  const { theme } = useTheme()
  return (
    <ArcanaSection title={props.title}>
      <Show when={props.checks.length > 0} fallback={<text fg={theme.textMuted}>{props.empty}</text>}>
        <For each={props.checks}>
          {(check) => (
            <ArcanaTapeItem
              kind={statusMark(check.status)}
              summary={checkLabel(check)}
              detail={[
                check.summary ?? check.evidence,
                check.passed !== undefined || check.failed !== undefined || check.skipped !== undefined
                  ? `passed=${check.passed ?? 0} failed=${check.failed ?? 0} skipped=${check.skipped ?? 0}`
                  : undefined,
              ]
                .filter(Boolean)
                .join("  ")}
              tone={check.status === "failed" ? "error" : check.status === "passed" ? "normal" : "muted"}
            />
          )}
        </For>
      </Show>
    </ArcanaSection>
  )
}

function DialogRunProofVerify(props: { proof: RunProofView; path: string }) {
  const { theme } = useTheme()
  const verification = () =>
    props.proof.verification ?? {
      diagnostics: [],
      tests: [],
      manual_checks: [],
    }
  const fixedChecks = () =>
    [verification().typecheck, verification().lint, verification().build].filter(
      (check): check is RunProofCheckView => check !== undefined,
    )
  const allChecks = () => [
    ...fixedChecks(),
    ...verification().diagnostics,
    ...verification().tests,
    ...verification().manual_checks,
    ...(verification().verifier_review
      ? [
          {
            status: verification().verifier_review?.status,
            summary: verification().verifier_review?.summary,
            source: "verifier",
          },
        ]
      : []),
  ]
  const passed = () => allChecks().filter((check) => check.status === "passed").length
  const failed = () => allChecks().filter((check) => check.status === "failed").length
  const pending = () => allChecks().filter((check) => check.status !== "passed" && check.status !== "failed").length
  const score = () => props.proof.final_evidence?.proof_score
  return (
    <ArcanaSurface title="VERIFY" path={props.path} meta={`run ${compactProofId(props.proof.id)}`}>
      <ArcanaSection title="Verifier Board">
        <ArcanaMetricLine
          items={[
            `passed=${passed()}`,
            `failed=${failed()}`,
            `pending=${pending()}`,
            `final=${props.proof.final_evidence?.completed === true ? "completed" : "open"}`,
            score() === undefined ? undefined : `proof=${score()}/100`,
          ]}
        />
        <text fg={theme.textMuted}>{props.proof.final_evidence?.summary ?? "No final evidence summary recorded."}</text>
      </ArcanaSection>
      <CheckList
        title="Required checks"
        checks={fixedChecks()}
        empty="No typecheck, lint, or build evidence recorded."
      />
      <CheckList title="Tests" checks={verification().tests} empty="No test evidence recorded." />
      <CheckList title="Diagnostics" checks={verification().diagnostics} empty="No diagnostic evidence recorded." />
      <CheckList title="Manual checks" checks={verification().manual_checks} empty="No manual checks recorded." />
      <Show when={verification().verifier_review}>
        {(review) => (
          <ArcanaSection title="Verifier Review">
            <text fg={theme.text}>
              {statusMark(review().status)} {review().model ?? ""}
            </text>
            <text fg={theme.textMuted}>{review().summary ?? "No verifier summary recorded."}</text>
            <FieldList items={review().concerns} empty="No verifier concerns recorded." />
          </ArcanaSection>
        )}
      </Show>
    </ArcanaSurface>
  )
}

function yesNo(value: boolean | undefined): string {
  if (value === undefined) return "not recorded"
  return value ? "yes" : "no"
}

function costLabel(value: number | undefined): string {
  return value === undefined ? "not recorded" : `$${value.toFixed(6)}`
}

function latencyLabel(value: number | undefined): string {
  return value === undefined ? "not recorded" : `${value}ms`
}

function DialogRunProofSovereignty(props: { proof: RunProofView; path: string }) {
  const { theme } = useTheme()
  const route = () => props.proof.sovereignty
  return (
    <ArcanaSurface title="SOVEREIGNTY" path={props.path} meta={`run ${compactProofId(props.proof.id)}`}>
      <Show
        when={route()}
        fallback={<text fg={theme.warning}>No provider/model route evidence recorded in this RunProof.</text>}
      >
        {(value) => (
          <box gap={1}>
            <ArcanaSection title="Provider Route">
              <text fg={theme.text}>Provider: {value().provider ?? "not recorded"}</text>
              <text fg={theme.text}>Model: {value().model ?? "not recorded"}</text>
              <text fg={theme.text}>Route: {value().route ?? "not recorded"}</text>
              <text fg={theme.text}>Selection source: {value().selection_source ?? "not recorded"}</text>
              <text fg={theme.text}>Data boundary: {value().data_boundary ?? "not recorded"}</text>
              <text fg={theme.text}>Data left local machine: {yesNo(value().data_left_local)}</text>
              <text fg={theme.textMuted}>
                Fallback:{" "}
                {[value().fallback_provider, value().fallback_model].filter(Boolean).join("/") || "not recorded"}
              </text>
              <text fg={theme.textMuted}>
                Cost: {costLabel(value().estimated_cost_usd)} Latency: {latencyLabel(value().latency_ms)}
              </text>
            </ArcanaSection>
            <ArcanaSection title="Route Evidence">
              <text fg={theme.textMuted}>Recorded: {eventTime(value().timestamp)}</text>
              <text fg={theme.textMuted}>{value().reason ?? value().summary ?? "No routing reason recorded."}</text>
            </ArcanaSection>
          </box>
        )}
      </Show>
    </ArcanaSurface>
  )
}

function DialogRunProofMissing(props: { result: Extract<ProofLoadResult, { status: "unbound" | "error" }> }) {
  const { theme } = useTheme()
  return (
    <ArcanaSurface title="RUNPROOF">
      <Show
        when={props.result.status === "unbound" ? props.result : undefined}
        fallback={
          <text fg={theme.error}>
            Failed to read RunProof: {props.result.status === "error" ? props.result.message : "unknown error"}
          </text>
        }
      >
        <ArcanaTapeItem
          kind="UNBOUND"
          summary="No active RunProof is bound to this TUI session"
          detail="Use an Arcana task command with a prompt, for example /contract <task> or /consensus <task>."
          tone="warning"
        />
      </Show>
    </ArcanaSurface>
  )
}

export type TuiInput = {
  url: string
  args: Args
  config: TuiConfig.Resolved
  onSnapshot?: () => Promise<string[]>
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
  pluginHost: TuiPluginHost
}

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message
  }
  return error instanceof Error ? error.message : String(error)
}

function isVersionGreater(left: string, right: string) {
  const parse = (value: string) => {
    const [core, prerelease] = value.replace(/^v/, "").split("-", 2)
    return { core: core.split(".").map((part) => Number.parseInt(part, 10) || 0), prerelease }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index++) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference) return difference > 0
  }
  if (a.prerelease === b.prerelease) return false
  if (!a.prerelease) return true
  if (!b.prerelease) return false
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true }) > 0
}

export const run = Effect.fn("Tui.run")(function* (input: TuiInput) {
  const global = yield* Global.Service
  const exit = { epilogue: undefined as string | undefined, reason: undefined as unknown }
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      const renderer = yield* Effect.acquireRelease(
        Effect.tryPromise(() =>
          createCliRenderer({
            externalOutputMode: "passthrough",
            targetFps: 60,
            gatherStats: false,
            exitOnCtrlC: false,
            useKittyKeyboard: {},
            autoFocus: false,
            openConsoleOnError: false,
            useMouse: !Flag.ARCANA_DISABLE_MOUSE && input.config.mouse,
            consoleOptions: {
              keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
            },
          }),
        ),
        (renderer) =>
          Effect.sync(() => {
            destroyRenderer(renderer)
          }),
      )
      win32DisableProcessedInput()
      const keymap = createDefaultOpenTuiKeymap(renderer)
      yield* Effect.acquireRelease(
        Effect.sync(() => registerOpencodeKeymap(keymap, renderer, input.config)),
        (unregister) => Effect.sync(unregister),
      )
      // Optional custom background image (composited into empty cells; see background.ts).
      const bg = input.config.background
      if (!process.env.NO_COLOR && bg?.enabled && bg.image) {
        yield* Effect.promise(async () => {
          const { decodeImage, createBackgroundComposite } = await import("./background")
          const image = await decodeImage(bg.image!)
          if (image && !renderer.isDestroyed) {
            renderer.addPostProcessFn(
              createBackgroundComposite(image, { opacity: bg.opacity ?? 0.5, fit: bg.fit ?? "cover" }),
            )
          }
        })
      }
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          try {
            await input.pluginHost.dispose()
          } catch (error) {
            console.error("Failed to dispose TUI plugins", error)
          }
        }),
      )
      yield* Effect.addFinalizer(() => Effect.sync(TuiAudio.dispose))
      const shutdown = yield* Deferred.make<unknown>()
      const onSighup = () => destroyRenderer(renderer)
      yield* Effect.acquireRelease(
        Effect.sync(() => process.on("SIGHUP", onSighup)),
        () => Effect.sync(() => process.off("SIGHUP", onSighup)),
      )
      renderer.once("destroy", () => Deferred.doneUnsafe(shutdown, Effect.void))
      const pluginRuntime = createPluginRuntime()

      yield* Effect.tryPromise(async () => {
        // Prewarm palette before ThemeProvider mounts so `system` theme avoids a first-paint fallback flash.
        void renderer.getPalette({ size: 16 }).catch(() => undefined)
        const mode = (await renderer.waitForThemeMode(1000)) ?? "dark"
        if (renderer.isDestroyed) return

        await render(() => {
          return (
            <ExitProvider
              exit={(reason) => {
                if (renderer.isDestroyed) return
                exit.reason = reason
                destroyRenderer(renderer)
              }}
            >
              <EpilogueProvider set={(value) => (exit.epilogue = value)}>
                <ErrorBoundary fallback={(error, reset) => <ErrorComponent error={error} reset={reset} mode={mode} />}>
                  <TuiPathsProvider
                    value={{
                      cwd: process.cwd(),
                      home: global.home,
                      state: global.state,
                      worktree: global.data + "/worktree",
                    }}
                  >
                    <TuiTerminalEnvironmentProvider
                      value={{
                        platform: process.platform,
                        multiplexer: process.env.TMUX ? "tmux" : process.env.STY ? "screen" : undefined,
                        displayServer: process.env.WAYLAND_DISPLAY
                          ? "wayland"
                          : process.env.DISPLAY
                            ? "x11"
                            : undefined,
                      }}
                    >
                      <TuiStartupProvider
                        value={{
                          initialRoute: process.env.ARCANA_ROUTE ? JSON.parse(process.env.ARCANA_ROUTE) : undefined,
                          skipInitialLoading: Boolean(process.env.ARCANA_FAST_BOOT),
                        }}
                      >
                        <ClipboardProvider>
                          <OpencodeKeymapProvider keymap={keymap}>
                            <ArgsProvider {...input.args}>
                              <KVProvider>
                                <ToastProvider>
                                  <RouteProvider
                                    initialRoute={
                                      input.args.continue
                                        ? {
                                            type: "session",
                                            sessionID: "dummy",
                                          }
                                        : undefined
                                    }
                                  >
                                    <TuiConfigProvider config={input.config}>
                                      <PluginRuntimeProvider value={pluginRuntime}>
                                        <SDKProvider
                                          url={input.url}
                                          directory={input.directory}
                                          fetch={input.fetch}
                                          headers={input.headers}
                                          events={input.events}
                                        >
                                          <ProjectProvider>
                                            <SyncProvider>
                                              <DataProvider>
                                                <ThemeProvider mode={mode}>
                                                  <LocalProvider>
                                                    <PromptStashProvider>
                                                      <DialogProvider>
                                                        <FrecencyProvider>
                                                          <PromptHistoryProvider>
                                                            <PromptRefProvider>
                                                              <EditorContextProvider>
                                                                <App
                                                                  onSnapshot={input.onSnapshot}
                                                                  pluginHost={input.pluginHost}
                                                                />
                                                              </EditorContextProvider>
                                                            </PromptRefProvider>
                                                          </PromptHistoryProvider>
                                                        </FrecencyProvider>
                                                      </DialogProvider>
                                                    </PromptStashProvider>
                                                  </LocalProvider>
                                                </ThemeProvider>
                                              </DataProvider>
                                            </SyncProvider>
                                          </ProjectProvider>
                                        </SDKProvider>
                                      </PluginRuntimeProvider>
                                    </TuiConfigProvider>
                                  </RouteProvider>
                                </ToastProvider>
                              </KVProvider>
                            </ArgsProvider>
                          </OpencodeKeymapProvider>
                        </ClipboardProvider>
                      </TuiStartupProvider>
                    </TuiTerminalEnvironmentProvider>
                  </TuiPathsProvider>
                </ErrorBoundary>
              </EpilogueProvider>
            </ExitProvider>
          )
        }, renderer)
      })
      yield* Deferred.await(shutdown)
      return { epilogue: exit.epilogue, reason: exit.reason }
    }),
  )
  yield* Effect.sync(() => {
    win32FlushInputBuffer()
    if (result.reason !== undefined)
      process.stderr.write((cliErrorMessage(result.reason) ?? errorFormat(result.reason)) + "\n")
    if (result.epilogue) process.stdout.write(result.epilogue + "\n")
  })
})

function App(props: { onSnapshot?: () => Promise<string[]>; pluginHost: TuiPluginHost }) {
  const startup = useTuiStartup()
  const tuiConfig = useTuiConfig()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const dialog = useDialog()
  const local = useLocal()
  const kv = useKV()
  const keymap = useOpencodeKeymap()
  const event = useEvent()
  const sdk = useSDK()
  const toast = useToast()
  const themeState = useTheme()
  const { theme, mode, setMode, locked, lock, unlock } = themeState
  const sync = useSync()
  const project = useProject()
  const exit = useExit()
  const promptRef = usePromptRef()
  const pluginRuntime = usePluginRuntime()
  const attention = createTuiAttention({ renderer, config: tuiConfig, kv })
  const clipboard = useClipboard()

  const api = createTuiApi(
    createTuiApiAdapters({
      version: InstallationVersion,
      tuiConfig,
      dialog,
      keymap,
      kv,
      route,
      routes: pluginRuntime.routes,
      event,
      sdk,
      sync,
      theme: themeState,
      toast,
      renderer,
      attention,
      Slot: pluginRuntime.Slot,
    }),
  )
  const [ready, setReady] = createSignal(false)
  props.pluginHost
    .start({
      api,
      config: tuiConfig,
      runtime: pluginRuntime,
      dispose: () => attention.dispose(),
    })
    .catch((error) => {
      console.error("Failed to load TUI plugins", error)
      toast.show({ message: "Failed to load plugins — check console for details", variant: "error", duration: 8000 })
    })
    .finally(() => {
      if (process.env["ARCANA_PROFILE_STARTUP"]) {
        performance.mark("tui-ready")
        // Flush profile marks after TUI is interactive
        setTimeout(() => {
          const entries = performance.getEntriesByType("measure")
          if (entries.length) {
            process.stderr.write("[profile] Startup phase timings:\n")
            for (const e of entries) {
              process.stderr.write(`[profile] ${e.name.padEnd(80)} ${Math.round(e.duration)}ms\n`)
            }
          }
          const allMarks = performance.getEntriesByType("mark")
          if (allMarks.length >= 2) {
            const total = Math.round(allMarks[allMarks.length - 1].startTime - allMarks[0].startTime)
            process.stderr.write(`[profile] TOTAL${"".padEnd(83)}${total}ms\n`)
          }
          performance.clearMarks()
          performance.clearMeasures()
        }, 0)
      }
      setReady(true)
    })

  // Let selection copy/dismiss win ahead of normal bindings when explicit copy is required.
  const offSelectionKeys = keymap.intercept(
    "key",
    ({ event }) => {
      if (!Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
      Selection.handleSelectionKey(renderer, toast, event, clipboard)
    },
    { priority: 1 },
  )
  const eventUnsubs: (() => void)[] = []
  onCleanup(() => {
    offSelectionKeys()
    attention.dispose()
    for (const fn of eventUnsubs) {
      try {
        fn()
      } catch {}
    }
  })

  // Wire up console copy-to-clipboard via opentui's onCopySelection callback
  renderer.console.onCopySelection = async (text: string) => {
    if (!text || text.length === 0) return

    await clipboard
      .write?.(text)
      .then(() => toast.show({ message: COPY.inscribedToClipboard, variant: "info" }))
      .catch(toast.error)

    renderer.clearSelection()
  }
  const [terminalTitleEnabled, setTerminalTitleEnabled] = createSignal(kv.get("terminal_title_enabled", true))
  const [pasteSummaryEnabled, setPasteSummaryEnabled] = createSignal(
    kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary),
  )
  const [mlRuntimeEnabled, setMlRuntimeEnabled] = createSignal(kv.get("ml_runtime_enabled", Flag.ARCANA_ML_RUNTIME))

  // Update terminal window title based on current route and session
  createEffect(() => {
    if (!terminalTitleEnabled() || Flag.ARCANA_DISABLE_TERMINAL_TITLE) return

    if (route.data.type === "home") {
      renderer.setTerminalTitle("⛧ ARCANA")
      return
    }

    if (route.data.type === "session") {
      const session = sync.session.get(route.data.sessionID)
      if (!session || isDefaultTitle(session.title)) {
        renderer.setTerminalTitle("⛧ ARCANA")
        return
      }

      const title = session.title.length > 40 ? session.title.slice(0, 37) + "..." : session.title
      renderer.setTerminalTitle(`${APP_ABBR} | ${title}`)
      return
    }

    if (route.data.type === "plugin") {
      renderer.setTerminalTitle(`${APP_ABBR} | ${route.data.id}`)
    }
  })

  const args = useArgs()
  onMount(() => {
    batch(() => {
      if (args.agent) local.agent.set(args.agent)
      if (args.model) {
        const { providerID, modelID } = Model.parse(args.model)
        if (!providerID || !modelID)
          return toast.show({
            variant: "warning",
            message: `Invalid model format: ${args.model}`,
            duration: 3000,
          })
        local.model.set({ providerID, modelID }, { recent: true })
      }
      if (args.sessionID && !args.fork) {
        route.navigate({
          type: "session",
          sessionID: args.sessionID,
        })
      }
    })
  })

  let continued = false
  createEffect(() => {
    // When using -c, session list is loaded in blocking phase, so we can navigate at "partial"
    if (continued || sync.status === "loading" || !args.continue) return
    const match = sync.data.session
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .find((x) => x.parentID === undefined)?.id
    if (match) {
      continued = true
      if (args.fork) {
        void sdk.client.session.fork({ sessionID: match }).then((result) => {
          if (result.data?.id) {
            route.navigate({ type: "session", sessionID: result.data.id })
          } else {
            toast.show({ message: "Failed to fork session", variant: "error" })
          }
        })
      } else {
        route.navigate({ type: "session", sessionID: match })
      }
    }
  })

  // Handle --session with --fork: wait for sync to be fully complete before forking
  // (session list loads in non-blocking phase for --session, so we must wait for "complete"
  // to avoid a race where reconcile overwrites the newly forked session)
  let forked = false
  createEffect(() => {
    if (forked || sync.status !== "complete" || !args.sessionID || !args.fork) return
    forked = true
    void sdk.client.session.fork({ sessionID: args.sessionID }).then((result) => {
      if (result.data?.id) {
        route.navigate({ type: "session", sessionID: result.data.id })
      } else {
        toast.show({ message: "Failed to fork session", variant: "error" })
      }
    })
  })

  createEffect(
    on(
      () => sync.status === "complete" && sync.data.provider.length === 0,
      (isEmpty, wasEmpty) => {
        // only trigger when we transition into an empty-provider state
        if (!isEmpty || wasEmpty) return
        dialog.replace(() => <DialogProviderList />)
      },
    ),
  )

  const connected = useConnected()
  const currentWorktreeWorkspace = createMemo(() => {
    const workspaceID = project.workspace.current()
    if (!workspaceID) return
    const workspace = project.workspace.get(workspaceID)
    if (workspace?.type !== "worktree" || !workspace.directory) return
    return workspace
  })
  async function showRunProofSurface(kind: "contract" | "actions" | "diffgate" | "verify" | "sovereignty") {
    const result = await loadActiveRunProof()
    if (result.status !== "ready") {
      dialog.replace(() => <DialogRunProofMissing result={result} />)
      return
    }
    const copyRollbackRestore = async (command: string) => {
      if (!command) return
      await clipboard
        .write?.(command)
        .then(() => toast.show({ message: "Copied rollback restore command", variant: "info" }))
        .catch(toast.error)
    }
    const stageRollbackRestore = async () => {
      const staged = await stageActiveRunProofRollbackRestore()
      if (staged.status !== "ready") {
        dialog.replace(() => <DialogRunProofMissing result={staged} />)
        return
      }
      toast.show({ message: "Rollback restore staged for approval", variant: "warning" })
      await showRunProofSurface(kind)
    }
    const approveRollbackRestore = async () => {
      const approved = await approveActiveRunProofRollbackRestore()
      if (approved.status !== "ready") {
        dialog.replace(() => <DialogRunProofMissing result={approved} />)
        return
      }
      toast.show({ message: "Rollback restore approved; not executed", variant: "warning" })
      await showRunProofSurface(kind)
    }
    dialog.replace(() => {
      if (kind === "contract") {
        return (
          <DialogRunProofContract
            proof={result.proof}
            path={result.path}
            onCopyRollbackRestore={copyRollbackRestore}
            onStageRollbackRestore={() => void stageRollbackRestore().catch(toast.error)}
            onApproveRollbackRestore={() => void approveRollbackRestore().catch(toast.error)}
          />
        )
      }
      if (kind === "diffgate") {
        return (
          <DialogRunProofDiffGate
            proof={result.proof}
            path={result.path}
            onCopyRollbackRestore={copyRollbackRestore}
            onStageRollbackRestore={() => void stageRollbackRestore().catch(toast.error)}
            onApproveRollbackRestore={() => void approveRollbackRestore().catch(toast.error)}
          />
        )
      }
      if (kind === "verify") return <DialogRunProofVerify proof={result.proof} path={result.path} />
      if (kind === "sovereignty") return <DialogRunProofSovereignty proof={result.proof} path={result.path} />
      return (
        <DialogRunProofActions
          proof={result.proof}
          path={result.path}
          onCopyRollbackRestore={copyRollbackRestore}
          onStageRollbackRestore={() => void stageRollbackRestore().catch(toast.error)}
          onApproveRollbackRestore={() => void approveRollbackRestore().catch(toast.error)}
        />
      )
    })
    dialog.setSize("xlarge")
  }

  const appCommands = createMemo(() =>
    [
      {
        name: COMMAND_PALETTE_COMMAND,
        title: "Show command palette",
        category: "System",
        hidden: true,
        run: () => {
          dialog.replace(() => <CommandPaletteDialog />)
        },
      },
      {
        name: "session.list",
        title: "Switch session",
        category: "Session",
        suggested: sync.data.session.length > 0,
        slashName: "sessions",
        slashAliases: ["resume", "continue"],
        run: () => {
          dialog.replace(() => <DialogSessionList />)
        },
      },
      {
        name: "session.new",
        title: "New session",
        suggested: route.data.type === "session",
        category: "Session",
        slashName: "new",
        slashAliases: ["clear"],
        run: () => {
          route.navigate({
            type: "home",
          })
          dialog.clear()
        },
      },
      {
        name: "ml.toggle",
        title: mlRuntimeEnabled() ? "Disable ML runtime" : "Enable ML runtime",
        suggested: mlRuntimeEnabled(),
        category: "ML",
        slashName: "ml",
        slashAliases: ["quality"],
        run: () => {
          setMlRuntimeEnabled((prev) => {
            const next = !prev
            kv.set("ml_runtime_enabled", next)
            toast.show({
              message: next ? "ML runtime on (quality gate + silent revision)" : "ML runtime off",
              variant: next ? "info" : "info",
            })
            return next
          })
          dialog.clear()
        },
      },
      {
        name: "arcana.contract",
        slashName: "contract",
        title: "Inspect active execution contract",
        desc: "Show the active execution contract for this session",
        category: "Arcana",
        run: () => void showRunProofSurface("contract").catch(toast.error),
      },
      {
        name: "arcana.actions",
        slashName: "actions",
        title: "Show action timeline",
        desc: "Show the execution action timeline",
        category: "Arcana",
        run: () => void showRunProofSurface("actions").catch(toast.error),
      },
      {
        name: "arcana.diffgate",
        slashName: "diffgate",
        title: "Show diff gate state",
        desc: "Show verification gate state",
        category: "Arcana",
        run: () => void showRunProofSurface("diffgate").catch(toast.error),
      },
      {
        name: "arcana.verify",
        slashName: "verify",
        title: "Show verifier board",
        desc: "Show verifier board and completion gates",
        category: "Arcana",
        run: () => void showRunProofSurface("verify").catch(toast.error),
      },
      {
        name: "arcana.sovereignty",
        slashName: "sovereignty",
        title: "Show provider route evidence",
        desc: "Show provider/model route evidence",
        category: "Arcana",
        run: () => void showRunProofSurface("sovereignty").catch(toast.error),
      },
      {
        name: "arcana.consensus",
        slashName: "consensus",
        title: "Prepare consensus evidence task",
        desc: "Use /consensus <prompt> to request proposals, critiques, votes, and recorded consensus evidence",
        category: "Arcana",
        run: () => {
          toast.show({
            message: "Use /consensus <prompt> to submit a consensus evidence task",
            variant: "info",
          })
          dialog.clear()
        },
      },
      {
        name: "workspace.copy_path",
        title: "Copy worktree path",
        category: "Workspace",
        enabled: () => currentWorktreeWorkspace() !== undefined,
        run: async () => {
          const workspace = currentWorktreeWorkspace()
          if (!workspace?.directory) return
          await clipboard
            .write?.(workspace.directory)
            .then(() => toast.show({ message: "Copied worktree path", variant: "info" }))
            .catch(toast.error)
          dialog.clear()
        },
      },
      {
        name: "workspace.list",
        title: "Manage workspaces",
        category: "Workspace",
        hidden: !Flag.ARCANA_EXPERIMENTAL_WORKSPACES,
        slashName: "workspaces",
        run: () => {
          dialog.replace(() => <DialogWorkspaceList />)
        },
      },
      ...Array.from({ length: 9 }, (_, i) => ({
        name: `session.quick_switch.${i + 1}`,
        title: `Switch to session in quick slot ${i + 1}`,
        category: "Session",
        hidden: true,
        run: () => {
          local.session.quickSwitch(i + 1)
        },
      })),
      {
        name: "model.list",
        title: "Switch model",
        suggested: true,
        category: "Agent",
        slashName: "models",
        // Bias /mo toward /models over /move without changing global fuzzy scoring.
        slashAliases: ["mo"],
        run: () => {
          dialog.replace(() => <DialogModel />)
        },
      },
      {
        name: "model.cycle_recent",
        title: "Model cycle",
        category: "Agent",
        hidden: true,
        run: () => {
          local.model.cycle(1)
        },
      },
      {
        name: "model.cycle_recent_reverse",
        title: "Model cycle reverse",
        category: "Agent",
        hidden: true,
        run: () => {
          local.model.cycle(-1)
        },
      },
      {
        name: "model.cycle_favorite",
        title: "Favorite cycle",
        category: "Agent",
        hidden: true,
        run: () => {
          local.model.cycleFavorite(1)
        },
      },
      {
        name: "model.cycle_favorite_reverse",
        title: "Favorite cycle reverse",
        category: "Agent",
        hidden: true,
        run: () => {
          local.model.cycleFavorite(-1)
        },
      },
      {
        name: "agent.list",
        title: "Switch agent",
        category: "Agent",
        slashName: "agents",
        run: () => {
          dialog.replace(() => <DialogAgent />)
        },
      },
      {
        name: "mcp.list",
        title: "Toggle MCPs",
        category: "Agent",
        slashName: "mcps",
        run: () => {
          dialog.replace(() => <DialogMcp />)
        },
      },
      {
        name: "agent.cycle",
        title: "Open agent picker",
        category: "Agent",
        hidden: true,
        run: () => {
          dialog.replace(() => <DialogAgent />)
        },
      },
      {
        name: "variant.cycle",
        title: "Variant cycle",
        category: "Agent",
        run: () => {
          local.model.variant.cycle()
        },
      },
      {
        name: "variant.list",
        title: "Switch model variant",
        category: "Agent",
        hidden: local.model.variant.list().length === 0,
        slashName: "variants",
        run: () => {
          if (local.model.variant.list().length === 0) {
            return toast.show({
              title: "No variants available",
              message: "The current model does not support any variants.",
              variant: "info",
            })
          }
          dialog.replace(() => <DialogVariant />)
        },
      },
      {
        name: "agent.cycle.reverse",
        title: "Open agent picker",
        category: "Agent",
        hidden: true,
        run: () => {
          dialog.replace(() => <DialogAgent />)
        },
      },
      {
        name: "provider.connect",
        title: "Connect provider",
        suggested: !connected(),
        slashName: "connect",
        run: () => {
          dialog.replace(() => <DialogProviderList />)
        },
        category: "Provider",
      },
      ...(sync.data.console_state.switchableOrgCount > 1
        ? [
            {
              name: "console.org.switch",
              title: "Switch org",
              suggested: Boolean(sync.data.console_state.activeOrgName),
              slashName: "org",
              slashAliases: ["orgs", "switch-org"],
              run: () => {
                dialog.replace(() => <DialogConsoleOrg />)
              },
              category: "Provider",
            },
          ]
        : []),
      {
        name: "arcana.status",
        title: "View status",
        slashName: "status",
        run: () => {
          dialog.replace(() => <DialogStatus />)
        },
        category: "System",
      },
      {
        name: "theme.switch",
        title: "Switch theme",
        slashName: "themes",
        run: () => {
          dialog.replace(() => <DialogThemeList />)
        },
        category: "System",
      },
      {
        name: "theme.switch_mode",
        title: mode() === "dark" ? "Switch to light mode" : "Switch to dark mode",
        run: () => {
          setMode(mode() === "dark" ? "light" : "dark")
          dialog.clear()
        },
        category: "System",
      },
      {
        name: "theme.mode.lock",
        title: locked() ? "Unlock theme mode" : "Lock theme mode",
        run: () => {
          if (locked()) unlock()
          else lock()
          dialog.clear()
        },
        category: "System",
      },
      {
        name: "help.show",
        title: "Help",
        slashName: "help",
        run: () => {
          dialog.replace(() => <DialogHelp />)
        },
        category: "System",
      },
      {
        name: "docs.open",
        title: "Open docs",
        run: () => {
          import("open").then((m) => m.default(DOCS_URL)).catch(() => {})
          dialog.clear()
        },
        category: "System",
      },
      {
        name: "app.exit",
        title: "Exit the app",
        slashName: "exit",
        slashAliases: ["quit", "q"],
        run: () => exit(),
        category: "System",
      },
      {
        name: "app.debug",
        title: "Toggle debug panel",
        category: "System",
        run: () => {
          renderer.toggleDebugOverlay()
          dialog.clear()
        },
      },
      {
        name: "app.console",
        title: "Toggle console",
        category: "System",
        run: () => {
          renderer.console.toggle()
          dialog.clear()
        },
      },
      {
        name: "app.heap_snapshot",
        title: "Write heap snapshot",
        category: "System",
        run: async () => {
          const files = await props.onSnapshot?.()
          toast.show({
            variant: "info",
            message: `Heap snapshot written to ${files?.join(", ")}`,
            duration: 5000,
          })
          dialog.clear()
        },
      },
      {
        name: "terminal.suspend",
        title: "Suspend terminal",
        category: "System",
        hidden: true,
        enabled: process.platform !== "win32",
        run: () => {
          renderer.suspend()
          process.once("SIGCONT", () => renderer.resume())
          process.kill(0, "SIGTSTP")
        },
      },
      {
        name: "terminal.title.toggle",
        title: terminalTitleEnabled() ? "Disable terminal title" : "Enable terminal title",
        category: "System",
        run: () => {
          setTerminalTitleEnabled((prev) => {
            const next = !prev
            kv.set("terminal_title_enabled", next)
            if (!next) renderer.setTerminalTitle("")
            return next
          })
          dialog.clear()
        },
      },
      {
        name: "app.toggle.animations",
        title: kv.get("animations_enabled", true) ? "Disable animations" : "Enable animations",
        category: "System",
        run: () => {
          kv.set("animations_enabled", !kv.get("animations_enabled", true))
          dialog.clear()
        },
      },
      {
        name: "app.toggle.file_context",
        title: kv.get("file_context_enabled", true) ? "Disable file context" : "Enable file context",
        category: "System",
        run: () => {
          kv.set("file_context_enabled", !kv.get("file_context_enabled", true))
          dialog.clear()
        },
      },
      {
        name: "app.toggle.diffwrap",
        title: kv.get("diff_wrap_mode", "word") === "word" ? "Disable diff wrapping" : "Enable diff wrapping",
        category: "System",
        run: () => {
          const current = kv.get("diff_wrap_mode", "word")
          kv.set("diff_wrap_mode", current === "word" ? "none" : "word")
          dialog.clear()
        },
      },
      {
        name: "app.toggle.paste_summary",
        title: pasteSummaryEnabled() ? "Disable paste summary" : "Enable paste summary",
        category: "System",
        run: () => {
          setPasteSummaryEnabled((prev) => {
            const next = !prev
            kv.set("paste_summary_enabled", next)
            return next
          })
          dialog.clear()
        },
      },
      {
        name: "app.toggle.session_directory_filter",
        title: kv.get("session_directory_filter_enabled", true)
          ? "Disable session directory filtering"
          : "Enable session directory filtering",
        category: "System",
        run: async () => {
          kv.set("session_directory_filter_enabled", !kv.get("session_directory_filter_enabled", true))
          await sync.session.refresh()
          dialog.clear()
        },
      },
    ].map((command) => ({
      namespace: "palette",
      ...command,
    })),
  )

  useBindings(() => ({
    commands: appCommands(),
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("app", appBindingCommands),
  }))

  useBindings(() => ({
    bindings: tuiConfig.keybinds.gather("app.global", appGlobalBindingCommands),
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () => {
      const current = promptRef.current
      if (!current?.focused) return true
      return current.current.input === ""
    },
    bindings: tuiConfig.keybinds.gather("app_exit", ["app.exit"]),
  }))

  eventUnsubs.push(
    event.on("tui.command.execute", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      keymap.dispatchCommand(evt.properties.command)
    }),
  )

  eventUnsubs.push(
    event.on("tui.toast.show", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      toast.show({
        title: evt.properties.title,
        message: evt.properties.message,
        variant: evt.properties.variant,
        duration: evt.properties.duration,
      })
    }),
  )

  eventUnsubs.push(
    event.on("tui.session.select", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      route.navigate({
        type: "session",
        sessionID: evt.properties.sessionID,
      })
    }),
  )

  eventUnsubs.push(
    event.on("session.deleted", (evt) => {
      if (route.data.type === "session" && route.data.sessionID === evt.properties.info.id) {
        route.navigate({ type: "home" })
        toast.show({
          variant: "info",
          message: "The current session was deleted",
        })
      }
    }),
  )

  eventUnsubs.push(
    event.on("session.error", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      const error = evt.properties.error
      if (error && typeof error === "object" && error.name === "MessageAbortedError") return
      const message = errorMessage(error)

      toast.show({
        variant: "error",
        message,
        duration: 5000,
      })
    }),
  )

  eventUnsubs.push(
    event.on("installation.update-available", async (evt) => {
      console.log("installation.update-available", evt)
      const version = evt.properties.version

      const skipped = kv.get("skipped_version")
      if (skipped && !isVersionGreater(version, skipped)) return

      const choice = await DialogConfirm.show(
        dialog,
        `Update Available`,
        `A new release v${version} is available. Would you like to update now?`,
        "skip",
      )

      if (choice === false) {
        kv.set("skipped_version", version)
        return
      }

      if (choice !== true) return

      toast.show({
        variant: "info",
        message: `Updating to v${version}...`,
        duration: 30000,
      })

      const result = await sdk.client.global.upgrade({ target: version })

      if (result.error || !result.data?.success) {
        toast.show({
          variant: "error",
          title: "Update Failed",
          message: "Update failed",
          duration: 10000,
        })
        return
      }

      await DialogAlert.show(
        dialog,
        "Update Complete",
        `Successfully updated to ${APP_NAME} v${result.data.version}. Please restart the application.`,
      )

      void exit()
    }),
  )

  const plugin = createMemo(() => {
    if (!ready()) return
    if (route.data.type !== "plugin") return
    const render = pluginRuntime.routes.get(route.data.id)
    if (!render) return <PluginRouteMissing id={route.data.id} onHome={() => route.navigate({ type: "home" })} />
    return render({ params: route.data.data })
  })

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={theme.background}
      onMouseDown={(evt) => {
        if (!Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
        if (evt.button !== MouseButton.RIGHT) return

        if (!Selection.copy(renderer, toast, clipboard)) return
        evt.preventDefault()
        evt.stopPropagation()
      }}
      onMouseUp={
        !Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT ? () => Selection.copy(renderer, toast, clipboard) : undefined
      }
    >
      <Show when={Flag.ARCANA_SHOW_TTFD}>
        <TimeToFirstDraw />
      </Show>
      <Show when={ready()}>
        <box flexGrow={1} minHeight={0} flexDirection="column">
          <Switch>
            <Match when={route.data.type === "home"}>
              <Home />
            </Match>
            <Match when={route.data.type === "session"}>
              <Show when={route.data.type === "session" ? route.data.sessionID : undefined} keyed>
                {(_) => <Session />}
              </Show>
            </Match>
          </Switch>
          {plugin()}
        </box>
        <box flexShrink={0}>
          <pluginRuntime.Slot name="app_bottom" />
        </box>
        <pluginRuntime.Slot name="app" />
      </Show>
      <Show when={!startup.skipInitialLoading}>
        <StartupLoading ready={ready} />
      </Show>
    </box>
  )
}
