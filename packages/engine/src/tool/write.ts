import { Schema } from "effect"
import * as path from "path"
import { Effect, Option } from "effect"
import * as Tool from "./tool"
import { LSP } from "@/lsp/lsp"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { EventV2Bridge } from "@/event-v2-bridge"
import { FileSystem } from "@arcana/core/filesystem"
import { Watcher } from "@arcana/core/filesystem/watcher"
import { Format } from "../format"
import { FSUtil } from "@arcana/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { trimDiff } from "./edit"
import { assertExternalDirectoryEffect } from "./external-directory"
import * as Bom from "@/util/bom"
import { isDependencyManifest } from "@/execution/install"
import { isWholesaleReplacement, guardWarning, resolveThresholds } from "./file-edit-guard"
import { computeMutationAnalysis, buildMutationAskPayload, cleanupBackup } from "./mutation-util"
import { RuntimeFlags } from "@/effect/runtime-flags"

const MAX_PROJECT_DIAGNOSTICS_FILES = 5

export const Parameters = Schema.Struct({
  content: Schema.String.annotate({ description: "The content to write to the file" }),
  filePath: Schema.String.annotate({
    description: "The absolute path to the file to write (must be absolute, not relative)",
  }),
})

export const WriteTool = Tool.define(
  "write",
  Effect.gen(function* () {
    const lsp = yield* LSP.Service
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const format = yield* Format.Service
    const flags = yield* RuntimeFlags.Service
    const thresholds = resolveThresholds(flags)

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { content: string; filePath: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const filepath = path.isAbsolute(params.filePath)
            ? params.filePath
            : path.join(instance.directory, params.filePath)
          yield* assertExternalDirectoryEffect(ctx, filepath)

          const exists = yield* fs.existsSafe(filepath)
          // Check repo drift: if the file existed before the session started and its
          // mtime is newer than the session start, an external process touched it.
          let stale = false
          if (exists) {
            const info = yield* fs.stat(filepath).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (info && info.type !== "Directory") {
              const mtimeMs = Option.getOrElse(info.mtime, () => new Date(0)).getTime()
              if (mtimeMs > instance.startedAt) {
                stale = true
              }
            }
          }

          const source = exists ? yield* Bom.readFile(fs, filepath) : { bom: false, text: "" }
          const next = Bom.split(params.content)
          const desiredBom = source.bom || next.bom
          const contentOld = source.text
          const contentNew = next.text

          const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))
          const relative = path.relative(instance.worktree, filepath)

          // ── File Edit Guard: analyse diff, enforce guardrails, route permission ──
          const analysis = yield* computeMutationAnalysis({
            instanceDirectory: instance.directory,
            filePath: filepath,
            relativePath: relative,
            oldContent: contentOld,
            newContent: contentNew,
            existingFile: exists,
            thresholds,
            isDependencyManifest: isDependencyManifest(filepath),
          })

          // Guard: if this is a wholesale replacement of an existing file,
          // require the operator to explicitly approve the full-file rewrite.
          if (isWholesaleReplacement(analysis.stats, exists, thresholds)) {
            yield* Effect.logWarning("file-edit-guard: wholesale replacement detected", {
              filepath,
              changeRatio: analysis.stats.changeRatio,
              totalChanged: analysis.stats.totalChanged,
              totalLines: analysis.stats.totalLines,
            })
          }

          yield* ctx.ask(buildMutationAskPayload(
            {
              instanceDirectory: instance.directory,
              filePath: filepath,
              relativePath: relative,
              oldContent: contentOld,
              newContent: contentNew,
              existingFile: exists,
              thresholds,
              isDependencyManifest: isDependencyManifest(filepath),
            },
            analysis,
            { diff, exists: exists, ...(stale ? { stale: true } : {}) },
          ))

          yield* fs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))
          // Clean up backup on success
          yield* Effect.promise(() => cleanupBackup(analysis.backupPath))
          if (yield* format.file(filepath)) {
            yield* Bom.syncFile(fs, filepath, desiredBom)
          }
          yield* events.publish(FileSystem.Event.Edited, { file: filepath })
          yield* events.publish(Watcher.Event.Updated, {
            file: filepath,
            event: exists ? "change" : "add",
          })

          let output = stale ? "[STALE] Wrote file successfully." : "Wrote file successfully."
          const warning = guardWarning(analysis.stats, analysis.guard)
          if (warning) output += `\n\n${warning}`
          yield* lsp.touchFile(filepath, "document")
          const diagnostics = yield* lsp.diagnostics()
          const normalizedFilepath = FSUtil.normalizePath(filepath)
          let projectDiagnosticsCount = 0
          for (const [file, issues] of Object.entries(diagnostics)) {
            const current = file === normalizedFilepath
            if (!current && projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
            const block = LSP.Diagnostic.report(current ? filepath : file, issues)
            if (!block) continue
            if (current) {
              output += `\n\nLSP errors detected in this file, please fix:\n${block}`
              continue
            }
            projectDiagnosticsCount++
            output += `\n\nLSP errors detected in other files:\n${block}`
          }

          return {
            title: path.relative(instance.worktree, filepath),
            metadata: {
              diagnostics,
              filepath,
              exists: exists,
              ...(stale ? { stale: true } : {}),
            },
            output,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
