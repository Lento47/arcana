import path from "path"
import { Effect, Schema } from "effect"
import { NonNegativeInt } from "@arcana/core/schema"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@arcana/core/fs-util"
import { Ripgrep } from "@arcana/core/ripgrep"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./glob.txt"
import * as Tool from "./tool"

export const DEFAULT_MAX_RESULTS = 10_000

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({
    description:
      'Glob pattern to match files against. Combine alternatives with braces: "**/*.{ts,tsx}", "src/**/*.{js,jsx}".',
  }),
  path: Schema.optional(Schema.String).annotate({
    description: `The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.`,
  }),
  maxResults: Schema.optional(NonNegativeInt).annotate({
    description: `Maximum file paths to return (default: ${DEFAULT_MAX_RESULTS}). Lower it to bound output; combine patterns with braces instead of repeating the call.`,
  }),
})

export const GlobTool = Tool.define(
  "glob",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { pattern: string; path?: string; maxResults?: number }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const ins = yield* InstanceState.context
          yield* ctx.ask({
            permission: "glob",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
            },
          })

          let search = params.path ?? ins.directory
          search = path.isAbsolute(search) ? search : path.resolve(ins.directory, search)
          const info = yield* fs.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (info?.type === "File") {
            throw new Error(`glob path must be a directory: ${search}`)
          }
          yield* assertExternalDirectoryEffect(ctx, search, {
            bypass: false,
            kind: "directory",
          })

          const limit = Math.min(Math.max(params.maxResults ?? DEFAULT_MAX_RESULTS, 1), DEFAULT_MAX_RESULTS)
          const files = yield* ripgrep.glob({ cwd: search, pattern: params.pattern, limit })
          const truncated = files.length === limit

          const output = []
          if (files.length === 0) output.push("No files found")
          if (files.length > 0) {
            output.push(...files.map((file) => path.resolve(search, file.path)))
            if (truncated) {
              output.push("")
              output.push(
                `(Results truncated at ${limit} paths. Narrow with path or combine patterns with braces, e.g. "**/*.{ts,tsx}".)`,
              )
            }
          }

          return {
            title: path.relative(ins.worktree, search),
            metadata: {
              count: files.length,
              truncated,
            },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
