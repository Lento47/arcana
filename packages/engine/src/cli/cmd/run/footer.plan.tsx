// Ghost plan preview — renders pending tool calls as dimmed text before execution.
//
// Displays inside the footer when the reducer pushes FooterView { type: "plan" }.
// Each tool shows risk [SAFE..DANGER] + confidence [CONF:HIGH..LOW] inline.
// Risk perimeter: border color green->yellow->red based on highest pending risk.
//
// Keyboard:
//   Enter = execute approved lines only (rejected lines are skipped)
//   Esc   = reject ALL remaining lines
//   Tab   = toggle LOW-confidence-only filter
//   ←/→   = move selection cursor between plan lines
//   Space = toggle approve/reject for the selected line
//   r     = retry failed (when in partial state)
//   R     = re-run all (when in partial state)
//
// Plan state machine: pending → running (Enter) → partial (any failure) / completed (all ok)
/** @jsxImportSource @opentui/solid */
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { For, createEffect, createMemo, createSignal } from "solid-js"
import type { ColorInput } from "@opentui/core"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { permissionInfo } from "./permission.shared"
import { transparent, type RunFooterTheme } from "./theme"
import * as Locale from "@/util/locale"

type RiskLevel = "safe" | "write" | "mutate" | "danger"
type ConfLevel = "HIGH" | "MED" | "LOW"
export type PlanState = "pending" | "running" | "partial" | "completed"

export type PlanSummary = {
  state: PlanState
  total: number
  approved: number
  rejected: number
  succeeded: number
  failed: number
  failedIds: string[]
}

const SAFE_TOOLS = new Set(["read", "grep", "glob", "ls", "lsp", "question", "todowrite", "skill"])
const WRITE_TOOLS = new Set(["write", "edit", "apply_patch", "task"])
const MUTATE_PATTERN = /\b(install|uninstall|apt-get|brew|pip|npm\s+(install|uninstall)|build|compile|deploy|migrate)\b/
const DANGER_PATTERN = /\b(rm\s+-[rf]|rm\s+--recursive|rm\s+--force|>\/dev\/|dd\s+if=|mkfs\.|curl.*\|.*(sh|bash)|wget.*\|.*(sh|bash)|npm\s+(publish|unpublish|deprecate)|git\s+(push|tag|merge|rebase))\b/
const SHELL_SAFE_PATTERN = /\b(echo|cat|ls|pwd|git\s+(status|diff|log)|grep|find|head|tail|wc)\b/

function riskLabel(request: PermissionRequest): { level: RiskLevel; label: string } {
  const tool = request.permission
  if (SAFE_TOOLS.has(tool)) return { level: "safe", label: "SAFE" }
  if (WRITE_TOOLS.has(tool)) return { level: "write", label: "WRITE" }

  // Shell commands — inspect the actual command line, not the description
  if (tool === "bash" || tool === "shell") {
    const cmd = (request as any).input?.command ?? (request.metadata as any)?.command ?? ""
    if (DANGER_PATTERN.test(cmd)) return { level: "danger", label: "DANGER" }
    if (MUTATE_PATTERN.test(cmd)) return { level: "mutate", label: "MUTATE" }
    if (/curl|wget|fetch|api\./.test(cmd)) return { level: "mutate", label: "NETWORK" }
    if (SHELL_SAFE_PATTERN.test(cmd)) return { level: "safe", label: "SAFE" }
    return { level: "write", label: "SHELL" }
  }

  // Write/edit — inspect diff/args for dangerous content
  if (tool === "write" || tool === "edit" || tool === "apply_patch") {
    const diff = (request.metadata as any)?.diff ?? (request.metadata as any)?.input ?? ""
    const content = typeof diff === "string" ? diff : JSON.stringify(diff)
    if (/rm\s+-rf|>\/dev\/null|curl.*\|.*sh|eval\s|exec\s/.test(content))
      return { level: "danger", label: "DANGER" }
    if (/\.\.\/|\.\.\\/.test(content))
      return { level: "danger", label: "PATH" } // path traversal in write target
    return { level: "write", label: "WRITE" }
  }

  // Network tools — external side effects
  if (tool === "webfetch" || tool === "websearch") return { level: "mutate", label: "EXT" }

  return { level: "write", label: "WRITE" }
}

function riskColor(level: RiskLevel, theme: RunFooterTheme): ColorInput {
  switch (level) {
    case "danger": return theme.error
    case "mutate": return theme.warning
    case "write": return theme.highlight
    default: return theme.success
  }
}

