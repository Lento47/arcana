import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { Session } from "@/session/session"
import { NotFoundError } from "@/storage/storage"
import { Database } from "@arcana/core/database/database"
import { SessionTable } from "@arcana/core/session/sql"
import { Project } from "@/project/project"
import { InstanceRef } from "@/effect/instance-ref"

export interface SessionStats {
  totalSessions: number
  totalMessages: number
  totalCost: number
  totalTokens: {
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  toolUsage: Record<string, number>
  modelUsage: Record<
    string,
    {
      messages: number
      tokens: {
        input: number
        output: number
        cache: {
          read: number
          write: number
        }
      }
      cost: number
    }
  >
  dateRange: {
    earliest: number
    latest: number
  }
  days: number
  costPerDay: number
  tokensPerSession: number
  medianTokensPerSession: number
}

export const StatsCommand = effectCmd({
  command: "stats",
  describe: "show token usage and cost statistics",
  builder: (yargs) =>
    yargs
      .option("days", {
        describe: "show stats for the last N days (default: all time)",
        type: "number",
      })
      .option("tools", {
        describe: "number of tools to show (default: all)",
        type: "number",
      })
      .option("models", {
        describe: "show model statistics (default: hidden). Pass a number to show top N, otherwise shows all",
      })
      .option("project", {
        describe: "filter by project (default: all projects, empty string: current project)",
        type: "string",
      }),
  handler: Effect.fn("Cli.stats")(function* (args) {
    const ctx = yield* InstanceRef
    if (!ctx) return
    const stats = yield* aggregateSessionStats(args.days, args.project, ctx.project)
    let modelLimit: number | undefined
    if (args.models === true) {
      modelLimit = Infinity
    } else if (typeof args.models === "number") {
      modelLimit = args.models
    }
    displayStats(stats, args.tools, modelLimit)
  }),
})

const getAllSessions = Effect.fnUntraced(function* () {
  const { db } = yield* Database.Service
  return (yield* db.select().from(SessionTable).limit(1000).all().pipe(Effect.orDie)).map((row) => Session.fromRow(row))
})

const aggregateSessionStats = Effect.fn("Cli.stats.aggregate")(function* (
  days?: number,
  projectFilter?: string,
  currentProject?: Project.Info,
) {
  const svc = yield* Session.Service
  const sessions = yield* getAllSessions()
  const MS_IN_DAY = 24 * 60 * 60 * 1000

  const cutoffTime = (() => {
    if (days === undefined) return 0
    if (days === 0) {
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      return now.getTime()
    }
    return Date.now() - days * MS_IN_DAY
  })()

  const windowDays = (() => {
    if (days === undefined) return
    if (days === 0) return 1
    return days
  })()

  let filteredSessions = cutoffTime > 0 ? sessions.filter((session) => session.time.updated >= cutoffTime) : sessions

  if (projectFilter !== undefined) {
    if (projectFilter === "") {
      if (!currentProject) throw new Error("currentProject required when projectFilter is empty string")
      filteredSessions = filteredSessions.filter((session) => session.projectID === currentProject.id)
    } else {
      filteredSessions = filteredSessions.filter((session) => session.projectID === projectFilter)
    }
  }

  const stats: SessionStats = {
    totalSessions: filteredSessions.length,
    totalMessages: 0,
    totalCost: 0,
    totalTokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
    toolUsage: {},
    modelUsage: {},
    dateRange: {
      earliest: Date.now(),
      latest: Date.now(),
    },
    days: 0,
    costPerDay: 0,
    tokensPerSession: 0,
    medianTokensPerSession: 0,
  }

  if (filteredSessions.length > 1000) {
    console.log(`Large dataset detected (${filteredSessions.length} sessions). This may take a while...`)
  }

  if (filteredSessions.length === 0) {
    stats.days = windowDays ?? 0
    return stats
  }

  let earliestTime = Date.now()
  let latestTime = 0

  const sessionTotalTokens: number[] = []

  const results = yield* Effect.forEach(
    filteredSessions,
    (session) =>
      Effect.gen(function* () {
        const messages = yield* svc
          .messages({ sessionID: session.id })
          .pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.succeed([])))

        const sessionCost = session.cost ?? 0
        const sessionTokens = session.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
        let sessionToolUsage: Record<string, number> = {}
        let sessionModelUsage: Record<
          string,
          {
            messages: number
            tokens: { input: number; output: number; cache: { read: number; write: number } }
            cost: number
          }
        > = {}

        for (const message of messages) {
          if (message.info.role === "assistant") {
            const modelKey = `${message.info.providerID}/${message.info.modelID}`
            if (!sessionModelUsage[modelKey]) {
              sessionModelUsage[modelKey] = {
                messages: 0,
                tokens: { input: 0, output: 0, cache: { read: 0, write: 0 } },
                cost: 0,
              }
            }
            sessionModelUsage[modelKey].messages++
            sessionModelUsage[modelKey].cost += message.info.cost || 0

            if (message.info.tokens) {
              sessionModelUsage[modelKey].tokens.input += message.info.tokens.input || 0
              sessionModelUsage[modelKey].tokens.output +=
                (message.info.tokens.output || 0) + (message.info.tokens.reasoning || 0)
              sessionModelUsage[modelKey].tokens.cache.read += message.info.tokens.cache?.read || 0
              sessionModelUsage[modelKey].tokens.cache.write += message.info.tokens.cache?.write || 0
            }
          }

          for (const part of message.parts) {
            if (part.type === "tool" && part.tool) {
              sessionToolUsage[part.tool] = (sessionToolUsage[part.tool] || 0) + 1
            }
          }
        }

        return {
          messageCount: messages.length,
          sessionCost,
          sessionTokens,
          sessionTotalTokens:
            sessionTokens.input +
            sessionTokens.output +
            sessionTokens.reasoning +
            sessionTokens.cache.read +
            sessionTokens.cache.write,
          sessionToolUsage,
          sessionModelUsage,
          earliestTime: cutoffTime > 0 ? session.time.updated : session.time.created,
          latestTime: session.time.updated,
        }
      }),
    { concurrency: 20 },
  )

