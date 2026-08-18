import { For, Show, createMemo } from "solid-js"
import type { SpineReportData, SpineConcernSeverity } from "./spine-types"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { displayWidth, truncate } from "../../util/locale"
import { projectInsightCard } from "./spine-insight"
import { SpineInsightCard } from "./spine-insight-card"

// Scorecard geometry (audit O2). A badge is `[pad][label] [glyph][pad]` —
// 2 padding cells + 1 space + 1 glyph; badges are separated by a 1-col gap.
const SCORECARD_BADGE_PAD = 2
const SCORECARD_SPACE = 1
const SCORECARD_GLYPH = 1
const SCORECARD_GAP = 1
/** Only guards direct/test use — the shell always supplies `contentWidth`. */
const SCORECARD_FALLBACK_WIDTH = 48

/** Display width of one scorecard badge (label + space + glyph + padding). */
export function scorecardBadgeWidth(label: string): number {
  return displayWidth(label) + SCORECARD_SPACE + SCORECARD_GLYPH + SCORECARD_BADGE_PAD
}

/**
 * Max label display width that fits a badge inside `contentWidth`.
 * Floored at 1 — a degenerate tiny budget still renders a readable stub.
 */
export function scorecardLabelMax(contentWidth: number): number {
  return Math.max(1, contentWidth - SCORECARD_SPACE - SCORECARD_GLYPH - SCORECARD_BADGE_PAD)
}

/**
 * Greedy row pack for the scorecard strip (audit O2): badges flow to the next
 * row when adding one would exceed `contentWidth` (gap included). A badge wider
 * than the budget keeps its own row — the render path truncates its label, so
 * it can never overflow. Deterministic and width-testable at 24/30/40 cols.
 */
export function packScorecardRows(
  scorecard: SpineReportData["scorecard"],
  contentWidth: number,
): SpineReportData["scorecard"][] {
  const rows: SpineReportData["scorecard"][] = []
  let row: SpineReportData["scorecard"] = []
  let used = 0
  for (const badge of scorecard) {
    const w = scorecardBadgeWidth(badge.label)
    if (row.length > 0 && used + SCORECARD_GAP + w > contentWidth) {
      rows.push(row)
      row = []
      used = 0
    }
    row.push(badge)
    used += (row.length > 1 ? SCORECARD_GAP : 0) + w
  }
  if (row.length > 0) rows.push(row)
  return rows
}

function severityColor(severity: SpineConcernSeverity, t: Theme) {
  if (severity === "HIGH") return t.error
  if (severity === "MEDIUM") return t.warning
  return t.textMuted
}

function scoreGlyph(status: "pass" | "warn" | "fail") {
  if (status === "pass") return "✓"
  if (status === "fail") return "✗"
  return "⚠"
}

function scoreColor(status: "pass" | "warn" | "fail", t: Theme) {
  if (status === "pass") return t.success
  if (status === "fail") return t.error
  return t.warning
}

export function SpineReport(props: {
  report: SpineReportData
  expanded?: boolean
  focused?: boolean
  /** Content-column budget (terminal − gutters) for scorecard row packing. */
  contentWidth?: number
}) {
  const { theme } = useTheme()
  const r = props.report
  // The shell always supplies contentWidth (spine-entry forwards proseWidth);
  // the fallback only guards direct/test use — never a bare-80 width. Mirror
  // spineProseWidth's finite guard: a NaN budget would poison truncate ("").
  const scorecardBudget = createMemo(() => {
    const raw = props.contentWidth
    const budget = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : SCORECARD_FALLBACK_WIDTH
    return Math.max(1, budget)
  })
  // Read through the reactive `props.report`, never a frozen `const r` capture,
  // so streaming re-parses that swap the report object refresh the scorecard.
  const scorecardRows = createMemo(() => packScorecardRows(props.report.scorecard, scorecardBudget()))
  const badgeLabelMax = createMemo(() => scorecardLabelMax(scorecardBudget()))
  const insight = createMemo(() => projectInsightCard({ report: props.report }))

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0}>
      <Show when={insight()}>
        {(card) => <SpineInsightCard card={card()} focused={props.focused} contentWidth={scorecardBudget()} />}
      </Show>
      {/* Summary paragraph */}
      <Show when={r.summary}>
        <box flexShrink={0} paddingTop={1} paddingBottom={1}>
          <text fg={theme.textMuted} wrapMode="word">
            {r.summary}
          </text>
        </box>
      </Show>

      {/* Scorecard strip — row-packed badges (audit O2: no horizontal overflow;
          long labels truncate to the budget instead of overflowing) */}
      <Show when={props.report.scorecard.length > 0}>
        <box flexDirection="column" flexShrink={0} gap={1} paddingBottom={1}>
          <For each={scorecardRows()}>
            {(row) => (
              <box flexDirection="row" flexShrink={0} gap={1}>
                <For each={row}>
                  {(item) => (
                    <box flexShrink={0} paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement}>
                      <text fg={scoreColor(item.status, theme)}>
                        {truncate(item.label, badgeLabelMax())} {scoreGlyph(item.status)}
                      </text>
                    </box>
                  )}
                </For>
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
                borderColor={severityColor(concern.severity, theme)}
                paddingLeft={2}
                paddingTop={0}
                paddingBottom={1}
                marginBottom={1}
                minWidth={0}
              >
                <text fg={severityColor(concern.severity, theme)}>
                  {concern.severity} — {concern.title}
                </text>
                <Show when={concern.detail}>
                  <text fg={theme.textMuted} wrapMode="word">
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
