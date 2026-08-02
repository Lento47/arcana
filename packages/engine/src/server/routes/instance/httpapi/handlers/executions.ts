import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import {
  claimExecution,
  completeExecution,
  markUnknownAfterCrash,
  markUnknownAfterNetwork,
  type DistributedExecutionKey,
} from "@arcana/core/crypto/execution-ledger"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { ExecutionKeySchema } from "../groups/executions"
import { controlStateFor } from "./control-state"

export const executionHandlers = HttpApiBuilder.group(InstanceHttpApi, "executions", (handlers) =>
  Effect.gen(function* () {
    const resolveDirectory = Effect.fn("ExecutionHttpApi.resolveDirectory")(function* (
      queryDirectory?: string,
    ) {
      const routeDirectory = Option.getOrUndefined(
        (yield* Effect.serviceOption(WorkspaceRouteContext)).pipe(
          Option.map((ctx) => ctx.directory),
        ),
      )
      return routeDirectory || queryDirectory || process.cwd()
    })

    const claim = Effect.fn("ExecutionHttpApi.claim")(function* (ctx: {
      payload: {
        key: typeof ExecutionKeySchema.Type
        irreversible?: boolean
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return claimExecution(
        ctx.payload.key as unknown as DistributedExecutionKey,
        controlStateFor(directory).executionLedger,
        new Date(),
        { irreversible: ctx.payload.irreversible ?? false },
      )
    })

    const complete = Effect.fn("ExecutionHttpApi.complete")(function* (ctx: {
      params: { executionId: string }
      payload: { outcome: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      completeExecution(ctx.params.executionId, controlStateFor(directory).executionLedger, ctx.payload.outcome)
      return true
    })

    const unknown = Effect.fn("ExecutionHttpApi.unknown")(function* (ctx: {
      params: { executionId: string }
      payload: { reason: "CRASH" | "NETWORK" }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const ledger = controlStateFor(directory).executionLedger
      if (ctx.payload.reason === "CRASH") {
        markUnknownAfterCrash(ctx.params.executionId, ledger)
      } else {
        markUnknownAfterNetwork(ctx.params.executionId, ledger)
      }
      return true
    })

    return handlers
      .handle("claim", claim)
      .handle("complete", complete)
      .handle("unknown", unknown)
  }),
)
