import path from "path"
import { Effect, Schema } from "effect"
import { NonNegativeInt } from "@arcana/core/schema"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@arcana/core/fs-util"
import { Ripgrep } from "@arcana/core/ripgrep"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./grep.txt"
import * as Tool from "./tool"

export const DEFAULT_MAX_RESULTS = 500
export const HARD_MAX_RESULTS = 10_000

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({
    description:
      "Rust regex. Build ONE strong pattern: nested groups ((?:get|set|delete)(?:Config|Options)), optional parts ((?:export\\s+)?(?:async\\s+)?function\\s+\\w+), \\b boundaries, (?i) case-insensitive, (?x) verbose layout, \\p{Lu} Unicode classes. No lookahead/lookbehind/backreferences - restructure with alternation. Load the search-craft skill for the full pattern cookbook.",
  }),
  path: Schema.optional(Schema.String).annotate({
    description: "The directory or file to search in. Defaults to the current working directory.",
  }),
  include: Schema.optional(Schema.String).annotate({
    description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
  }),
  exclude: Schema.optional(Schema.String).annotate({
    description: 'File pattern to exclude (e.g. "**/*.test.ts", "**/{dist,node_modules}/**").',
  }),
  mode: Schema.optional(Schema.Literals(["matches", "files", "count"])).annotate({
    description:
      "'matches' (default): matching lines. 'files': only file paths containing matches - use for \"where is this used\" without line noise. 'count': per-file match totals.",
  }),
  maxResults: Schema.optional(NonNegativeInt).annotate({
    description: `Maximum result lines to return (default: ${DEFAULT_MAX_RESULTS}, max: ${HARD_MAX_RESULTS}). Narrow include/exclude/path or raise this instead of repeating the search.`,
  }),
  context: Schema.optional(NonNegativeInt).annotate({
    description:
      "Lines of context to show around each match (0-10, default 0). Context lines come back unmarked and count toward maxResults - one call can show the surrounding code without a separate read.",
  }),
  multiline: Schema.optional(Schema.Boolean).annotate({
    description:
      "Allow the pattern to span lines ('.' matches newlines). Use for whole blocks: \"(?:function|const)\\s+foo\\b[\\s\\S]*?\\}\". Slower - narrow with path/include.",
  }),
})

export const GrepTool = Tool.define(
  "grep",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (
        params: {
          pattern: string
          path?: string
          include?: string
          exclude?: string
          mode?: "matches" | "files" | "count"
          maxResults?: number
          context?: number
          multiline?: boolean
        },
        ctx: Tool.Context,
      ) =>
        Effect.gen(function* () {
          const limit = Math.min(Math.max(params.maxResults ?? DEFAULT_MAX_RESULTS, 1), HARD_MAX_RESULTS)
          const context = Math.min(Math.max(params.context ?? 0, 0), 10)
          const mode = params.mode ?? "matches"
          const empty = {
            title: params.pattern,
            metadata: { matches: 0, files: 0, truncated: false, limit, mode },
            output: "No matches found",
          }
          if (!params.pattern) {
            throw new Error("pattern is required")
          }

          yield* ctx.ask({
            permission: "grep",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
              include: params.include,
              exclude: params.exclude,
            },
          })

          const ins = yield* InstanceState.context
          const requested = path.isAbsolute(params.path ?? ins.directory)
            ? (params.path ?? ins.directory)
            : path.join(ins.directory, params.path ?? ".")
          const requestedInfo = yield* fs.stat(requested).pipe(Effect.catch(() => Effect.succeed(undefined)))
          yield* assertExternalDirectoryEffect(ctx, requested, {
            bypass: false,
            kind: requestedInfo?.type === "Directory" ? "directory" : "file",
          })

          const search = FSUtil.resolve(requested)
          const info = yield* fs.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
          const cwd = info?.type === "Directory" ? search : path.dirname(search)
          const result = yield* ripgrep.grep({
            cwd,
            pattern: params.pattern,
            include: params.include,
            ...(params.exclude ? { exclude: params.exclude } : {}),
            limit,
            ...(context > 0 ? { context } : {}),
            ...(params.multiline ? { multiline: true } : {}),
          })
          if (result.length === 0) return empty

          const rows = result.map((item) => ({
            path: path.resolve(cwd, item.entry.path),
            line: item.line,
            text: item.text,
            context: item.submatches.length === 0,
          }))

          const truncated = rows.length === limit
          const final = rows
          if (final.length === 0) return empty

          const byFile = new Map<string, number>()
          for (const row of final) {
            if (row.context) continue
            byFile.set(row.path, (byFile.get(row.path) ?? 0) + 1)
          }
          const matches = [...byFile.values()].reduce((total, count) => total + count, 0)
          const output = [
            `Found ${matches} matches in ${byFile.size} files${truncated ? ` (limit ${limit} reached)` : ""}`,
          ]

          if (mode === "files") {
            output.push(...byFile.keys())
          } else if (mode === "count") {
            for (const [file, count] of byFile) output.push(`${file}: ${count}`)
          } else {
            let current = ""
            for (const match of final) {
              if (current !== match.path) {
                if (current !== "") output.push("")
                current = match.path
                const count = byFile.get(match.path) ?? 0
                output.push(`${match.path} (${count} ${count === 1 ? "match" : "matches"}):`)
              }
              output.push(`  Line ${match.line}: ${match.text}`)
            }
          }

          if (truncated) {
            output.push("")
            output.push(
              `(Results truncated at ${limit} ${context > 0 ? "result lines" : "matches"}. Narrow with include/exclude/path or raise maxResults instead of repeating the search.)`,
            )
          }

          return {
            title: params.pattern,
            metadata: {
              matches,
              files: byFile.size,
              truncated,
              limit,
              mode,
            },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
