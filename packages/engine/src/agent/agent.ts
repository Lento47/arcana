import { LayerNode } from "@arcana/core/effect/layer-node"
import { PermissionV1 } from "@arcana/core/v1/permission"
import { Config } from "@/config/config"
import { serviceUse } from "@arcana/core/effect/service-use"
import { Provider } from "@/provider/provider"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import PROMPT_BUILD from "./prompt/build.txt"
import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import PROMPT_CLIENT from "./prompt/client.txt"
import PROMPT_REVIEWER from "./prompt/reviewer.txt"
import PROMPT_ARCHITECT from "./prompt/architect.txt"
import PROMPT_TESTER from "./prompt/tester.txt"
import PROMPT_QA from "./prompt/qa.txt"
import PROMPT_ANTI_AI_SLOP from "./prompt/anti-ai-slop.txt"
import { Permission } from "@/permission"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@arcana/core/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { loadExternalAgents } from "./sdk"
import { FSUtil } from "@arcana/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@arcana/core/schema"
import { ProviderV2 } from "@arcana/core/provider"
import { ModelV2 } from "@arcana/core/model"
import { LocationServiceMap } from "@arcana/core/location-layer"
import { PluginBoot } from "@arcana/core/plugin/boot"
import { Reference } from "@arcana/core/reference"
import { Location } from "@arcana/core/location"

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  permission: PermissionV1.Ruleset,
  model: Schema.optional(
    Schema.Struct({
      modelID: ModelV2.ID,
      providerID: ProviderV2.ID,
    }),
  ),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Unknown),
  steps: Schema.optional(Schema.Finite),
  routing: Schema.optional(Schema.Struct({
    keywords: Schema.optional(Schema.Array(Schema.String)),
    patterns: Schema.optional(Schema.Array(Schema.String)),
    capabilities: Schema.optional(Schema.Array(Schema.String)),
    priority: Schema.optional(Schema.Number),
    confidence: Schema.optional(Schema.Number),
  })),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  }) => Effect.Effect<
    {
      identifier: string
      whenToUse: string
      systemPrompt: string
    },
    Provider.DefaultModelError
  >
}

type State = Omit<Interface, "generate">

export class Service extends Context.Service<Service, Interface>()("@arcana/Agent") {}

