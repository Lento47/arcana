import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { RoundBorder } from "../../ui/chrome"
import { HairlineBorder } from "../../ui/border"
import type { InsightCardModel, InsightMetricTone } from "./spine-insight"
import { chipCellWidth, insightHeaderChrome, packChipRows } from "./spine-chrome"

function toneColor(tone: InsightMetricTone, theme: Theme) {
  if (tone === "fail") return theme.error
  if (tone === "warn") return theme.warning
  if (tone === "pass") return theme.success
  return theme.textMuted
}

function severityColor(severity: InsightCardModel["severity"], theme: Theme) {
  if (severity === "HIGH") return theme.error
  if (severity === "MEDIUM") return theme.warning
  if (severity === "LOW") return theme.accent
  return theme.spineDiffMuted
}

/** Dedicated insight card for scorecard / table / report / receipt visuals. */
export function SpineInsightCard(props: {
  card: InsightCardModel
  focused?: boolean
  contentWidth?: number
}) {
  const { theme } = useTheme()
  const card = () => props.card
  const critical = createMemo(() => card().severity === "HIGH")
  const header = createMemo(() => insightHeaderChrome({ title: card().title, severity: card().severity }))
  const metrics = () => card().metrics.slice(0, 8)
  const metricRows = createMemo(() => {
    const raw = props.contentWidth
    const budget = typeof raw === "number" && Number.isFinite(raw) ? Math.max(1, Math.floor(raw) - 4) : 40
    return packChipRows(
      metrics().map((metric) => ({ ...metric, text: `${metric.label} ${metric.value}` })),
      budget,
      (item) => chipCellWidth(item.text),
    )
  })

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      minWidth={0}
      marginTop={1}
      marginBottom={1}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={critical() ? 1 : 0}
      paddingBottom={critical() ? 1 : 0}
      border={critical() ? true : ["left"]}
      customBorderChars={critical() ? RoundBorder : HairlineBorder}
      borderColor={severityColor(card().severity, theme)}
      backgroundColor={theme.backgroundPanel}
    >
      <box flexDirection="row" flexShrink={0} minWidth={0} gap={1} alignItems="center">
        <text fg={theme.text} wrapMode="none">
          {header().title}
        </text>
        <box flexGrow={1} minWidth={1} />
        <Show when={header().showSeverity}>
          <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
            <text fg={severityColor(card().severity, theme)} wrapMode="none">
              {header().severity}
            </text>
          </box>
        </Show>
      </box>
      <Show when={card().summary}>
        <text fg={theme.textMuted} wrapMode="word">
          {card().summary}
        </text>
      </Show>
      <box flexDirection="column" flexShrink={0} marginTop={1} gap={1}>
        <For each={metricRows()}>
          {(row) => (
            <box flexDirection="row" flexShrink={0} gap={1} minWidth={0}>
              <For each={row}>
                {(metric) => (
                  <box
                    flexShrink={0}
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={metric.tone === "fail" || metric.tone === "warn" ? theme.backgroundElement : undefined}
                  >
                    <text wrapMode="none">
                      <span style={{ fg: theme.spineContext }}>{metric.label} </span>
                      <span style={{ fg: toneColor(metric.tone, theme) }}>{metric.value}</span>
                    </text>
                  </box>
                )}
              </For>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
