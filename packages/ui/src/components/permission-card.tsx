import {
  createEffect,
  createMemo,
  createSignal,
  Show,
  splitProps,
  type ComponentProps,
  type JSX,
} from "solid-js"
import { Button } from "./button"
import {
  type ActionPayload,
  type ExecutionState,
  type PermissionDecision,
  type PermissionRequest,
  type RememberScope,
  type WorkDensity,
  type WorkVoice,
  defaultOpenForPermission,
  formatDurationMs,
  permissionLabels,
} from "./permission-types"

export type {
  ActionPayload,
  ExecutionState,
  GateEvent,
  GateResolution,
  PermissionDecision,
  PermissionRequest,
  RememberScope,
  RiskLevel,
  WorkDensity,
  WorkVoice,
} from "./permission-types"

export interface PermissionCardProps {
  request: PermissionRequest
  action: ActionPayload
  decision: PermissionDecision
  execution?: ExecutionState

  onApprove?: (preview: string) => void
  onReject?: () => void
  onEdit?: (preview: string) => void
  onRemember?: (scope: RememberScope) => void

  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void

  density?: WorkDensity
  voice?: WorkVoice
  busy?: boolean

  /** Collapsed one-line summary (success receipts). */
  summary?: string
  result?: JSX.Element | string
  error?: string

  class?: string
  classList?: ComponentProps<"article">["classList"]
  "data-testid"?: string
}

function statusLabel(
  decision: PermissionDecision,
  execution: ExecutionState | undefined,
  voice: WorkVoice,
): string {
  const L = permissionLabels(voice)
  if (decision === "pending") return L.waiting
  if (execution === "running") return L.running
  if (execution === "error") return L.error
  if (execution === "cancelled") return L.cancelled
  if (decision === "rejected") return L.rejected
  if (decision === "edited") return L.edited
  if (decision === "auto") return L.auto
  if (decision === "approved") return execution === "success" ? L.success : L.approved
  if (decision === "expired") return L.rejected
  return L.waiting
}

