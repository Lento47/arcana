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
      "Rust regex pattern. Write ONE strong pattern: alternation (a|b|c), groups, \\b boundaries, (?i) for case-insensitivity. No lookahead, lookbehind, or backreferences.",
  }),
  path: Schema.optional(Schema.String).annotate({
    description: "The directory or file to search in. Defaults to the current working directory.",
  }),
  include: Schema.optional(Schema.String).annotate({
    description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
  }),
  maxResults: Schema.optional(NonNegativeInt).annotate({
    description: `Maximum matching lines to return (default: ${DEFAULT_MAX_RESULTS}, max: ${HARD_MAX_RESULTS}). Narrow include/path or raise this instead of repeating the search.`,
  }),
  context: Schema.optional(NonNegativeInt).annotate({
    description:
      "Lines of context to show around each match (0-10, default 0). Context lines come back unmarked and count toward maxResults - one call can show the surrounding code without a separate read.",
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
        params: { pattern: string; path?: string; include?: string; maxResults?: number; context?: number },
        ctx: Tool.Context,
      ) =>
        Effect.gen(function* () {
          const limit = Math.min(Math.max(params.maxResults ?? DEFAULT_MAX_RESULTS, 1), HARD_MAX_RESULTS)
          const context = Math.min(Math.max(params.context ?? 0, 0), 10)
          const empty = {
            title: params.pattern,
            metadata: { matches: 0, truncated: false, limit },
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
            limit,
            ...(context > 0 ? { context } : {}),
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

          const matches = final.filter((row) => !row.context).length
          const output = [`Found ${matches} matches${truncated ? ` (limit ${limit} reached)` : ""}`]

          let current = ""
          for (const match of final) {
            if (current !== match.path) {
              if (current !== "") output.push("")
              current = match.path
              output.push(`${match.path}:`)
            }
            output.push(`  Line ${match.line}: ${match.text}`)
          }

          if (truncated) {
            output.push("")
            output.push(
              `(Results truncated at ${limit} ${context > 0 ? "result lines" : "matches"}. Narrow with include/path or raise maxResults instead of repeating the search.)`,
            )
          }

          return {
            title: params.pattern,
            metadata: {
              matches,
              truncated,
              limit,
            },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
