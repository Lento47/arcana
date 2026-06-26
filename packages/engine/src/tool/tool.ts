import { PermissionV1 } from "@arcana/core/v1/permission"
import { Effect, Schema } from "effect"
import { SessionV1 } from "@arcana/core/v1/session"
import type { JSONSchema7 } from "@ai-sdk/provider"
import type { MessageV2 } from "../session/message-v2"
import type { Permission } from "../permission"
import type { SessionID, MessageID } from "../session/schema"
import * as Truncate from "./truncate"
import { Agent } from "@/agent/agent"
import { createEngineAction, type ArcanaActionKind } from "@/kernel"

interface Metadata {
  [key: string]: any
}

function safeKeys(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return []
  return Object.keys(input as Record<string, unknown>).slice(0, 20)
}

function summarizeToolInput(input: unknown): string {
  const keys = safeKeys(input)
  if (keys.length === 0) return typeof input
  return `keys:${keys.join(",")}`
}

function extractStringValues(input: unknown, keys: string[]): string[] {
  if (!input || typeof input !== "object") return []
  const record = input as Record<string, unknown>
  const out: string[] = []
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") out.push(value)
    if (Array.isArray(value)) out.push(...value.filter((item): item is string => typeof item === "string"))
  }
  return out
}

function inferToolActionKind(id: string): ArcanaActionKind {
  const name = id.toLowerCase().replaceAll("_", "").replaceAll("-", "")
  if (name.includes("bash") || name.includes("shell") || name.includes("terminal") || name.includes("exec")) return "shell"
  if (name.includes("write") || name.includes("edit") || name.includes("applypatch") || name.includes("patch")) return "file_write"
  if (name.includes("read") || name.includes("grep") || name.includes("glob") || name.includes("list") || name === "ls") return "file_read"
  if (name.includes("web") || name.includes("fetch") || name.includes("http") || name.includes("network")) return "network"
  if (name.includes("mcp")) return "mcp"
  return "tool"
}

function inferToolSecurity(id: string, input: unknown) {
  const actionKind = inferToolActionKind(id)
  const paths = extractStringValues(input, ["path", "file", "filename", "files", "target", "cwd"])
  const command = extractStringValues(input, ["command", "cmd", "script"])[0]
  const security = {
    paths,
    network_egress: actionKind === "network",
    modifies_dependencies: paths.some((path) => /(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|requirements\.txt|pyproject\.toml|cargo\.toml|go\.mod)$/i.test(path)),
  }
  return command ? { ...security, command } : security
}

// TODO: remove this hack
export type DynamicDescription = (agent: Agent.Info) => Effect.Effect<string>

/**
 * Raised when the LLM calls a tool with arguments that fail the parameter
 * schema. This is the canonical "rewrite the input" tool error: the typed
 * error class makes it matchable upstream, and its `message` getter produces
 * the model-facing prose that the AI SDK feeds back as the tool result.
 */
export class InvalidArgumentsError extends Schema.TaggedErrorClass<InvalidArgumentsError>()(
  "ToolInvalidArgumentsError",
  {
    tool: Schema.String,
    detail: Schema.String,
  },
) {
  override get message() {
    return `The ${this.tool} tool was called with invalid arguments: ${this.detail}.\nPlease rewrite the input so it satisfies the expected schema.`
  }
}

export type Context<M extends Metadata = Metadata> = {
  sessionID: SessionID
  messageID: MessageID
  agent: string
  abort: AbortSignal
  callID?: string
  extra?: { [key: string]: unknown }
  messages: SessionV1.WithParts[]
  metadata(input: { title?: string; metadata?: M }): Effect.Effect<void>
  ask(input: Omit<PermissionV1.Request, "id" | "sessionID" | "tool">): Effect.Effect<void>
}

export interface ExecuteResult<M extends Metadata = Metadata> {
  title: string
  metadata: M
  output: string
  attachments?: Omit<SessionV1.FilePart, "id" | "sessionID" | "messageID">[]
}

export interface Def<
  Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>,
  M extends Metadata = Metadata,
> {
  id: string
  description: string
  parameters: Parameters
  jsonSchema?: JSONSchema7
  execute(args: Schema.Schema.Type<Parameters>, ctx: Context): Effect.Effect<ExecuteResult<M>>
  formatValidationError?(error: unknown): string
}
export type DefWithoutID<
  Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>,
  M extends Metadata = Metadata,
> = Omit<Def<Parameters, M>, "id">

export interface Info<
  Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>,
  M extends Metadata = Metadata,
> {
  id: string
  init: () => Effect.Effect<DefWithoutID<Parameters, M>>
}

type Init<Parameters extends Schema.Decoder<unknown>, M extends Metadata> =
  | DefWithoutID<Parameters, M>
  | (() => Effect.Effect<DefWithoutID<Parameters, M>>)

export type InferParameters<T> =
  T extends Info<infer P, any>
    ? Schema.Schema.Type<P>
    : T extends Effect.Effect<Info<infer P, any>, any, any>
      ? Schema.Schema.Type<P>
      : never