export function PermissionCard(props: PermissionCardProps) {
  const [split, rest] = splitProps(props, [
    "request",
    "action",
    "decision",
    "execution",
    "onApprove",
    "onReject",
    "onEdit",
    "onRemember",
    "open",
    "defaultOpen",
    "onOpenChange",
    "density",
    "voice",
    "busy",
    "summary",
    "result",
    "error",
    "class",
    "classList",
  ])

  const voice = () => split.voice ?? "quiet"
  const labels = createMemo(() => permissionLabels(voice()))
  const pending = () => split.decision === "pending"
  const policyOpen = () => defaultOpenForPermission(split.decision, split.execution)

  const [internalOpen, setInternalOpen] = createSignal(
    split.defaultOpen ?? policyOpen(),
  )

  // Keep gates and errors expanded when uncontrolled. Skip the first run so an
  // explicit `defaultOpen` is respected for the initial state; only transitions
  // into pending/error auto-expand.
  let mounted = false
  createEffect(() => {
    if (split.open !== undefined) return
    if (!mounted) {
      mounted = true
      return
    }
    if (policyOpen()) setInternalOpen(true)
  })

  const open = () => split.open ?? internalOpen()
  const setOpen = (value: boolean) => {
    if (split.open === undefined) setInternalOpen(value)
    split.onOpenChange?.(value)
  }

  const [preview, setPreview] = createSignal(split.action.preview)
  createEffect(() => setPreview(split.action.preview))

  const duration = () => {
    const ms = split.action.meta?.durationMs
    return ms != null ? formatDurationMs(ms) : undefined
  }

  const canEdit = () => pending() && !!split.action.editable && !split.busy

  const approve = () => {
    if (split.busy) return
    split.onApprove?.(preview())
  }

  return (
    <article
      {...rest}
      data-component="permission-card"
      data-decision={split.decision}
      data-execution={split.execution ?? "idle"}
      data-risk={split.request.risk}
      data-open={open() || undefined}
      data-density={split.density ?? "comfortable"}
      classList={{
        ...split.classList,
        [split.class ?? ""]: !!split.class,
      }}
    >
      <header data-slot="header">
        <span data-slot="risk">{split.request.risk}</span>
        <span data-slot="tool">{split.action.tool}</span>
        <span data-slot="title">{split.action.title}</span>
        <Show when={duration()}>
          <span data-slot="meta">{duration()}</span>
        </Show>
        <span data-slot="status">{statusLabel(split.decision, split.execution, voice())}</span>
        <Show when={!pending()}>
          <button
            type="button"
            data-slot="toggle"
            aria-expanded={open()}
            onClick={() => setOpen(!open())}
          >
            {open() ? "▴" : "▾"}
          </button>
        </Show>
      </header>

      <Show when={open()}>
        <Show when={split.request.reason}>
          <p data-slot="reason">{split.request.reason}</p>
        </Show>
        <Show when={split.request.policyId}>
          <div data-slot="policy">policy: {split.request.policyId}</div>
        </Show>

        <Show
          when={canEdit()}
          fallback={
            <pre data-slot="preview">{preview()}</pre>
          }
        >
          <textarea
            data-slot="preview"
            data-editable
            value={preview()}
            rows={4}
            onInput={(e) => setPreview(e.currentTarget.value)}
            disabled={split.busy}
          />
        </Show>

        <Show when={split.error}>
          <p data-slot="error">{split.error}</p>
        </Show>
        <Show when={split.result}>
          <div data-slot="result">{split.result}</div>
        </Show>

        <Show when={pending()}>
          <div data-slot="decision-bar">
            <Button
              size="small"
              variant="primary"
              disabled={split.busy}
              onClick={approve}
            >
              {labels().approve}
            </Button>
            <Show when={canEdit()}>
              <Button
                size="small"
                variant="secondary"
                disabled={split.busy}
                onClick={() => split.onEdit?.(preview())}
              >
                {labels().edit}
              </Button>
            </Show>
            <Button
              size="small"
              variant="ghost"
              disabled={split.busy}
              onClick={() => split.onReject?.()}
            >
              {labels().reject}
            </Button>
            <Show when={split.onRemember}>
              <span data-slot="remember">
                <Button
                  size="small"
                  variant="ghost"
                  disabled={split.busy}
                  onClick={() => split.onRemember?.("session")}
                >
                  {labels().remember} (session)
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  disabled={split.busy}
                  onClick={() => split.onRemember?.("project")}
                >
                  {labels().remember} (project)
                </Button>
              </span>
            </Show>
          </div>
        </Show>
      </Show>

      <Show when={!open() && split.summary}>
        <p data-slot="summary">{split.summary}</p>
      </Show>
    </article>
  )
}

export interface ReceiptCardProps {
  action: ActionPayload
  execution: Exclude<ExecutionState, "idle">
  decision?: Extract<PermissionDecision, "auto" | "approved" | "edited">
  density?: WorkDensity
  voice?: WorkVoice
  summary?: string
  result?: JSX.Element | string
  error?: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  class?: string
  classList?: ComponentProps<"article">["classList"]
}

/**
 * Observation-only card for auto-allowed or completed actions.
 * No decision bar — governance already decided (desktop or policy).
 */
export function ReceiptCard(props: ReceiptCardProps) {
  return (
    <PermissionCard
      request={{
        id: `receipt:${props.action.tool}:${props.action.title}`,
        reason: "",
        risk: "low",
      }}
      action={props.action}
      decision={props.decision ?? "auto"}
      execution={props.execution}
      density={props.density}
      voice={props.voice}
      summary={props.summary}
      result={props.result}
      error={props.error}
      open={props.open}
      defaultOpen={props.defaultOpen ?? props.execution === "error"}
      onOpenChange={props.onOpenChange}
      class={props.class}
      classList={props.classList}
    />
  )
}
