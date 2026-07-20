import { Account } from "@/account/account"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MCP } from "@/mcp"
import { Project } from "@/project/project"
import { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ToolRegistry } from "@/tool/registry"
import { Worktree } from "@/worktree"
import { Duration, Effect, Option } from "effect"
import open from "open"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  ConsoleSwitchPayload,
  SessionListQuery,
  ToolListQuery,
  WorktreeApiError,
} from "../groups/experimental"
import { bindAccessToken, proxyKeyPresent, writeLicenseCache, writeProxyKey } from "@/account/license-bind"

const DEFAULT_CONSOLE_URL = process.env.ARCANA_CONSOLE_URL?.trim() || "https://arcana.otnelhq.com"

function mapWorktreeError<A, R>(self: Effect.Effect<A, Worktree.Error, R>) {
  return self.pipe(
    Effect.mapError((error) => new WorktreeApiError({ name: error._tag, data: { message: error.message } })),
  )
}

export const experimentalHandlers = HttpApiBuilder.group(InstanceHttpApi, "experimental", (handlers) =>
  Effect.gen(function* () {
    const account = yield* Account.Service
    const agents = yield* Agent.Service
    const config = yield* Config.Service
    const mcp = yield* MCP.Service
    const project = yield* Project.Service
    const registry = yield* ToolRegistry.Service
    const worktreeSvc = yield* Worktree.Service
    const sessions = yield* Session.Service
    const background = yield* BackgroundJob.Service
    const flags = yield* RuntimeFlags.Service

    const getConsole = Effect.fn("ExperimentalHttpApi.console")(function* () {
      const [state, groups] = yield* Effect.all(
        [
          config.getConsoleState(),
          account.orgsByAccount().pipe(Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({})))),
        ],
        {
          concurrency: "unbounded",
        },
      )
      return {
        consoleManagedProviders: state.consoleManagedProviders,
        ...(state.activeOrgName ? { activeOrgName: state.activeOrgName } : {}),
        switchableOrgCount: groups.reduce((count, group) => count + group.orgs.length, 0),
      }
    })

    const listConsoleOrgs = Effect.fn("ExperimentalHttpApi.consoleOrgs")(function* () {
      const [groups, active] = yield* Effect.all(
        [
          account.orgsByAccount().pipe(Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({})))),
          account.active().pipe(Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({})))),
        ],
        {
          concurrency: "unbounded",
        },
      )
      const info = Option.getOrUndefined(active)
      return {
        orgs: groups.flatMap((group) =>
          group.orgs.map((org) => ({
            accountID: group.account.id,
            accountEmail: group.account.email,
            accountUrl: group.account.url,
            orgID: org.id,
            orgName: org.name,
            active: !!info && info.id === group.account.id && info.active_org_id === org.id,
          })),
        ),
      }
    })

    const switchConsole = Effect.fn("ExperimentalHttpApi.consoleSwitch")(function* (ctx: {
      payload: typeof ConsoleSwitchPayload.Type
    }) {
      yield* account
        .use(ctx.payload.accountID, Option.some(ctx.payload.orgID))
        .pipe(Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))))
      return true
    })

    const consoleLogin = Effect.fn("ExperimentalHttpApi.consoleLogin")(function* (ctx: {
      // SDK may omit the JSON body entirely when all fields are optional (see
      // ConsoleLoginRequest note). Treat nullish payload as {}.
      payload: { server?: string } | null | undefined
    }) {
      const server = ctx.payload?.server?.trim() || DEFAULT_CONSOLE_URL
      // Don't surface the upstream error message — it can leak the backend
      // host, error refs, and stack frames. The error middleware logs the
      // full cause server-side; the TUI only needs to know it failed.
      const login = yield* account.login(server).pipe(
        Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({}))),
      )
      return {
        code: login.code,
        user: login.user,
        url: login.url,
        server: login.server,
        expirySeconds: Duration.toSeconds(login.expiry),
        intervalSeconds: Duration.toSeconds(login.interval),
      }
    })

    const consoleLoginPoll = Effect.fn("ExperimentalHttpApi.consoleLoginPoll")(function* (ctx: {
      payload: { code: string; server: string }
    }) {
      const result = yield* account
        .poll({
          code: ctx.payload.code as never,
          user: "" as never,
          url: "",
          server: ctx.payload.server,
          expiry: Duration.seconds(60),
          interval: Duration.seconds(2),
        })
        .pipe(Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({}))))
      switch (result._tag) {
        case "PollPending":
          return { status: "pending" as const }
        case "PollSlow":
          return { status: "slow_down" as const }
        case "PollExpired":
          return { status: "expired" as const }
        case "PollDenied":
          return { status: "denied" as const }
        case "PollError":
          return { status: "denied" as const, error: String(result.cause) }
        case "PollSuccess":
          return {
            status: "success" as const,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            email: result.email,
          }
      }
    })

    const consoleLoginComplete = Effect.fn("ExperimentalHttpApi.consoleLoginComplete")(function* (ctx: {
      payload: { accessToken: string; server: string; email?: string }
    }) {
      const bind = yield* bindAccessToken(ctx.payload.accessToken, ctx.payload.email, ctx.payload.server)
      if (!bind.ok) {
        return { ok: false, error: bind.error }
      }
      writeProxyKey(bind.proxyKey)
      writeLicenseCache({ tier: bind.tier, source: "oauth-bind", server: ctx.payload.server })
      return { ok: true, proxyKey: bind.proxyKey, tier: bind.tier }
    })

    const consoleProxyKeyPresent = Effect.fn("ExperimentalHttpApi.consoleProxyKeyPresent")(function* () {
      return { present: proxyKeyPresent() }
    })

    // Open a URL in the OS default browser. Used by the TUI to launch the
    // device-code verification page without rendering a clickable link in
    // the terminal (which can mangle the `?code=` query and fail in
    // tmux/Warp/etc).
    const consoleOpenUrl = Effect.fn("ExperimentalHttpApi.consoleOpenUrl")(function* (ctx: {
      payload: { url: string }
    }) {
      const target = ctx.payload.url
      // Only allow http(s) URLs; reject anything that could spawn another
      // protocol handler (file://, javascript:, etc).
      if (!/^https?:\/\//i.test(target)) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      const ok = yield* Effect.tryPromise({
        try: () => open(target),
        catch: () => false as const,
      }).pipe(Effect.orElseSucceed(() => false as const))
      return { ok: ok !== false }
    })

    const tool = Effect.fn("ExperimentalHttpApi.tool")(function* (ctx: { query: typeof ToolListQuery.Type }) {
      const list = yield* registry.tools({
        providerID: ctx.query.provider,
        modelID: ctx.query.model,
        agent: yield* agents.defaultInfo(),
      })
      return list.map((item) => ({
        id: item.id,
        description: item.description,
        parameters: ToolJsonSchema.fromTool(item),
      }))
    })

    const toolIDs = Effect.fn("ExperimentalHttpApi.toolIDs")(function* () {
      return yield* registry.ids()
    })

    const worktree = Effect.fn("ExperimentalHttpApi.worktree")(function* () {
      const ctx = yield* InstanceState.context
      return yield* project.sandboxes(ctx.project.id)
    })

    const worktreeCreate = Effect.fn("ExperimentalHttpApi.worktreeCreate")(function* (ctx: {
      payload: typeof Worktree.CreateInput.Type | void
    }) {
      return yield* mapWorktreeError(worktreeSvc.create(ctx.payload ?? undefined))
    })

    const worktreeRemove = Effect.fn("ExperimentalHttpApi.worktreeRemove")(function* (input: {
      payload: Worktree.RemoveInput
    }) {
      const ctx = yield* InstanceState.context
      yield* mapWorktreeError(worktreeSvc.remove(input.payload))
      yield* project.removeSandbox(ctx.project.id, input.payload.directory)
      return true
    })

    const worktreeReset = Effect.fn("ExperimentalHttpApi.worktreeReset")(function* (ctx: {
      payload: Worktree.ResetInput
    }) {
      yield* mapWorktreeError(worktreeSvc.reset(ctx.payload))
      return true
    })

    const session = Effect.fn("ExperimentalHttpApi.session")(function* (ctx: { query: typeof SessionListQuery.Type }) {
      const limit = ctx.query.limit ?? 100
      const all = yield* sessions.listGlobal({
        directory: ctx.query.directory,
        roots: ctx.query.roots,
        start: ctx.query.start,
        cursor: ctx.query.cursor,
        search: ctx.query.search,
        limit: limit + 1,
        archived: ctx.query.archived,
      })
      const list = all.length > limit ? all.slice(0, limit) : all
      return HttpServerResponse.jsonUnsafe(list, {
        headers:
          all.length > limit && list.length > 0
            ? { "x-next-cursor": String(list[list.length - 1].time.updated) }
            : undefined,
      })
    })

    const sessionBackground = Effect.fn("ExperimentalHttpApi.sessionBackground")(function* (ctx: {
      params: { sessionID: SessionID }
    }) {
      if (!flags.experimentalBackgroundSubagents) return false
      const jobs = (yield* background.list()).filter(
        (job) =>
          job.type === "task" &&
          job.status === "running" &&
          job.metadata?.parentSessionId === ctx.params.sessionID &&
          job.metadata.background !== true,
      )
      const promoted = yield* Effect.forEach(jobs, (job) => background.promote(job.id), { concurrency: "unbounded" })
      return promoted.some((job) => job !== undefined)
    })

    const resource = Effect.fn("ExperimentalHttpApi.resource")(function* () {
      return yield* mcp.resources()
    })

    return handlers
      .handle("console", getConsole)
      .handle("consoleOrgs", listConsoleOrgs)
      .handle("consoleSwitch", switchConsole)
      .handle("consoleLogin", consoleLogin)
      .handle("consoleLoginPoll", consoleLoginPoll)
      .handle("consoleLoginComplete", consoleLoginComplete)
      .handle("consoleProxyKeyPresent", consoleProxyKeyPresent)
      .handle("consoleOpenUrl", consoleOpenUrl)
      .handle("tool", tool)
      .handle("toolIDs", toolIDs)
      .handle("worktree", worktree)
      .handle("worktreeCreate", worktreeCreate)
      .handle("worktreeRemove", worktreeRemove)
      .handle("worktreeReset", worktreeReset)
      .handle("session", session)
      .handle("sessionBackground", sessionBackground)
      .handle("resource", resource)
  }),
)
