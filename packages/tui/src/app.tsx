import { render, TimeToFirstDraw, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { readFile } from "node:fs/promises"
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

function rollbackValidity(proof: RunProofView): string {
  return proof.rollback?.valid_until ?? "not recorded"
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
    <Show
      when={props.evidence.length > 0}
      fallback={<text fg={theme.textMuted}>No ML signal evidence recorded.</text>}
    >
      <box gap={0}>
        <For each={items()}>
          {(evidence) => (
            <box gap={0}>
              <text fg={theme.text}>{mlEvidenceSummary(evidence)}</text>
              <Show when={evidence.route}>
                <text fg={theme.textMuted}>route={evidence.route}{evidence.route_reason ? `  (${evidence.route_reason})` : ""}</text>
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

function DialogRunProofContract(props: { proof: RunProofView; path: string }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const contract = () => props.proof.contract
  const rollback = () => props.proof.rollback
  const mlEvidence = () => props.proof.ml_evidence ?? []
  const latestTurnEvidence = () => mlEvidence().findLast((item) => item.kind === "turn")
  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>
          <b>Execution Contract</b>
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted}>{props.path}</text>
      <Show when={contract()} fallback={<text fg={theme.warning}>Active RunProof has no execution contract.</text>}>
        {(value) => (
          <box gap={1}>
            <text fg={theme.text}>Goal: {value().goal ?? props.proof.user_intent ?? "not recorded"}</text>
            <text fg={theme.text}>Scope: {value().scope ?? "not recorded"}</text>
            <text fg={theme.text}>Risk: {value().risk_level ?? "not recorded"}</text>
            <text fg={theme.text}>Status: {value().status ?? "not recorded"}</text>
            <text fg={theme.text}>Allowed files</text>
            <FieldList items={value().allowed_files} empty="No file allowlist recorded." />
            <text fg={theme.text}>Allowed commands</text>
            <FieldList items={value().allowed_commands} empty="No command allowlist recorded." />
            <text fg={theme.text}>Required approvals</text>
            <FieldList items={value().required_approvals} empty="No required approvals recorded." />
            <text fg={theme.text}>Expected artifacts</text>
            <FieldList items={value().expected_artifacts} empty="No expected artifacts recorded." />
            <text fg={theme.text}>Rollback plan: {value().rollback_plan ?? "not recorded"}</text>
            <Show when={rollback()?.strategy && rollback()?.strategy !== "none"}>
              <box gap={0}>
                <text fg={theme.text}>Rollback checkpoint: {rollbackSummary(props.proof)}</text>
                <text fg={theme.textMuted}>Restore: {rollbackRestoreCommand(props.proof)}</text>
                <text fg={theme.textMuted}>Valid until: {rollbackValidity(props.proof)}</text>
              </box>
            </Show>
            <text fg={theme.text}>Verification steps</text>
            <FieldList items={value().verification_steps} empty="No verification steps recorded." />
          </box>
        )}
      </Show>
      <Show when={latestTurnEvidence()}>
        {(evidence) => (
          <box gap={0}>
            <text fg={theme.text}>ML posture</text>
            <MLEvidencePanel evidence={[evidence()]} />
          </box>
        )}
      </Show>
    </box>
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
  return (value ?? "event").replace(/[._-]+/g, " ").toUpperCase()
}

function DialogRunProofActions(props: { proof: RunProofView; path: string }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const events = () => props.proof.events ?? []
  const fileReads = () => props.proof.execution?.file_reads ?? []
  const fileWrites = () => props.proof.execution?.file_writes ?? []
  const shellCommands = () => props.proof.execution?.shell_commands ?? []
  const status = () => props.proof.lifecycle?.status ?? props.proof.contract?.status ?? "unknown"
  const risk = () => props.proof.risk?.level ?? props.proof.contract?.risk_level ?? "unknown"
  const score = () => props.proof.final_evidence?.proof_score
  const tokens = () => props.proof.token_usage
  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>
          <b>RunProof Tape</b>
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted}>{props.path}</text>
      <box gap={0}>
        <text fg={theme.text}>Run: {compactProofId(props.proof.id)}  State: {status()}  Risk: {risk()}</text>
        <text fg={theme.text}>Intent: {props.proof.user_intent ?? "not recorded"}</text>
        <text fg={props.proof.risk?.required_approval ? theme.warning : theme.textMuted}>
          Approval: {props.proof.risk?.required_approval ? "required" : "not required"}
        </text>
        <FieldList items={props.proof.risk?.reasons} empty="No risk reasons recorded." />
        <text fg={theme.textMuted}>
          Rollback: {rollbackSummary(props.proof)}
          {score() === undefined ? "" : `  Proof: ${score()}/100`}
        </text>
        <Show when={props.proof.rollback?.restore_command}>
          <text fg={theme.textMuted}>Restore: {rollbackRestoreCommand(props.proof)}</text>
        </Show>
        <Show when={props.proof.rollback?.valid_until}>
          <text fg={theme.textMuted}>Rollback valid until: {rollbackValidity(props.proof)}</text>
        </Show>
        <Show when={tokens()}>
          {(value) => (
            <text fg={theme.textMuted}>
              Tokens: {value().total_tokens.toLocaleString()} total  {value().input_tokens.toLocaleString()} in  {value().output_tokens.toLocaleString()} out  Tool calls: {value().tool_calls}
            </text>
          )}
        </Show>
        <text fg={theme.textMuted}>
          Evidence: {fileReads().length} context read(s)  {fileWrites().length} file write(s)  {shellCommands().length} shell command(s)
        </text>
      </box>
      <Show when={fileReads().length > 0 || fileWrites().length > 0 || shellCommands().length > 0}>
        <box gap={0}>
          <text fg={theme.text}>Recent evidence</text>
          <For each={fileReads().slice(-3)}>
            {(read) => (
              <text fg={theme.textMuted}>
                READ  {read.path ?? "unknown path"}  {read.exists === false ? "missing" : (read.reason ?? "")}
              </text>
            )}
          </For>
          <For each={fileWrites().slice(-3)}>
            {(write) => (
              <text fg={theme.textMuted}>
                WRITE  {write.mode ?? "unknown"}  {write.path ?? "unknown path"}  {write.reason ?? ""}
              </text>
            )}
          </For>
          <For each={shellCommands().slice(-3)}>
            {(cmd) => (
              <text fg={theme.textMuted}>
                SHELL  {cmd.status ?? "unknown"}  {cmd.command ?? "unknown command"}  {cmd.risk ?? ""}
              </text>
            )}
          </For>
        </box>
      </Show>
      <box gap={0}>
        <text fg={theme.text}>ML evidence ({props.proof.ml_evidence?.length ?? 0} signal{props.proof.ml_evidence?.length === 1 ? "" : "s"})</text>
        <MLEvidencePanel evidence={props.proof.ml_evidence ?? []} />
      </box>
      <Show when={events().length > 0} fallback={<text fg={theme.warning}>No RunProof events recorded.</text>}>
        <For each={events()}>
          {(event) => (
            <box gap={0}>
              <text fg={theme.text}>
                {eventTime(event.timestamp)}  {eventLabel(event.type)}  {event.actor ?? "unknown"}
              </text>
              <text fg={theme.text}>{event.summary ?? "No summary recorded."}</text>
              <Show when={event.risk || event.status}>
                <text fg={theme.textMuted}>
                  {[event.risk ? `risk=${event.risk}` : undefined, event.status ? `status=${event.status}` : undefined]
                    .filter(Boolean)
                    .join("  ")}
                </text>
              </Show>
              <Show when={refsText(event.refs)}>{(refs) => <text fg={theme.textMuted}>{refs()}</text>}</Show>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}

function DiffList(props: { title: string; diffs: RunProofDiffView[]; empty: string }) {
  const { theme } = useTheme()
  return (
    <box gap={0}>
      <text fg={theme.text}>{props.title}</text>
      <Show when={props.diffs.length > 0} fallback={<text fg={theme.textMuted}>{props.empty}</text>}>
        <For each={props.diffs}>
          {(diff) => (
            <box gap={0}>
              <text fg={theme.text}>
                {diff.path ?? "unknown path"}  +{diff.additions ?? 0} -{diff.deletions ?? 0}
              </text>
              <text fg={theme.textMuted}>{diff.summary ?? diff.id ?? "No diff summary recorded."}</text>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}

function DialogRunProofDiffGate(props: { proof: RunProofView; path: string }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const diffs = () => props.proof.diffs ?? { proposed: [], applied: [], rejected: [] }
  const pending = () => diffs().proposed.length
  const applied = () => diffs().applied.length
  const rejected = () => diffs().rejected.length
  const writes = () => props.proof.execution?.file_writes ?? []
  const risk = () => props.proof.risk?.level ?? props.proof.contract?.risk_level ?? "unknown"
  const approval = () =>
    props.proof.risk?.required_approval || (props.proof.contract?.required_approvals?.length ?? 0) > 0
      ? "required"
      : "not required"
  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>
          <b>Diff Gate</b>
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted}>{props.path}</text>
      <box gap={0}>
        <text fg={theme.text}>
          Pending: {pending()}  Applied: {applied()}  Rejected: {rejected()}
        </text>
        <text fg={theme.text}>Write evidence: {writes().length} file write(s)</text>
        <text fg={theme.text}>Risk: {risk()}  Approval: {approval()}</text>
        <FieldList items={props.proof.risk?.reasons} empty="No risk reasons recorded." />
        <text fg={theme.textMuted}>Rollback: {rollbackSummary(props.proof)}</text>
        <text fg={theme.textMuted}>Restore: {rollbackRestoreCommand(props.proof)}</text>
        <text fg={theme.textMuted}>Valid until: {rollbackValidity(props.proof)}</text>
      </box>
      <DiffList title="Proposed diffs" diffs={diffs().proposed} empty="No proposed diffs." />
      <DiffList title="Applied diffs" diffs={diffs().applied} empty="No applied diffs." />
      <DiffList title="Rejected diffs" diffs={diffs().rejected} empty="No rejected diffs." />
    </box>
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
    <box gap={0}>
      <text fg={theme.text}>{props.title}</text>
      <Show when={props.checks.length > 0} fallback={<text fg={theme.textMuted}>{props.empty}</text>}>
        <For each={props.checks}>
          {(check) => (
            <box gap={0}>
              <text fg={theme.text}>
                {statusMark(check.status)}  {checkLabel(check)}
              </text>
              <Show when={check.summary || check.evidence}>
                <text fg={theme.textMuted}>{check.summary ?? check.evidence}</text>
              </Show>
              <Show when={check.passed !== undefined || check.failed !== undefined || check.skipped !== undefined}>
                <text fg={theme.textMuted}>
                  passed={check.passed ?? 0}  failed={check.failed ?? 0}  skipped={check.skipped ?? 0}
                </text>
              </Show>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}

function DialogRunProofVerify(props: { proof: RunProofView; path: string }) {
  const { theme } = useTheme()
  const dialog = useDialog()
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
      ? [{ status: verification().verifier_review?.status, summary: verification().verifier_review?.summary, source: "verifier" }]
      : []),
  ]
  const passed = () => allChecks().filter((check) => check.status === "passed").length
  const failed = () => allChecks().filter((check) => check.status === "failed").length
  const pending = () => allChecks().filter((check) => check.status !== "passed" && check.status !== "failed").length
  const score = () => props.proof.final_evidence?.proof_score
  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>
          <b>Verifier Board</b>
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted}>{props.path}</text>
      <box gap={0}>
        <text fg={theme.text}>
          Passed: {passed()}  Failed: {failed()}  Pending: {pending()}
        </text>
        <text fg={theme.text}>
          Final: {props.proof.final_evidence?.completed === true ? "completed" : "open"}
          {score() === undefined ? "" : `  Proof: ${score()}/100`}
        </text>
        <text fg={theme.textMuted}>{props.proof.final_evidence?.summary ?? "No final evidence summary recorded."}</text>
      </box>
      <CheckList title="Required checks" checks={fixedChecks()} empty="No typecheck, lint, or build evidence recorded." />
      <CheckList title="Tests" checks={verification().tests} empty="No test evidence recorded." />
      <CheckList title="Diagnostics" checks={verification().diagnostics} empty="No diagnostic evidence recorded." />
      <CheckList title="Manual checks" checks={verification().manual_checks} empty="No manual checks recorded." />
      <Show when={verification().verifier_review}>
        {(review) => (
          <box gap={0}>
            <text fg={theme.text}>Verifier review: {statusMark(review().status)} {review().model ?? ""}</text>
            <text fg={theme.textMuted}>{review().summary ?? "No verifier summary recorded."}</text>
            <FieldList items={review().concerns} empty="No verifier concerns recorded." />
          </box>
        )}
      </Show>
    </box>
  )
}

function yesNo(value: boolean | undefined): string {
  if (value === undefined) return "not recorded"
  return value ? "yes" : "no"
}

function DialogRunProofSovereignty(props: { proof: RunProofView; path: string }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const route = () => props.proof.sovereignty
  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>
          <b>Model Sovereignty</b>
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted}>{props.path}</text>
      <Show
        when={route()}
        fallback={<text fg={theme.warning}>No provider/model route evidence recorded in this RunProof.</text>}
      >
        {(value) => (
          <box gap={1}>
            <box gap={0}>
              <text fg={theme.text}>Provider: {value().provider ?? "not recorded"}</text>
              <text fg={theme.text}>Model: {value().model ?? "not recorded"}</text>
              <text fg={theme.text}>Route: {value().route ?? "not recorded"}</text>
              <text fg={theme.text}>Data left local machine: {yesNo(value().data_left_local)}</text>
            </box>
            <box gap={0}>
              <text fg={theme.textMuted}>Recorded: {eventTime(value().timestamp)}</text>
              <text fg={theme.textMuted}>{value().reason ?? value().summary ?? "No routing reason recorded."}</text>
            </box>
          </box>
        )}
      </Show>
    </box>
  )
}

function DialogRunProofMissing(props: { result: Extract<ProofLoadResult, { status: "unbound" | "error" }> }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>
          <b>RunProof</b>
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show
        when={props.result.status === "unbound" ? props.result : undefined}
        fallback={
          <text fg={theme.error}>
            Failed to read RunProof: {props.result.status === "error" ? props.result.message : "unknown error"}
          </text>
        }
      >
        <text fg={theme.warning}>No active RunProof is bound to this TUI session</text>
      </Show>
    </box>
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
    dialog.replace(() => {
      if (kind === "contract") return <DialogRunProofContract proof={result.proof} path={result.path} />
      if (kind === "diffgate") return <DialogRunProofDiffGate proof={result.proof} path={result.path} />
      if (kind === "verify") return <DialogRunProofVerify proof={result.proof} path={result.path} />
      if (kind === "sovereignty") return <DialogRunProofSovereignty proof={result.proof} path={result.path} />
      return <DialogRunProofActions proof={result.proof} path={result.path} />
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
        title: "Agent cycle",
        category: "Agent",
        hidden: true,
        run: () => {
          local.agent.move(1)
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
        title: "Agent cycle reverse",
        category: "Agent",
        hidden: true,
        run: () => {
          local.agent.move(-1)
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
