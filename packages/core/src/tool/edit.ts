/**
 * Model-facing V2 exact-edit leaf. Relative paths resolve within the active
 * Location. Absolute paths inside that Location are accepted, while explicit
 * absolute external paths retain mutation capability through a separate
 * external_directory approval before edit approval.
 */
export * as EditTool from "./edit"

import { ToolFailure } from "@arcana/llm"
import { Effect, Layer, Schema } from "effect"
import { FileMutation } from "../file-mutation"
import { FSUtil } from "../fs-util"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "edit"

export const Input = Schema.Struct({
  path: Schema.String.annotate({
    description:
      "File path to edit. Relative paths resolve within the active Location. Absolute paths inside that Location are accepted; external absolute paths require external_directory approval.",
  }),
  oldString: Schema.String.annotate({ description: "Exact text to replace" }),
  newString: Schema.String.annotate({ description: "Replacement text, which must differ from oldString" }),
  replaceAll: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Replace all exact occurrences of oldString (default false)",
  }),
})

export const Output = Schema.Struct({
  operation: Schema.Literal("write"),
  target: Schema.String,
  resource: Schema.String,
  existed: Schema.Boolean,
  replacements: Schema.Number,
})
export type Output = typeof Output.Type

const normalizeLineEndings = (text: string) => text.replaceAll("\r\n", "\n")
const detectLineEnding = (text: string): "\n" | "\r\n" => (text.includes("\r\n") ? "\r\n" : "\n")
const convertToLineEnding = (text: string, ending: "\n" | "\r\n") =>
  ending === "\n" ? normalizeLineEndings(text) : normalizeLineEndings(text).replaceAll("\n", "\r\n")

const splitBom = (text: string) =>
  text.startsWith("\uFEFF") ? { bom: true, text: text.slice(1) } : { bom: false, text }
const joinBom = (text: string, bom: boolean) => (bom ? `\uFEFF${text}` : text)
const decodeUtf8 = (content: Uint8Array) => {
  const bom = content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf
  return { bom, content, text: new TextDecoder().decode(bom ? content.slice(3) : content) }
}

const countOccurrences = (content: string, search: string) => {
  if (search === "") return content.length + 1
  let count = 0
  let offset = 0
  while ((offset = content.indexOf(search, offset)) !== -1) {
    count++
    offset += search.length
  }
  return count
}

/** Strip trailing whitespace from each line (common model output defect). */
const trimTrailingWhitespace = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")

/** Normalize leading whitespace: convert tabs to spaces using the file's detected indentation width. */
const normalizeIndentation = (text: string, indentWidth: number) =>
  text
    .split("\n")
    .map((line) => {
      const leading = line.match(/^[ \t]*/)?.[0] ?? ""
      const rest = line.slice(leading.length)
      const spaces = leading.replace(/\t/g, " ".repeat(indentWidth))
      return spaces + rest
    })
    .join("\n")

/** Fuzzy match strategies applied in order when exact match fails. */
type FuzzyResult = { oldString: string; newString: string; strategy: string } | undefined

const tryFuzzyMatch = (source: string, oldString: string, newString: string): FuzzyResult => {
  // Strategy 1: strip trailing whitespace from each line of oldString
  const trimmed = trimTrailingWhitespace(oldString)
  if (trimmed !== oldString && countOccurrences(source, trimmed) > 0) {
    return { oldString: trimmed, newString: trimTrailingWhitespace(newString), strategy: "trailing-whitespace" }
  }

  // Strategy 2: normalize indentation (guess indent from source file)
  const indentMatch = source.match(/^[ \t]+/m)
  const indentWidth = indentMatch ? (indentMatch[0].includes("\t") ? 4 : indentMatch[0].length) : 2
  const normalizedSource = normalizeIndentation(source, indentWidth)
  const normalizedOld = normalizeIndentation(oldString, indentWidth)
  if (normalizedOld !== oldString && countOccurrences(normalizedSource, normalizedOld) > 0) {
    return { oldString: normalizedOld, newString: normalizeIndentation(newString, indentWidth), strategy: "indentation" }
  }

  return undefined
}

const previewLines = (value: string, prefix: "+" | "-") => {
  const lines = normalizeLineEndings(value).split("\n")
  const shown = lines.slice(0, 6).map((line) => `${prefix}${line.length > 240 ? `${line.slice(0, 240)}...` : line}`)
  if (lines.length > shown.length) shown.push(`${prefix}...`)
  return shown
}

/** Build a fuzzy-correction hint for the model when exact match failed. */
const fuzzyHint = (source: string, oldString: string): string => {
  const trimmed = trimTrailingWhitespace(oldString)
  const hints: string[] = []
  if (trimmed !== oldString) hints.push("strip trailing whitespace from each line")
  const indentMatch = source.match(/^[ \t]+/m)
  if (indentMatch) hints.push(`use ${indentMatch[0].includes("\t") ? "tabs" : `${indentMatch[0].length} spaces`} for indentation`)
  return hints.length ? ` (try: ${hints.join("; ")})` : ""
}