  for (const result of results) {
    earliestTime = Math.min(earliestTime, result.earliestTime)
    latestTime = Math.max(latestTime, result.latestTime)
    sessionTotalTokens.push(result.sessionTotalTokens)

    stats.totalMessages += result.messageCount
    stats.totalCost += result.sessionCost
    stats.totalTokens.input += result.sessionTokens.input
    stats.totalTokens.output += result.sessionTokens.output
    stats.totalTokens.reasoning += result.sessionTokens.reasoning
    stats.totalTokens.cache.read += result.sessionTokens.cache.read
    stats.totalTokens.cache.write += result.sessionTokens.cache.write

    for (const [tool, count] of Object.entries(result.sessionToolUsage)) {
      stats.toolUsage[tool] = (stats.toolUsage[tool] || 0) + count
    }

    for (const [model, usage] of Object.entries(result.sessionModelUsage)) {
      if (!stats.modelUsage[model]) {
        stats.modelUsage[model] = {
          messages: 0,
          tokens: { input: 0, output: 0, cache: { read: 0, write: 0 } },
          cost: 0,
        }
      }
      stats.modelUsage[model].messages += usage.messages
      stats.modelUsage[model].tokens.input += usage.tokens.input
      stats.modelUsage[model].tokens.output += usage.tokens.output
      stats.modelUsage[model].tokens.cache.read += usage.tokens.cache.read
      stats.modelUsage[model].tokens.cache.write += usage.tokens.cache.write
      stats.modelUsage[model].cost += usage.cost
    }
  }