function confidence(request: PermissionRequest): ConfLevel {
  const meta = (request.metadata ?? {}) as Record<string, unknown>
  const raw = meta.confidence ?? meta.conf ?? meta.certainty
  if (typeof raw === "string" && ["LOW", "MED", "HIGH"].includes(raw.toUpperCase())) {
    return raw.toUpperCase() as ConfLevel
  }
  return "HIGH" // default: assume confident unless tagged otherwise
}

function highestRisk(requests: PermissionRequest[]): RiskLevel {
  const order: RiskLevel[] = ["safe", "write", "mutate", "danger"]
  let max = 0
  for (const r of requests) {
    const i = order.indexOf(riskLabel(r).level)
    if (i > max) max = i
  }
  return order[max]!
}

export function RunPlanBody(props: {
  requests: PermissionRequest[]
  theme: RunFooterTheme
  onApproveAll: () => void
  onRejectAll: () => void
  onApproveSelected?: (ids: string[]) => void
  planState?: () => PlanState
  onRetryFailed?: () => void
  onReRunAll?: () => void
  onPlanSummary?: (summary: PlanSummary) => void
}) {
  const risk = createMemo(() => highestRisk(props.requests))
  const borderColor = createMemo(() => riskColor(risk(), props.theme))
  const [lowOnly, setLowOnly] = createSignal(false)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [rejectedIds, setRejectedIds] = createSignal(new Set<string>())
  const [planState, setPlanState] = createSignal<PlanState>(props.planState?.() ?? "pending")

  // Clamp selectedIndex when lines change
  const dims = useTerminalDimensions()
  const tw = createMemo(() => dims().width)

  const MAX_VISIBLE = 12
  const lines = createMemo(() => {
    const all = props.requests.map((r) => {
      const info = permissionInfo(r)
      const rl = riskLabel(r)
      const cf = confidence(r)
      const icon = info.icon ? ` ${info.icon} ` : " "
      const title = info.title ?? "unknown action"
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      const isStale = meta.stale === true
      const staleTag = isStale ? 8 : 0 // "[STALE]" = 8 chars
      const tagLen = 14 + (cf !== "HIGH" ? 11 : 0) + staleTag
      const maxLen = Math.max(10, tw() - tagLen)
      // T9: maxLen is a column budget from terminal width — truncate by
      // display width so CJK plan titles don't exceed the computed width.
      const truncated = Locale.truncate(title, maxLen)
      return { id: r.id, icon, title: truncated, level: rl.level, label: rl.label, conf: cf, stale: isStale }
    })
    const filtered = lowOnly() ? all.filter((l) => l.conf === "LOW") : all
    if (filtered.length <= MAX_VISIBLE) return { lines: filtered, overflow: 0, ids: filtered.map((l) => l.id) }
    const visible = filtered.slice(0, MAX_VISIBLE)
    return { lines: visible, overflow: filtered.length - MAX_VISIBLE, ids: visible.map((l) => l.id) }
  })

  // Clamp selection to valid range
  const clampedIndex = createMemo(() => {
    const max = Math.max(0, lines().lines.length - 1)
    const cur = selectedIndex()
    return Math.max(0, Math.min(cur, max))
  })

  // Keep selectedIndex in sync with clamped value
  createEffect(() => {
    const clamped = clampedIndex()
    if (selectedIndex() !== clamped) {
      setSelectedIndex(clamped)
    }
  })

  let handled = false
  useKeyboard((event) => {
    if (handled) {
      event.preventDefault()
      return
    }
    if (event.name === "return") {
      event.preventDefault()
      const rejected = rejectedIds()
      const allIds = lines().ids
      const approved = allIds.filter((id) => !rejected.has(id))
      if (approved.length === 0) {
        // If all lines are rejected, reject all
        handled = true
        props.onRejectAll()
        return
      }
      // Check if all lines are approved — if so, use the fast path
      if (approved.length === allIds.length && !props.onApproveSelected) {
        handled = true
        props.onApproveAll()
        return
      }
      handled = true
      setPlanState("running")
      const summary: PlanSummary = {
        state: "running",
        total: props.requests.length,
        approved: approved.length,
        rejected: rejected.size,
        succeeded: 0,
        failed: 0,
        failedIds: [],
      }
      props.onPlanSummary?.(summary)
      if (props.onApproveSelected) {
        props.onApproveSelected(approved)
      } else {
        props.onApproveAll()
      }
    } else if (event.name === "escape") {
      handled = true
      event.preventDefault()
      props.onRejectAll()
    } else if (event.name === "tab") {
      event.preventDefault()
      setLowOnly((prev) => !prev)
    } else if (event.name === "left" || event.name === "up") {
      event.preventDefault()
      setSelectedIndex((prev) => Math.max(0, prev - 1))
    } else if (event.name === "right" || event.name === "down") {
      event.preventDefault()
      setSelectedIndex((prev) => prev + 1)
    } else if (event.name === "space" || event.sequence === " ") {
      event.preventDefault()
      const idx = clampedIndex()
      const line = lines().lines[idx]
      if (!line) return
      setRejectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(line.id)) {
          next.delete(line.id)
        } else {
          next.add(line.id)
        }
        return next
      })
    } else if (event.sequence === "r" && planState() === "partial") {
      event.preventDefault()
      props.onRetryFailed?.()
    } else if (event.sequence === "R" && planState() === "partial") {
      event.preventDefault()
      props.onReRunAll?.()
    }
  })

  const count = props.requests.length
  const lowCount = props.requests.filter((r) => confidence(r) === "LOW").length
  const filterHint = lowOnly()
    ? `[filter: LOW only · ${lowCount} step${lowCount !== 1 ? "s" : ""}]`
    : lowCount > 0
      ? `Tab: show ${lowCount} low-confidence`
      : ""

  const pState = planState()
  const header = pState === "running"
    ? `⚡ ${count} action${count !== 1 ? "s" : ""} executing...`
    : pState === "partial"
      ? `⚠ ${count} action${count !== 1 ? "s" : ""} — r = re-cast failed · R = re-inscribe all`
      : pState === "completed"
        ? `✅ ${count} action${count !== 1 ? "s" : ""} inscribed`
        : `⛧ ${count} action${count !== 1 ? "s" : ""} pending — ←/→ select · Space transmute · Enter inscribe · Esc rescind · ${filterHint || "Tab: filter"}`

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} aria-label="Plan preview — Enter inscribe (y), Space transmute, Esc rescind (n)">
      <box flexDirection="row" height={1} gap={1}>
        <text fg={
          pState === "running" ? props.theme.highlight :
          pState === "partial" ? props.theme.warning :
          pState === "completed" ? props.theme.success :
          props.theme.muted
        }>{header}</text>
      </box>

      <For each={lines().lines}>
        {(line, index) => {
          const isSelected = createMemo(() => index() === clampedIndex())
          const isRejected = createMemo(() => rejectedIds().has(line.id))
          return (
            <box
              flexDirection="row"
              height={1}
              gap={1}
              backgroundColor={isSelected() ? props.theme.selected : transparent}
            >
              {isRejected() ? (
                <text fg={props.theme.error}>[✗]</text>
              ) : (
                <text fg={riskColor(line.level, props.theme)}>{`[${line.label}]`}</text>
              )}
              {line.stale && !isRejected() && (
                <text fg={props.theme.warning}>[STALE]</text>
              )}
              {line.conf !== "HIGH" && !isRejected() && (
                <text fg={line.conf === "LOW" ? props.theme.warning : props.theme.muted}>
                  {`[CONF:${line.conf}]`}
                </text>
              )}
              <text fg={
                isRejected() ? props.theme.error :
                isSelected() ? props.theme.selectedText :
                line.conf === "LOW" ? props.theme.muted : props.theme.muted
              }>
                {line.icon}
                {line.title}
              </text>
              {isSelected() && (
                <text fg={props.theme.muted}>{isRejected() ? " [✗ rescinded]" : " [⛧ inscribed]"}</text>
              )}
            </box>
          )
        }}
      </For>
      {lines().overflow > 0 && (
        <box flexDirection="row" height={1} gap={1}>
          <text fg={props.theme.muted}>… and {lines().overflow} more (scroll in scrollback)</text>
        </box>
      )}

      <box flexDirection="row" height={1} border={["top"]} borderColor={borderColor()} gap={1}>
        <text fg={borderColor()}>
          {risk() === "danger" ? "⛔ DANGER" : risk() === "mutate" ? "⚠ MUTATE" : risk() === "write" ? "◈ WRITE" : "● SAFE"}
        </text>
        <text fg={props.theme.muted}>
          {props.requests.length} action{props.requests.length !== 1 ? "s" : ""}
          {rejectedIds().size > 0 ? ` · ${rejectedIds().size} rescinded` : ""}
        </text>
      </box>
    </box>
  )
}
