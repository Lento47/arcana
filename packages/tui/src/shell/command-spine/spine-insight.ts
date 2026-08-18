/**
 * Insight-card projection from structured spine data (report / scorecard / table / receipt).
 * Empty or non-visual input yields no card.
 */

import type { SpineConcernSeverity, SpineReceipt, SpineReportData } from "./spine-types"

export type InsightMetricTone = "pass" | "warn" | "fail" | "info"

export type InsightMetric = {
  label: string
  value: string
  tone: InsightMetricTone
}

export type InsightCardModel = {
  title: string
  summary: string
  metrics: InsightMetric[]
  severity: SpineConcernSeverity | "NONE"
  source: "report" | "scorecard" | "table" | "receipt"
}

const RANK: Record<SpineConcernSeverity | "NONE", number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  NONE: 0,
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function scoreTone(status: "pass" | "warn" | "fail"): InsightMetricTone {
  return status
}

function cellTone(cell: string): InsightMetricTone {
  if (/fail|error|denied/i.test(cell)) return "fail"
  if (/warn|pending/i.test(cell)) return "warn"
  return "info"
}

function concernSeverity(concerns: SpineReportData["concerns"] | undefined): SpineConcernSeverity | "NONE" {
  let worst: SpineConcernSeverity | "NONE" = "NONE"
  for (const concern of concerns ?? []) {
    if (RANK[concern.severity] > RANK[worst]) worst = concern.severity
  }
  return worst
}

function worseSeverity(
  a: SpineConcernSeverity | "NONE",
  b: SpineConcernSeverity | "NONE",
): SpineConcernSeverity | "NONE" {
  return RANK[a] >= RANK[b] ? a : b
}

function fromScorecard(
  scorecard: SpineReportData["scorecard"],
  title?: string,
  summary?: string,
  concerns?: SpineReportData["concerns"],
): InsightCardModel | undefined {
  if (!scorecard.length) return undefined
  const fail = scorecard.filter((item) => item.status === "fail").length
  const warn = scorecard.filter((item) => item.status === "warn").length
  const pass = scorecard.filter((item) => item.status === "pass").length
  const metrics: InsightMetric[] = scorecard.map((item) => ({
    label: item.label,
    value: item.status,
    tone: scoreTone(item.status),
  }))
  metrics.unshift({
    label: "checks",
    value: `${pass} pass · ${warn} warn · ${fail} fail`,
    tone: fail > 0 ? "fail" : warn > 0 ? "warn" : "pass",
  })
  return {
    title: hasText(title) ? title.trim() : "Scorecard",
    summary: summary?.trim() ?? "",
    metrics,
    severity: worseSeverity(
      concernSeverity(concerns),
      fail > 0 ? "HIGH" : warn > 0 ? "MEDIUM" : "NONE",
    ),
    source: hasText(title) || (concerns?.length ?? 0) > 0 ? "report" : "scorecard",
  }
}

function fromTable(table: { headers: string[]; rows: string[][] }): InsightCardModel | undefined {
  if (!table.headers.length && !table.rows.length) return undefined
  const title = table.headers[0]?.trim() || "Table"
  const metrics: InsightMetric[] = [
    { label: "rows", value: String(table.rows.length), tone: "info" },
    { label: "cols", value: String(table.headers.length), tone: "info" },
  ]
  const first = table.rows[0]
  if (first) {
    for (let i = 0; i < Math.min(first.length, table.headers.length, 4); i++) {
      const cell = (first[i] ?? "").trim()
      if (!cell) continue
      metrics.push({
        label: table.headers[i] || `col ${i + 1}`,
        value: cell,
        tone: cellTone(cell),
      })
    }
  }
  let severity: InsightCardModel["severity"] = "NONE"
  for (const row of table.rows) {
    for (const cell of row) {
      const tone = cellTone(cell ?? "")
      if (tone === "fail") severity = "HIGH"
      else if (tone === "warn" && severity === "NONE") severity = "LOW"
    }
  }
  return {
    title,
    summary: table.rows.length === 1 ? "1 row" : `${table.rows.length} rows`,
    metrics,
    severity,
    source: "table",
  }
}

function fromReceipt(receipt: SpineReceipt): InsightCardModel | undefined {
  const stats = receipt.stats
  const files = receipt.files ?? []
  const hasStats = Boolean(
    stats
    && (stats.passed !== undefined
      || stats.failed !== undefined
      || stats.added !== undefined
      || stats.removed !== undefined
      || stats.duration),
  )
  if (!hasStats && files.length === 0) return undefined

  const metrics: InsightMetric[] = []
  if (stats?.passed !== undefined) {
    metrics.push({ label: "passed", value: String(stats.passed), tone: "pass" })
  }
  if (stats?.failed !== undefined) {
    metrics.push({ label: "failed", value: String(stats.failed), tone: stats.failed > 0 ? "fail" : "pass" })
  }
  if (stats?.added !== undefined) {
    metrics.push({ label: "added", value: `+${stats.added}`, tone: "info" })
  }
  if (stats?.removed !== undefined) {
    metrics.push({ label: "removed", value: `-${stats.removed}`, tone: "info" })
  }
  if (stats?.duration) {
    metrics.push({ label: "duration", value: stats.duration, tone: "info" })
  }
  if (files.length > 0) {
    const added = files.reduce((sum, file) => sum + file.added, 0)
    const removed = files.reduce((sum, file) => sum + file.removed, 0)
    metrics.push({ label: "files", value: String(files.length), tone: "info" })
    if (added || removed) {
      metrics.push({ label: "delta", value: `+${added} −${removed}`, tone: "info" })
    }
  }
  if (metrics.length === 0) return undefined

  const failed = stats?.failed ?? 0
  return {
    title: receipt.label?.trim() || "Receipt",
    summary: receipt.summary?.trim() ?? "",
    metrics,
    severity: receipt.status === "fail" || failed > 0 ? "HIGH" : "NONE",
    source: "receipt",
  }
}

export function projectInsightCard(input: {
  report?: SpineReportData | null
  scorecard?: SpineReportData["scorecard"] | null
  table?: { headers: string[]; rows: string[][] } | null
  receipt?: SpineReceipt | null
}): InsightCardModel | undefined {
  if (input.report) {
    const card = fromScorecard(
      input.report.scorecard,
      input.report.title,
      input.report.summary,
      input.report.concerns,
    )
    if (card) return card
    if (hasText(input.report.title) || hasText(input.report.summary) || input.report.concerns.length > 0) {
      return {
        title: hasText(input.report.title) ? input.report.title.trim() : "Report",
        summary: input.report.summary?.trim() ?? "",
        metrics: input.report.concerns.map((concern) => ({
          label: concern.severity,
          value: concern.title,
          tone: concern.severity === "HIGH" ? "fail" : concern.severity === "MEDIUM" ? "warn" : "info",
        })),
        severity: concernSeverity(input.report.concerns),
        source: "report",
      }
    }
  }
  if (input.scorecard?.length) {
    return fromScorecard(input.scorecard)
  }
  if (input.table) {
    const card = fromTable(input.table)
    if (card) return card
  }
  if (input.receipt) {
    const card = fromReceipt(input.receipt)
    if (card) return card
  }
  return undefined
}
