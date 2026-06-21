// Ghost plan preview — renders pending tool calls as dimmed text before execution.
//
// Displays inside the footer when the reducer pushes FooterView { type: "plan" }.
// Each tool shows risk [SAFE..DANGER] + confidence [CONF:HIGH..LOW] inline.
// Risk perimeter: border color green->yellow->red based on highest pending risk.
// Keyboard: Enter = all, Esc = reject, Tab = toggle LOW-confidence-only filter.
/** @jsxImportSource @opentui/solid */
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { For, createMemo, createSignal } from "solid-js"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { permissionInfo } from "./permission.shared"
import { footerWidthPolicy } from "./footer.width"
import { transparent, type RunFooterTheme } from "./theme"

type RiskLevel = "safe" | "write" | "mutate" | "danger"
type ConfLevel = "HIGH" | "MED" | "LOW"

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
    const cmd = (request.input as any)?.command ?? (request.metadata as any)?.command ?? ""
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

function riskColor(level: RiskLevel, theme: RunFooterTheme): string {
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
}) {
  const risk = createMemo(() => highestRisk(props.requests))
  const borderColor = createMemo(() => riskColor(risk(), props.theme))
  const [lowOnly, setLowOnly] = createSignal(false)

  let handled = false
  useKeyboard((event) => {
    if (handled) {
      event.preventDefault()
      return
    }
    if (event.name === "return") {
      handled = true
      event.preventDefault()
      props.onApproveAll()
    } else if (event.name === "escape") {
      handled = true
      event.preventDefault()
      props.onRejectAll()
    } else if (event.name === "tab") {
      event.preventDefault()
      setLowOnly((prev) => !prev)
    }
  })

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
      const tagLen = 14 + (cf !== "HIGH" ? 11 : 0)
      const maxLen = Math.max(10, tw() - tagLen)
      const truncated = title.length > maxLen ? title.slice(0, maxLen - 1) + "…" : title
      return { icon, title: truncated, level: rl.level, label: rl.label, conf: cf }
    })
    const filtered = lowOnly() ? all.filter((l) => l.conf === "LOW") : all
    if (filtered.length <= MAX_VISIBLE) return { lines: filtered, overflow: 0 }
    return { lines: filtered.slice(0, MAX_VISIBLE), overflow: filtered.length - MAX_VISIBLE }
  })

  const count = props.requests.length
  const lowCount = props.requests.filter((r) => confidence(r) === "LOW").length
  const filterHint = lowOnly()
    ? `[filter: LOW only · ${lowCount} step${lowCount !== 1 ? "s" : ""}]`
    : lowCount > 0
      ? `Tab: show ${lowCount} low-confidence`
      : ""
  const header = `⚡ ${count} action${count !== 1 ? "s" : ""} pending — Enter to execute · Esc to reject · ${filterHint || "Tab: filter none needed"}`

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <box flexDirection="row" height={1} gap={1}>
        <text fg={props.theme.muted}>{header}</text>
      </box>

      <For each={lines().lines}>
        {(line) => (
          <box flexDirection="row" height={1} gap={1}>
            <text fg={riskColor(line.level, props.theme)}>{`[${line.label}]`}</text>
            {line.conf !== "HIGH" && (
              <text fg={line.conf === "LOW" ? props.theme.warning : props.theme.muted}>
                {`[CONF:${line.conf}]`}
              </text>
            )}
            <text fg={line.conf === "LOW" ? props.theme.muted : props.theme.muted}>
              {line.icon}
              {line.title}
            </text>
          </box>
        )}
      </For>
      {lines().overflow > 0 && (
        <box flexDirection="row" height={1} gap={1}>
          <text fg={props.theme.muted}>… and {lines().overflow} more (scroll in scrollback)</text>
        </box>
      )}

      <box flexDirection="row" height={1} borderTop={1} borderColor={borderColor()} gap={1}>
        <text fg={borderColor()}>
          {risk() === "danger" ? "⛔ DANGER" : risk() === "mutate" ? "⚠ MUTATE" : risk() === "write" ? "◈ WRITE" : "● SAFE"}
        </text>
        <text fg={props.theme.muted}>{props.requests.length} action{props.requests.length !== 1 ? "s" : ""}</text>
      </box>
    </box>
  )
}