  const rangeDays = Math.max(1, Math.ceil((latestTime - earliestTime) / MS_IN_DAY))
  const effectiveDays = windowDays ?? rangeDays
  stats.dateRange = {
    earliest: earliestTime,
    latest: latestTime,
  }
  stats.days = effectiveDays
  stats.costPerDay = stats.totalCost / effectiveDays
  const totalTokens =
    stats.totalTokens.input +
    stats.totalTokens.output +
    stats.totalTokens.reasoning +
    stats.totalTokens.cache.read +
    stats.totalTokens.cache.write
  stats.tokensPerSession = filteredSessions.length > 0 ? totalTokens / filteredSessions.length : 0
  sessionTotalTokens.sort((a, b) => a - b)
  const mid = Math.floor(sessionTotalTokens.length / 2)
  stats.medianTokensPerSession =
    sessionTotalTokens.length === 0
      ? 0
      : sessionTotalTokens.length % 2 === 0
        ? (sessionTotalTokens[mid - 1] + sessionTotalTokens[mid]) / 2
        : sessionTotalTokens[mid]

  return stats
})

/**
 * Render stats as a complete, width-safe terminal frame.
 *
 * `width` is the total frame width, including both vertical borders. The
 * default preserves the standalone CLI's compact 58-column frame. The TUI
 * supplies a dialog-safe width through `ARCANA_STATS_WIDTH` so this output can
 * be shown in a padded dialog without wrapping its borders.
 */
export function formatStats(
  stats: SessionStats,
  toolLimit?: number,
  modelLimit?: number,
  width = statsFrameWidth(),
): string {
  const frameWidth = statsFrameWidth(width)
  const contentWidth = frameWidth - 2
  const horizontal = (char: string) => char.repeat(contentWidth)
  const top = `┌${horizontal("─")}┐`
  const divider = `├${horizontal("─")}┤`
  const bottom = `└${horizontal("─")}┘`

  const frame = (content = "") => `│${fitText(content, contentWidth).padEnd(contentWidth, " ")}│`
  const heading = (label: string) => {
    const title = fitText(label, contentWidth)
    const left = Math.max(0, Math.floor((contentWidth - displayWidth(title)) / 2))
    return frame(" ".repeat(left) + title)
  }
  const renderRow = (label: string, value: string) => {
    const safeValue = fitText(value, Math.max(1, contentWidth - 1))
    const valueWidth = displayWidth(safeValue)
    const safeLabel = fitText(label, Math.max(1, contentWidth - valueWidth - 1))
    const gap = Math.max(1, contentWidth - displayWidth(safeLabel) - valueWidth)
    return frame(safeLabel + " ".repeat(gap) + safeValue)
  }
  const section = (title: string, rows: string[]) => [top, heading(title), divider, ...rows, bottom]
  const lines: string[] = []

  // Overview section
  lines.push(
    ...section("OVERVIEW", [
      renderRow("Sessions", stats.totalSessions.toLocaleString()),
      renderRow("Messages", stats.totalMessages.toLocaleString()),
      renderRow("Days", stats.days.toString()),
    ]),
    "",
  )

  // Cost & Tokens section
  const cost = Number.isFinite(stats.totalCost) ? stats.totalCost : 0
  const costPerDay = Number.isFinite(stats.costPerDay) ? stats.costPerDay : 0
  const tokensPerSession = Number.isFinite(stats.tokensPerSession) ? stats.tokensPerSession : 0
  const medianTokensPerSession = Number.isFinite(stats.medianTokensPerSession) ? stats.medianTokensPerSession : 0
  lines.push(
    ...section("COST & TOKENS", [
      renderRow("Total Cost", `$${cost.toFixed(2)}`),
      renderRow("Avg Cost/Day", `$${costPerDay.toFixed(2)}`),
      renderRow("Avg Tokens/Session", formatNumber(Math.round(tokensPerSession))),
      renderRow("Median Tokens/Session", formatNumber(Math.round(medianTokensPerSession))),
      renderRow("Input", formatNumber(stats.totalTokens.input)),
      renderRow("Output", formatNumber(stats.totalTokens.output)),
      renderRow("Cache Read", formatNumber(stats.totalTokens.cache.read)),
      renderRow("Cache Write", formatNumber(stats.totalTokens.cache.write)),
    ]),
    "",
  )

  // Model Usage section
  if (modelLimit !== undefined && Object.keys(stats.modelUsage).length > 0) {
    const sortedModels = Object.entries(stats.modelUsage).sort(([, a], [, b]) => b.messages - a.messages)
    const modelsToDisplay = modelLimit === Infinity ? sortedModels : sortedModels.slice(0, Math.max(0, modelLimit))
    const modelRows: string[] = []

    for (const [model, usage] of modelsToDisplay) {
      modelRows.push(
        frame(` ${fitText(model, Math.max(1, contentWidth - 1))}`),
        renderRow("  Messages", usage.messages.toLocaleString()),
        renderRow("  Input Tokens", formatNumber(usage.tokens.input)),
        renderRow("  Output Tokens", formatNumber(usage.tokens.output)),
        renderRow("  Cache Read", formatNumber(usage.tokens.cache.read)),
        renderRow("  Cache Write", formatNumber(usage.tokens.cache.write)),
        renderRow("  Cost", `$${usage.cost.toFixed(4)}`),
      )
      if (model !== modelsToDisplay.at(-1)?.[0]) modelRows.push(divider)
    }
    lines.push(...section("MODEL USAGE", modelRows), "")
  }

  // Tool Usage section
  if (Object.keys(stats.toolUsage).length > 0) {
    const sortedTools = Object.entries(stats.toolUsage).sort(([, a], [, b]) => b - a)
    const toolsToDisplay = toolLimit !== undefined ? sortedTools.slice(0, Math.max(0, toolLimit)) : sortedTools
    if (toolsToDisplay.length > 0) {
      const maxCount = Math.max(1, ...toolsToDisplay.map(([, count]) => count))
      const totalToolUsage = Math.max(
        1,
        Object.values(stats.toolUsage).reduce((a, b) => a + b, 0),
      )
      const toolNameWidth = Math.min(18, Math.max(5, Math.floor(contentWidth * 0.32)))
      const countWidth = 3
      const percentageWidth = 6
      const prefixWidth = 1 + toolNameWidth + 1
      const suffixWidth = 1 + countWidth + 2 + percentageWidth
      const barWidth = Math.max(1, Math.min(20, contentWidth - prefixWidth - suffixWidth))
      const toolRows = toolsToDisplay.map(([tool, count]) => {
        const name = fitText(tool, toolNameWidth).padEnd(toolNameWidth, " ")
        const barLength = Math.max(1, Math.floor((count / maxCount) * barWidth))
        const bar = "█".repeat(barLength).padEnd(barWidth, " ")
        const percentage = `${((count / totalToolUsage) * 100).toFixed(1).padStart(4)}%`
        return frame(` ${name} ${bar} ${count.toString().padStart(countWidth)} (${percentage})`)
      })
      lines.push(...section("TOOL USAGE", toolRows), "")
    }
  }

  return lines.join("\n").replace(/\n+$/, "")
}