export const toModelOutput = (output: Output, oldString: string, newString: string) =>
  [
    `Edited file successfully: ${output.resource}`,
    `Replacements: ${output.replacements}`,
    "```diff",
    ...previewLines(oldString, "-"),
    ...previewLines(newString, "+"),
    "```",
  ].join("\n")

/** Deferred V2 edit behavior and UX integrations remain visible at the model-facing seam. */
// TODO: Port V1 fuzzy correction strategies only after exact-edit behavior is established: line-trimmed matching, block-anchor fallback, indentation correction, and similarity-threshold review.
// TODO: Add formatter integration after V2 formatter runtime exists.
// TODO: Publish watcher/file-edit events after V2 watcher integration exists.
// TODO: Add snapshots / undo after design exists.
// TODO: Add LSP notification and diagnostics after V2 LSP runtime exists.

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const mutation = yield* LocationMutation.Service
    const files = yield* FileMutation.Service
    const fs = yield* FSUtil.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.withPermission(
          Tool.make({
            description:
              "Replace exact text in one file. Relative paths resolve within the active Location. Absolute paths inside the Location are accepted. Explicit external absolute paths require external_directory approval before edit approval.",
            input: Input,
            output: Output,
            toModelOutput: ({ input, output }) => [
              { type: "text", text: toModelOutput(output, input.oldString, input.newString) },
            ],
            execute: (input, context) => {
              const unableToEdit = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
                effect.pipe(
                  Effect.mapError((error) =>
                    error instanceof FileMutation.StaleContentError
                      ? new ToolFailure({
                          message: "File changed after permission approval. Read it again before editing.",
                        })
                      : new ToolFailure({ message: `Unable to edit ${input.path}` }),
                  ),
                )

              return Effect.gen(function* () {
                const permissionSource = {
                  type: "tool" as const,
                  messageID: context.assistantMessageID,
                  callID: context.toolCallID,
                }
                if (input.oldString === input.newString) {
                  return yield* new ToolFailure({
                    message: "No changes to apply: oldString and newString are identical.",
                  })
                }
                if (input.oldString === "") {
                  return yield* new ToolFailure({
                    message: "oldString must not be empty. Use write to create or overwrite a file.",
                  })
                }

                const target = yield* unableToEdit(mutation.resolve({ path: input.path, kind: "file" }))
                const external = target.externalDirectory
                if (external) {
                  yield* unableToEdit(
                    permission.assert({
                      ...LocationMutation.externalDirectoryPermission(external),
                      sessionID: context.sessionID,
                      agent: context.agent,
                      source: permissionSource,
                    }),
                  )
                }

                yield* unableToEdit(
                  permission.assert({
                    action: "edit",
                    resources: [target.resource],
                    save: ["*"],
                    sessionID: context.sessionID,
                    agent: context.agent,
                    source: permissionSource,
                  }),
                )
                const source = decodeUtf8(yield* unableToEdit(fs.readFile(target.canonical)))
                const ending = detectLineEnding(source.text)
                const oldString = convertToLineEnding(input.oldString, ending)
                const newString = convertToLineEnding(input.newString, ending)
                let effectiveOld = oldString
                let effectiveNew = newString
                let replacements = countOccurrences(source.text, oldString)
                // V1 fuzzy correction: try line-trimmed & indentation-normalized matching
                // when exact match fails before giving up.
                let fuzzy: FuzzyResult
                if (replacements === 0) {
                  fuzzy = tryFuzzyMatch(source.text, oldString, newString)
                  if (fuzzy) {
                    effectiveOld = fuzzy.oldString
                    effectiveNew = fuzzy.newString
                    replacements = countOccurrences(source.text, effectiveOld)
                  }
                  if (replacements === 0) {
                    return yield* new ToolFailure({
                      message:
                        "Could not find oldString in the file. It must match exactly, including whitespace and indentation." +
                        fuzzyHint(source.text, oldString),
                    })
                  }
                }
                if (replacements > 1 && input.replaceAll !== true) {
                  return yield* new ToolFailure({
                    message:
                      "Found multiple exact matches for oldString. Provide more surrounding context or set replaceAll to true.",
                  })
                }

                const replaced =
                  input.replaceAll === true
                    ? source.text.replaceAll(effectiveOld, effectiveNew)
                    : source.text.replace(effectiveOld, effectiveNew)
                const next = splitBom(replaced)
                const result = yield* unableToEdit(
                  files.writeIfUnchanged({
                    target,
                    expected: source.content,
                    content: joinBom(next.text, source.bom || next.bom),
                  }),
                )
                return { ...result, replacements } satisfies Output
              })
            },
          }),
          "edit",
        ),
      })
      .pipe(Effect.orDie)
  }),
)
