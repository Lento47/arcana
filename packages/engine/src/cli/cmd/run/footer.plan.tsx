// Ghost plan preview — renders pending tool calls as dimmed text before execution.
//
// Displays inside the footer when the reducer pushes FooterView { type: "plan" }.
// Each tool shows a risk label [SAFE]/[WRITE]/[MUTATE]/[DANGER] and description.
// Risk perimeter: border color shifts green→yellow→red based on highest pending risk.
// Keyboard: Enter = approve all, Esc = reject all, Tab = focus first for editing.
/** @jsxImportSource @opentui/solid */
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { For, createMemo } from "solid-js"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { permissionInfo } from "./permission.shared"
import { footerWidthPolicy } from "./footer.width"
import { transparent, type RunFooterTheme } from "./theme"
import type { PermissionReply } from "./types"

type RiskLevel = "safe" | "write" | "mutate" | "danger"

function riskLabel(info: ReturnType<typeof permissionInfo>): { level: RiskLevel; label: string } {
  const title = info.title?.toLowerCase() ?? ""
  const tool = info.icon ?? ""
  if (tool === "bash" || tool === "shell") {
    if (/rm\s+-rf|curl.*\|.*sh|>\/dev\/|dd\s+if=|mkfs/.test(title)) return { level: "danger", label: "DANGER" }
    if (/install|uninstall|apt|brew|pip|npm\s+(install|uninstall)/.test(title)) return { level: "mutate", label: "MUTATE" }
    if (/curl|wget|fetch|api|http/.test(title)) return { level: "mutate", label: "NETWORK" }
    if (/echo|cat|ls|git\s+(status|diff|log)|grep|find/.test(title)) return { level: "safe", label: "SAFE" }
    return { level: "write", label: "SHELL" }
  }
  if (tool === "write" || tool === "edit" || tool === "apply_patch") return { level: "write", label: "WRITE" }
  if (tool === "read" || tool === "grep" || tool === "glob") return { level: "safe", label: "SAFE" }
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

function highestRisk(infos: Array<ReturnType<typeof permissionInfo>>): RiskLevel {
  const order: RiskLevel[] = ["safe", "write", "mutate", "danger"]
  let max = 0
  for (const info of infos) {
    const r = riskLabel(info)
    const i = order.indexOf(r.level)
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
  const infos = createMemo(() => props.requests.map((r) => permissionInfo(r)))
  const risk = createMemo(() => highestRisk(infos()))
  const borderColor = createMemo(() => riskColor(risk(), props.theme))

  useKeyboard(() => ({
    onReturn() {
      props.onApproveAll()
    },
    onEscape() {
      props.onRejectAll()
    },
  }))

  const term = useTerminalDimensions()
  const width = createMemo(() => footerWidthPolicy(term()))

  const lines = createMemo(() => {
    return infos().map((info) => {
      const r = riskLabel(info)
      const icon = info.icon ? ` ${info.icon} ` : ""
      const title = info.title ?? "unknown action"
      const truncated = title.length > width() - 14 ? title.slice(0, width() - 17) + "…" : title
      return { icon, title: truncated, level: r.level, label: r.label }
    })
  })

  const hint = "Enter: execute all  ·  Esc: reject all"

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      {/* Ghost plan header */}
      <box flexDirection="row" height={1} gap={1}>
        <text fg={props.theme.muted} attributes="dim">
          ⚡ {props.requests.length} action{props.requests.length !== 1 ? "s" : ""} pending —
          press Enter to execute
        </text>
      </box>

      {/* Tool preview lines */}
      <For each={lines()}>
        {(line) => (
          <box flexDirection="row" height={1} gap={1}>
            <text fg={riskColor(line.level, props.theme)}>{`[${line.label}]`}</text>
            <text fg={props.theme.muted} attributes="dim">
              {line.icon}
              {line.title}
            </text>
          </box>
        )}
      </For>

      {/* Risk perimeter + hint bar */}
      <box
        flexDirection="row"
        height={1}
        borderTop={1}
        borderColor={borderColor()}
        paddingTop={0}
        marginTop={0}
        gap={1}
      >
        <text fg={props.theme.muted} attributes="dim">
          {hint}
        </text>
      </box>
    </box>
  )
}