/** Print the formatted frame without emitting cursor-control sequences. */
export function displayStats(stats: SessionStats, toolLimit?: number, modelLimit?: number) {
  console.log(formatStats(stats, toolLimit, modelLimit))
}

const DEFAULT_STATS_FRAME_WIDTH = 58
const MIN_STATS_FRAME_WIDTH = 20
const MAX_STATS_FRAME_WIDTH = 160

export function statsFrameWidth(width?: number): number {
  const fromEnv = Number(process.env.ARCANA_STATS_WIDTH)
  const requested = width ?? (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_STATS_FRAME_WIDTH)
  const candidate = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_STATS_FRAME_WIDTH
  return Math.max(MIN_STATS_FRAME_WIDTH, Math.min(MAX_STATS_FRAME_WIDTH, Math.floor(candidate)))
}

function displayWidth(value: string): number {
  return Bun.stringWidth(value)
}

function fitText(value: string, width: number): string {
  const budget = Math.max(0, Math.floor(width))
  if (displayWidth(value) <= budget) return value
  if (budget <= 1) return "…".slice(0, budget)

  let output = ""
  let used = 0
  for (const character of value) {
    const next = displayWidth(character)
    if (used + next > budget - 1) break
    output += character
    used += next
  }
  return output + "…"
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M"
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K"
  }
  return num.toString()
}
