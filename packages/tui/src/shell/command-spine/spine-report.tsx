import { For, Show } from "solid-js"
import type { SpineReportData, SpineConcernSeverity } from "./spine-types"
import { useTheme } from "../../context/theme"

function severityColor(severity: SpineConcernSeverity, t: Record<string, unknown>) {
  if (severity === "HIGH") return (t.error ?? t.spineFail) as any
  if (severity === "MEDIUM") return (t.warning ?? t.accent) as any
  return (t.textMuted ?? t.spineContext) as any
}

function scoreGlyph(status: "pass" | "warn" | "fail") {
  if (status === "pass") return "✓"
  if (status === "fail") return "✗"
  return "⚠"
}

function scoreColor(status: "pass" | "warn" | "fail", t: Record<string, unknown>) {
  if (status === "pass") return (t.success ?? t.spineOk) as any
  if (status === "fail") return (t.error ?? t.spineFail) as any
  return (t.warning ?? t.accent) as any
}

export function SpineReport(props: { report: SpineReportData; expanded?: boolean; focused?: boolean }) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const r = props.report

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0}>
      {/* Summary paragraph */}
      <Show when={r.summary}>
        <box flexShrink={0} paddingTop={1} paddingBottom={1}>
          <text fg={t.textMuted as any} wrapMode="word">
            {r.summary}
          </text>
        </box>
      </Show>

      {/* Scorecard strip — horizontal badges */}
      <Show when={r.scorecard.length > 0}>
        <box flexDirection="row" flexShrink={0} gap={1} paddingBottom={1}>
          <For each={r.scorecard}>
            {(item) => (
              <box flexShrink={0} paddingLeft={1} paddingRight={1}>
                <text fg={scoreColor(item.status, t)}>
                  {item.label} {scoreGlyph(item.status)}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>

      {/* Concern callouts — stacked, colored left border */}
      <Show when={props.expanded !== false && r.concerns.length > 0}>
        <box flexDirection="column" flexShrink={0}>
          <For each={r.concerns}>
            {(concern) => (
              <box
                flexShrink={0}
                border={["left"]}
                borderColor={severityColor(concern.severity, t) as any}
                paddingLeft={2}
                paddingTop={0}
                paddingBottom={1}
                marginBottom={1}
                minWidth={0}
              >
                <text fg={severityColor(concern.severity, t) as any}>
                  {concern.severity} — {concern.title}
                </text>
                <Show when={concern.detail}>
                  <text fg={t.textMuted as any} wrapMode="word">
                    {concern.detail}
                  </text>
                </Show>
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}
