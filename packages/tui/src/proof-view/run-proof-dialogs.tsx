/**
 * RunProof dialog components and helpers.
 *
 * Extracted from app.tsx to separate presentation concerns from the
 * application shell. These components render RunProof surfaces for
 * contract, actions, diff gate, verify, and sovereignty views.
 */
import { Show, For } from "solid-js"
import { useTheme } from "../context/theme"
import {
  ArcanaSurface,
  ArcanaSection,
  ArcanaMetricLine,
  ArcanaTapeItem,
} from "../ui/arcana"
import {
  contextBudgetsFromEvents,
  type RunProofCheckView,
  type RunProofConsensusView,
  type RunProofDiffView,
  type RunProofEventView,
  type RunProofMLEvidenceView,
  type RunProofView,
} from "./run-proof-view"
import { truncateMiddle } from "../util/locale"
import type { ProofLoadResult } from "../proof-io"

// ─── Shared helpers ─────────────────────────────────────────────────

export function compactProofId(id: string | undefined): string {
  if (!id) return "unknown"
  // T7: display-width-aware middle truncation (grapheme-safe) — same 17-col
  // budget as the old 10+…+4 shape, but never cuts a surrogate or CJK glyph.
  return truncateMiddle(id, 17)
}

export function eventTime(value: string | undefined): string {
  if (!value) return "--:--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function eventLabel(value: string | undefined): string {
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

export function eventTone(event: RunProofEventView): "normal" | "muted" | "warning" | "error" {
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

export function voteTallyText(value: Record<string, number> | undefined): string {
  const entries = Object.entries(value ?? {})
  if (entries.length === 0) return "no valid votes"
  return entries.map(([key, count]) => `${key}:${count}`).join("  ")
}

export function refsText(refs: Record<string, string> | undefined): string | undefined {
  if (!refs || Object.keys(refs).length === 0) return undefined
  return Object.entries(refs)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join("  ")
}

export function yesNo(value: boolean | undefined): string {
  if (value === undefined) return "not recorded"
  return value ? "yes" : "no"
}

export function costLabel(value: number | undefined): string {
  return value === undefined ? "not recorded" : `$${value.toFixed(6)}`
}

export function latencyLabel(value: number | undefined): string {
  return value === undefined ? "not recorded" : `${value}ms`
}

export function checkLabel(check: RunProofCheckView): string {
  return check.command ?? check.description ?? check.source ?? check.id ?? "verification check"
}

export function statusMark(status: string | undefined): string {
  if (status === "passed") return "PASS"
  if (status === "failed") return "FAIL"
  if (status === "skipped") return "SKIP"
  if (status === "not_run") return "WAIT"
  return (status ?? "unknown").toUpperCase()
}

// ─── Rollback helpers ───────────────────────────────────────────────

export function rollbackSummary(proof: RunProofView): string {
  const rollback = proof.rollback
  if (rollback?.strategy && rollback.strategy !== "none") {
    return [rollback.strategy, rollback.checkpoint_id].filter(Boolean).join("  ")
  }
  return proof.contract?.rollback_plan ?? "not recorded"
}

export function rollbackRestoreCommand(proof: RunProofView): string {
  return proof.rollback?.restore_command ?? proof.contract?.rollback_plan ?? "not recorded"
}

export function rollbackRestoreCommandValue(proof: RunProofView): string | undefined {
  return proof.rollback?.restore_command
}

export function rollbackValidity(proof: RunProofView): string {
  return proof.rollback?.valid_until ?? "not recorded"
}

export function rollbackRestoreStatus(proof: RunProofView): string {
  return proof.rollback?.restore_status ?? "not_staged"
}

export function rollbackRestoreCanBeStaged(proof: RunProofView): boolean {
  const status = rollbackRestoreStatus(proof)
  return status === "not_staged" || status === "rejected"
}

export function rollbackRestoreCanBeApproved(proof: RunProofView): boolean {
  return rollbackRestoreStatus(proof) === "staged"
}

export function rollbackApprovalStatus(proof: RunProofView): string {
  if (proof.rollback?.approved_at) {
    return ["approved", proof.rollback.approved_by ? `by ${proof.rollback.approved_by}` : undefined]
      .filter(Boolean)
      .join(" ")
  }
  if (proof.rollback?.approval_required) return "required before execution"
  return "not required"
}

export function rollbackExecutionStatus(proof: RunProofView): string | undefined {
  if (!proof.rollback?.executed_at && !proof.rollback?.execution_status) return undefined
  return [
    proof.rollback.execution_status ?? "unknown",
    proof.rollback.execution_exit_code === undefined ? undefined : `exit=${proof.rollback.execution_exit_code}`,
    proof.rollback.executed_at,
  ]
    .filter(Boolean)
    .join(" ")
}

export function mlEvidenceSummary(evidence: RunProofMLEvidenceView): string {
  const parts = [
    evidence.kind === "tool" ? `tool=${evidence.tool ?? "unknown"}` : `intent=${evidence.intent ?? "unknown"}`,
    evidence.risk ? `risk=${evidence.risk}` : undefined,
    evidence.posture ? `posture=${evidence.posture}` : undefined,
    evidence.confidence !== undefined ? `confidence=${Math.round(evidence.confidence * 100)}%` : undefined,
    evidence.decision_action ? `decision=${evidence.decision_action}` : undefined,
  ].filter((item): item is string => Boolean(item))
  return parts.join("  ")
}

// ─── Shared JSX components ──────────────────────────────────────────

function FieldList(props: { items: string[] | undefined; empty: string }) {
  const { theme } = useTheme()
  return (
    <Show when={props.items && props.items.length > 0} fallback={<text fg={theme.textMuted}>{props.empty}</text>}>
      <For each={props.items}>{(item) => <text fg={theme.text}>- {item}</text>}</For>
    </Show>
  )
}

export function MLEvidencePanel(props: { evidence: RunProofMLEvidenceView[]; latestOnly?: boolean }) {
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
              <Show when={evidence.guard_rules && evidence.guard_rules.length > 0}>
                <text fg={theme.warning}>guard: {evidence.guard_rules?.join("  ")}</text>
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

export function ConsensusEvidencePanel(props: { consensus: RunProofConsensusView[]; latestOnly?: boolean }) {
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

export function CheckList(props: { title: string; checks: RunProofCheckView[]; empty: string }) {
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

export function DiffList(props: { title: string; diffs: RunProofDiffView[]; empty: string }) {
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

// ─── Dialog components ──────────────────────────────────────────────

export function DialogRunProofContract(props: {
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

export function DialogRunProofActions(props: {
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

export function DialogRunProofDiffGate(props: {
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

export function DialogRunProofVerify(props: { proof: RunProofView; path: string }) {
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

export function DialogRunProofSovereignty(props: { proof: RunProofView; path: string }) {
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

export function DialogRunProofMissing(props: { result: Extract<ProofLoadResult, { status: "unbound" | "error" }> }) {
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
