import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@arcana/core/fs-util"
import { Ripgrep } from "@arcana/core/ripgrep"
import { assertExternalDirectoryEffect } from "./external-directory"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "Regex pattern to search for (Rust regex syntax)" }),
  path: Schema.optional(Schema.String).annotate({
    description: "Directory or file to search in. Defaults to current working directory.",
  }),
  include: Schema.optional(Schema.String).annotate({
    description: 'Glob filter for files to include (e.g. "*.ts", "*.{rs,go}")',
  }),
  maxResults: Schema.optional(Schema.Number).annotate({
    description: "Maximum matching lines to return (default: 200, max: 500)",
  }),
})

export const SearchTool = Tool.define(
  "search",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    return {
      description:
        "Deep content search using ripgrep across all files in a directory tree. " +
        "Supports regex patterns and file type filters. Always available regardless of goal state — " +
        "use for code exploration, log analysis, pattern matching, and answering questions " +
        "about the codebase even after your primary goal is complete.",
      parameters: Parameters,
      execute: (params: { pattern: string; path?: string; include?: string; maxResults?: number }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.pattern) throw new Error("pattern is required")
          const limit = Math.min(Math.max(1, params.maxResults ?? 200), 500)

          yield* ctx.ask({
            permission: "search",
            patterns: [params.pattern],
            always: ["*"],
            metadata: { pattern: params.pattern, path: params.path },
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

          const searchDir = FSUtil.resolve(requested)
          const cwd = (yield* fs.stat(searchDir).pipe(Effect.catch(() => Effect.succeed(undefined))))?.type === "Directory"
            ? searchDir
            : path.dirname(searchDir)

          const result = yield* ripgrep.grep({ cwd: searchDir, pattern: params.pattern, include: params.include, limit })
          if (result.length === 0) {
            return {
              title: params.pattern,
              output: `No matches for "${params.pattern}"`,
              metadata: { matches: 0, truncated: false },
            }
          }

          const lines = result.map(item => `${path.resolve(cwd, item.entry.path)}:${item.line}: ${item.text}`)
          const truncated = result.length >= limit

          const output = [
            `Found ${result.length} matching lines${truncated ? " (truncated)" : ""}:`,
            "",
            ...lines,
          ].join("\n")

          return {
            title: params.pattern,
            output,
            metadata: { matches: result.length, truncated },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