export const use = serviceUse(Service)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service
    const locations = yield* LocationServiceMap
    // User-authored agent modules are global (loaded from <config>/agents), so
    // resolve them once here rather than per-directory inside the state builder.
    const external = yield* loadExternalAgents().pipe(Effect.catch(() => Effect.succeed([])))

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        const referenceDirs = yield* Effect.gen(function* () {
          yield* (yield* PluginBoot.Service).wait()
          return (yield* (yield* Reference.Service).list()).map((reference) => reference.path)
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
        const whitelistedDirs = [
          Truncate.GLOB,
          path.join(Global.Path.tmp, "*"),
          ...skillDirs.map((dir) => path.join(dir, "*")),
          ...referenceDirs.map((dir) => path.join(dir, "*")),
        ]
        const readonlyExternalDirectory = {
          "*": "ask",
          ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
        } satisfies Record<string, "allow" | "ask" | "deny">

        // ARC-SEC-I01: shell is ask-by-default (not covered by the "*" allow).
        // Users who want silent shell can set permission.bash = "allow" in config.
        const baseDefaults = Permission.fromConfig({
          "*": "allow",
          bash: "ask",
          mcp: "ask",
          webfetch: "ask",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
          edit: {
            "*": "allow",
            "package.json": "ask",
            "**/package.json": "ask",
            "package-lock.json": "ask",
            "**/package-lock.json": "ask",
            "pnpm-lock.yaml": "ask",
            "**/pnpm-lock.yaml": "ask",
            "yarn.lock": "ask",
            "**/yarn.lock": "ask",
            "bun.lock": "ask",
            "**/bun.lock": "ask",
            "bun.lockb": "ask",
            "**/bun.lockb": "ask",
            "requirements.txt": "ask",
            "**/requirements.txt": "ask",
            "pyproject.toml": "ask",
            "**/pyproject.toml": "ask",
            "poetry.lock": "ask",
            "**/poetry.lock": "ask",
            "Cargo.toml": "ask",
            "**/Cargo.toml": "ask",
            "Cargo.lock": "ask",
            "**/Cargo.lock": "ask",
            "go.mod": "ask",
            "**/go.mod": "ask",
            "go.sum": "ask",
            "**/go.sum": "ask",
            "composer.json": "ask",
            "**/composer.json": "ask",
            "Gemfile": "ask",
            "**/Gemfile": "ask",
          },
          // ARC-SEC-I04: self-awareness permission. Allows the model to read/write
          // its own memory, session metadata, and arcana config under .arcana/,
          // ~/.arcana/, ~/.config/arcana/, and explicit memory files. Permission
          // policy files are denied so the model cannot widen its own access.
          self_awareness: {
            "*.memory.md": "allow",
            ".arcana/**": "allow",
            ".opencode/**": "allow",
            "$HOME/.arcana/**": "allow",
            "$HOME/.config/arcana/**": "allow",
            "$HOME/.opencode/**": "allow",
            // Deny permission-policy files explicitly so they are not auto-allowed.
            ".arcana/permission*": "deny",
            ".arcana/permissions*": "deny",
            ".opencode/permission*": "deny",
            ".opencode/permissions*": "deny",
            "$HOME/.arcana/permission*": "deny",
            "$HOME/.arcana/permissions*": "deny",
            "$HOME/.config/arcana/permission*": "deny",
            "$HOME/.config/arcana/permissions*": "deny",
            "$HOME/.opencode/permission*": "deny",
            "$HOME/.opencode/permissions*": "deny",
          },
        })

        // ARC-SEC-I03: HOME-protection floor. Deny sensitive HOME directories and
        // gate generic HOME access, while keeping arcana's own config/data dirs
        // accessible. This is merged after agent profiles so an agent's broad
        // "bash: allow" or "external_directory: ask" cannot silently remove it.
        const homeProtection = Permission.fromConfig({
          bash: {
            "*~/.ssh*": "deny",
            "*$HOME/.ssh*": "deny",
            "*~/.gnupg*": "deny",
            "*$HOME/.gnupg*": "deny",
            "*~/.aws*": "deny",
            "*$HOME/.aws*": "deny",
            "*~/.kube*": "deny",
            "*$HOME/.kube*": "deny",
            "*~/.docker*": "deny",
            "*$HOME/.docker*": "deny",
          },
          external_directory: {
            "$HOME/.arcana/**": "allow",
            "$HOME/.config/arcana/**": "allow",
            "$HOME/.opencode/**": "allow",
            "$HOME/.ssh/**": "deny",
            "$HOME/.gnupg/**": "deny",
            "$HOME/.aws/**": "deny",
            "$HOME/.kube/**": "deny",
            "$HOME/.docker/**": "deny",
          },
        })

        const defaults = Permission.merge(baseDefaults, homeProtection)
        const user = Permission.fromConfig(cfg.permission ?? {})

        function agentPermission(overrides: Parameters<typeof Permission.fromConfig>[0]) {
          return Permission.merge(defaults, Permission.fromConfig(overrides), homeProtection, user)
        }

        const agents: Record<string, Info> = {
          build: {
            name: "build",
            description:
              "The default agent. Executes tools based on configured permissions. " +
              "Use the `task` tool to delegate complex or subdirectory-local work to `general` " +
              "subagents when a task has many steps (>10 tool calls) or touches independent files. " +
              "Use the `workflow` tool for multi-step tasks with parallel steps or conditional branching. " +
              "Each subagent has its own step budget, so delegating spreads work across multiple agents " +
              "instead of exhausting this agent's step limit.",
            prompt: PROMPT_BUILD,
            options: {},
            permission: agentPermission({
              question: "allow",
              plan_enter: "allow",
            }),
            mode: "primary",
            native: true,
            steps: 50,
          },
          plan: {
            name: "plan",
            description: "Plan mode. Disallows all edit tools.",
            steps: 25,
            options: {},
            permission: agentPermission({
              question: "allow",
              plan_exit: "allow",
              task: {
                general: "deny",
              },
              external_directory: {
                [path.join(Global.Path.data, "plans", "*")]: "allow",
              },
              edit: {
                "*": "deny",
                [path.join(".opencode", "plans", "*.md")]: "allow",
                [path.relative(ctx.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
              },
            }),
            mode: "primary",
            native: true,
          },
          general: {
            name: "general",
            description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
            permission: agentPermission({
              todowrite: "deny",
            }),
            options: {},
            mode: "subagent",
            native: true,
            steps: 20,
            routing: {
              keywords: ["implement","refactor","debug","fix","create","write","test","change","build","subagents","subagent","parallel","delegate","split"],
              capabilities: ["code","review","implement","debug","test"],
              priority: 1,
            },
          },
          explore: {
            name: "explore",
            permission: agentPermission({
              "*": "deny",
              grep: "allow",
              glob: "allow",
              list: "allow",
              bash: "allow",
              webfetch: "allow",
              websearch: "allow",
              read: "allow",
              external_directory: readonlyExternalDirectory,
            }),
            description: `Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.`,
            prompt: PROMPT_EXPLORE,
            options: {},
            mode: "subagent",
            native: true,
            steps: 15,
            routing: {
              keywords: ["search","find","look up","where is","locate","discover","explore","investigate","research"],
              capabilities: ["file_search","research","read"],
            },
          },
          compaction: {
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: PROMPT_COMPACTION,
            permission: agentPermission({
              "*": "deny",
            }),
            options: {},
          },
          title: {
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: agentPermission({
              "*": "deny",
            }),
            prompt: PROMPT_TITLE,
          },
          summary: {
            name: "summary",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            permission: agentPermission({
              "*": "deny",
            }),
            prompt: PROMPT_SUMMARY,
          },
          client: {
            name: "client",
            description:
              "Project inception agent — helps define the project contract: requirements, tech choices, components, and constraints before any code is written.",
            options: {},
            permission: agentPermission({
              question: "allow",
              edit: {
                "*": "deny",
                "*.md": "allow",
                "*.json": "allow",
                "*.jsonc": "allow",
                "*.yaml": "allow",
                "*.yml": "allow",
                ".opencode/**": "allow",
                ".vault/**": "allow",
              },
              write: {
                "*": "deny",
                "*.md": "allow",
                "*.json": "allow",
                "*.jsonc": "allow",
                "*.yaml": "allow",
                "*.yml": "allow",
                ".opencode/**": "allow",
                ".vault/**": "allow",
              },
            }),
            mode: "all",
            native: true,
            steps: 25,
            color: "#3B82F6",
            prompt: PROMPT_CLIENT,
          },
          reviewer: {
            name: "reviewer",
            description:
              "Code review specialist — analyzes code quality, security, and architecture without modifying any files.",
            options: {},
            permission: agentPermission({
              question: "allow",
              edit: "deny",
              write: "deny",
              apply_patch: "deny",
            }),
            mode: "all",
            native: true,
            steps: 15,
            color: "#10B981",
            prompt: PROMPT_REVIEWER,
          },
          architect: {
            name: "architect",
            description:
              "Software architect — designs system structure, writes ADRs, maps component boundaries, and ensures architectural consistency.",
            options: {},
            permission: agentPermission({
              question: "allow",
              edit: {
                "*": "deny",
                "*.md": "allow",
                ".opencode/**": "allow",
              },
              write: {
                "*": "deny",
                "*.md": "allow",
                ".opencode/**": "allow",
              },
            }),
            mode: "all",
            native: true,
            steps: 25,
            color: "#8B5CF6",
            prompt: PROMPT_ARCHITECT,
          },
          tester: {
            name: "tester",
            description:
              "Test specialist — writes and runs tests. Never modifies source code.",
            options: {},
            permission: agentPermission({
              question: "allow",
              edit: {
                "*": "deny",
                "**/*.test.*": "allow",
                "**/*.spec.*": "allow",
                "**/*.test-d.*": "allow",
                "**/test/**": "allow",
                "**/tests/**": "allow",
                "**/__tests__/**": "allow",
              },
              write: {
                "*": "deny",
                "**/*.test.*": "allow",
                "**/*.spec.*": "allow",
                "**/*.test-d.*": "allow",
                "**/test/**": "allow",
                "**/tests/**": "allow",
                "**/__tests__/**": "allow",
              },
            }),
            mode: "all",
            native: true,
            steps: 30,
            color: "#F59E0B",
            prompt: PROMPT_TESTER,
          },
          qa: {
            name: "qa",
            description:
              "Quality assurance — finds bugs, edge cases, and regression risks. Reports issues, never fixes them.",
            options: {},
            permission: agentPermission({
              question: "allow",
              edit: "deny",
              write: "deny",
              apply_patch: "deny",
            }),
            mode: "subagent",
            native: true,
            steps: 15,
            color: "#EF4444",
            prompt: PROMPT_QA,
            routing: {
              keywords: ["bug", "edge case", "regression", "quality assurance", "qa", "defect", "bug hunt"],
              capabilities: ["quality_assurance", "bug_detection"],
              priority: 1,
            },
          },
          "anti-ai-slop": {
            name: "anti-ai-slop",
            description:
              "Code quality gate — detects AI-generated anti-patterns, overengineering, and low-quality code.",
            options: {},
            permission: agentPermission({
              edit: "deny",
              write: "deny",
              apply_patch: "deny",
            }),
            mode: "subagent",
            native: true,
            steps: 15,
            color: "#EC4899",
            prompt: PROMPT_ANTI_AI_SLOP,
            routing: {
              keywords: ["anti-slop", "ai slop", "overengineering", "code quality gate", "anti-pattern"],
              capabilities: ["code_review", "quality_assurance"],
              priority: 1,
            },
          },
        }

        for (const [key, value] of Object.entries(cfg.agent ?? {})) {
          if (value.disable) {
            delete agents[key]
            continue
          }
          let item = agents[key]
          if (!item)
            item = agents[key] = {
              name: key,
              mode: "all",
              permission: Permission.merge(defaults, user),
              options: {},
              native: false,
            }
          if (value.model) item.model = Provider.parseModel(value.model)
          item.variant = value.variant ?? item.variant
          item.prompt = value.prompt ?? item.prompt
          item.description = value.description ?? item.description
          item.temperature = value.temperature ?? item.temperature
          item.topP = value.top_p ?? item.topP
          item.mode = value.mode ?? item.mode
          item.color = value.color ?? item.color
          item.hidden = value.hidden ?? item.hidden
          item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          item.options = mergeDeep(item.options, value.options ?? {})
          item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
        }

        // Ensure Truncate.GLOB is allowed unless explicitly configured
        for (const name in agents) {
          const agent = agents[name]
          const explicitlyDenied = agent.permission.some(
            (r) =>
              r.permission === "external_directory"
              && r.action === "deny"
              && r.pattern === Truncate.GLOB,
          )
          if (explicitlyDenied) continue

          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
        }

        // Merge user-authored agent modules (<config>/agents/*.ts). They never
        // override a built-in or config agent of the same name.
        for (const mod of external) {
          if (agents[mod.name]) continue
          let allowed: ReturnType<typeof Permission.fromConfig> | undefined
          if (mod.permissions && mod.permissions.length > 0) {
            const allowConfig: Record<string, "allow"> = {}
            for (const p of mod.permissions) allowConfig[p] = "allow"
            allowed = Permission.fromConfig(allowConfig)
          }
          agents[mod.name] = {
            name: mod.name,
            description: mod.description,
            prompt: mod.prompt,
            color: mod.color,
            mode: "subagent",
            native: false,
            options: {},
            model: mod.model
              ? { modelID: ModelV2.ID.make(mod.model.modelID), providerID: ProviderV2.ID.make(mod.model.providerID) }
              : undefined,
            routing: mod.routing as Info["routing"],
            permission: allowed
              ? Permission.merge(defaults, allowed, homeProtection, user)
              : Permission.merge(defaults, homeProtection, user),
          }
        }

        const get = Effect.fnUntraced(function* (agent: string) {
          return agents[agent]
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          return pipe(
            agents,
            values(),
            sortBy(
              [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],
              [(x) => x.name, "asc"],
            ),
          )
        })

        const defaultInfo = Effect.fnUntraced(function* () {
          const c = yield* config.get()
          if (c.default_agent) {
            const agent = agents[c.default_agent]
            if (!agent) throw new Error(`default agent "${c.default_agent}" not found`)
            if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
            if (agent.hidden === true) throw new Error(`default agent "${c.default_agent}" is hidden`)
            return agent
          }
          const visible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
          if (!visible) throw new Error("no primary visible agent found")
          return visible
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          return (yield* defaultInfo()).name
        })

        return {
          get,
          list,
          defaultInfo,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultInfo: Effect.fn("Agent.defaultInfo")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultInfo())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)
        const tracer = cfg.experimental?.openTelemetry
          ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
          : undefined

        const system = [PROMPT_GENERATE]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            tracer,
            metadata: {
              userId: cfg.username ?? "unknown",
            },
          },
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: Object.assign(
            Schema.toStandardSchemaV1(GeneratedAgent),
            Schema.toStandardJSONSchemaV1(GeneratedAgent),
          ),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Skill.defaultLayer),
  Layer.provide(LocationServiceMap.layer),
  Layer.provide(FSUtil.defaultLayer),
)

const locationServiceMapNode = LayerNode.make(LocationServiceMap.layer, [])

export const node = LayerNode.make(layer, [
  Config.node,
  Auth.node,
  Plugin.node,
  Skill.node,
  Provider.node,
  locationServiceMapNode,
  FSUtil.node,
])

export * as Agent from "./agent"