export type InferMetadata<T> =
  T extends Info<any, infer M> ? M : T extends Effect.Effect<Info<any, infer M>, any, any> ? M : never

export type InferDef<T> =
  T extends Info<infer P, infer M>
    ? Def<P, M>
    : T extends Effect.Effect<Info<infer P, infer M>, any, any>
      ? Def<P, M>
      : never

function wrap<Parameters extends Schema.Decoder<unknown>, Result extends Metadata>(
  id: string,
  init: Init<Parameters, Result>,
  truncate: Truncate.Interface,
  agents: Agent.Interface,
) {
  return () =>
    Effect.gen(function* () {
      const toolInfo = typeof init === "function" ? { ...(yield* init()) } : { ...init }
      // Compile the parser closure once per tool init; `decodeUnknownEffect`
      // allocates a new closure per call, so hoisting avoids re-closing it for
      // every LLM tool invocation.
      const decode = Schema.decodeUnknownEffect(toolInfo.parameters)
      const execute = toolInfo.execute
      toolInfo.execute = (args, ctx) => {
        const kind = inferToolActionKind(id)
        const action = createEngineAction({
          id: ctx.callID ? `act_${ctx.callID}` : `act_${crypto.randomUUID()}`,
          session_id: ctx.sessionID,
          message_id: ctx.messageID,
          source: "builder",
          kind,
          name: id,
          input_summary: summarizeToolInput(args),
          security: inferToolSecurity(id, args),
        })
        const governedCtx: Context = {
          ...ctx,
          ask(input) {
            return ctx.ask({
              ...input,
              metadata: {
                ...input.metadata,
                engine_action: {
                  id: action.id,
                  kind: action.kind,
                  name: action.name,
                  risk: {
                    level: action.risk,
                    reasons: action.security_context.reasons,
                    required_controls: action.required_controls,
                  },
                  policy: action.policy,
                  reversible: action.reversible,
                  security_context: action.security_context,
                },
              },
            })
          },
        }
        const attrs = {
          "tool.name": id,
          "session.id": ctx.sessionID,
          "message.id": ctx.messageID,
          "engine.action.id": action.id,
          "engine.action.kind": action.kind,
          "engine.action.source": action.source,
          "engine.risk.level": action.risk,
          "engine.policy.action": action.policy,
          ...(ctx.callID ? { "tool.call_id": ctx.callID } : {}),
        }
        const execution = Effect.gen(function* () {
          yield* Effect.logInfo("engine.action.proposed", {
            actionID: action.id,
            sessionID: action.session_id,
            messageID: action.message_id,
            kind: action.kind,
            name: action.name,
            risk: action.risk,
            policy: action.policy,
          })
          const decoded = yield* decode(args).pipe(
            Effect.mapError(
              (error) =>
                new InvalidArgumentsError({
                  tool: id,
                  detail: toolInfo.formatValidationError ? toolInfo.formatValidationError(error) : String(error),
                }),
            ),
          )
          const result = yield* execute(decoded as Schema.Schema.Type<Parameters>, governedCtx)
          yield* Effect.logInfo("engine.action.completed", {
            actionID: action.id,
            sessionID: action.session_id,
            messageID: action.message_id,
            kind: action.kind,
            name: action.name,
          })
          if (result.metadata.truncated !== undefined) {
            return result
          }
          const agent = yield* agents.get(ctx.agent)
          const truncated = yield* truncate.output(result.output, {}, agent)
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
              ...(truncated.truncated && { outputPath: truncated.outputPath }),
            },
          }
        })
        return execution.pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logInfo("engine.action.failed", {
                actionID: action.id,
                sessionID: action.session_id,
                messageID: action.message_id,
                kind: action.kind,
                name: action.name,
                error: error instanceof Error ? error.message : String(error),
              })
              return yield* Effect.fail(error)
            }),
          ),
          Effect.orDie,
          Effect.withSpan("Tool.execute", { attributes: attrs }),
        )
      }
      return toolInfo
    })
}

export function define<
  Parameters extends Schema.Decoder<unknown>,
  Result extends Metadata,
  R,
  ID extends string = string,
>(
  id: ID,
  init: Effect.Effect<Init<Parameters, Result>, never, R>,
): Effect.Effect<Info<Parameters, Result>, never, R | Truncate.Service | Agent.Service> & { id: ID } {
  return Object.assign(
    Effect.gen(function* () {
      const resolved = yield* init
      const truncate = yield* Truncate.Service
      const agents = yield* Agent.Service
      return { id, init: wrap(id, resolved, truncate, agents) }
    }),
    { id },
  )
}

export function init<P extends Schema.Decoder<unknown>, M extends Metadata>(
  info: Info<P, M>,
): Effect.Effect<Def<P, M>> {
  return Effect.gen(function* () {
    const init = yield* info.init()
    return {
      ...init,
      id: info.id,
    }
  })
}

export * as Tool from "./tool"
