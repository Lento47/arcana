import { Context, Effect, Exit, Fiber } from "effect"
import { WorkspaceContext } from "@/control-plane/workspace-context"
import type { WorkspaceV2 } from "@arcana/core/workspace"
import type { InstanceContext } from "@/project/instance-context"
import { InstanceRef, WorkspaceRef } from "./instance-ref"
import { attachWith } from "./run-service"

export interface Shape {
  readonly promise: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>
  readonly fork: <A, E, R>(effect: Effect.Effect<A, E, R>) => Fiber.Fiber<A, E>
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>
  readonly bind: <Args extends readonly unknown[], Result>(fn: (...args: Args) => Result) => (...args: Args) => Result
}

function restoreWorkspace<R>(workspace: WorkspaceV2.ID | undefined, fn: () => R): R {
  if (workspace !== undefined) return WorkspaceContext.restore(workspace, fn)
  return fn()
}

function captureSync() {
  const fiber = Fiber.getCurrent()
  const instance = fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef) : undefined
  const workspace =
    (fiber ? Context.getReferenceUnsafe(fiber.context, WorkspaceRef) : undefined) ?? WorkspaceContext.workspaceID
  return { instance, workspace }
}

export const bind = <Args extends readonly unknown[], Result>(fn: (...args: Args) => Result) => {
  const captured = captureSync()
  return (...args: Args) =>
    restoreWorkspace(captured.workspace, () =>
      Effect.runSync(
        attachWith(
          Effect.sync(() => fn(...args)),
          captured,
        ),
      ),
    )
}

/**
 * Bridge from Effect into a Promise-returning JS callback while preserving
 * `WorkspaceContext` AsyncLocalStorage for callback code that still reads it.
 * `InstanceRef` is captured for effects run through the returned bridge APIs;
 * plain JS callbacks that need it should receive the ref explicitly.
 *
 * Mirrors `Effect.promise` but restores workspace ALS first.
 */
export const fromPromise = <T>(fn: () => Promise<T> | T): Effect.Effect<T> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRef
    return yield* Effect.promise(() => Promise.resolve(restoreWorkspace(workspace, () => fn())))
  })

export function make(input?: { instance?: InstanceContext; workspace?: WorkspaceV2.ID }): Effect.Effect<Shape> {
  return Effect.gen(function* () {
    const ctx = yield* Effect.context()
    const captured = captureSync()
    // Explicit override wins; then the current context; then the captured fiber
    // context. tools.ts passes a recovered instance (from the durable session
    // record) so tool execution never depends on the request-derived context
    // of the turn that started it — daemon re-registration drops that context.
    const instance = input?.instance ?? (yield* InstanceRef) ?? captured.instance
    const workspace = input?.workspace ?? (yield* WorkspaceRef) ?? captured.workspace
    const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      attachWith(effect.pipe(Effect.provide(ctx)) as Effect.Effect<A, E, never>, { instance, workspace })

    return {
      promise: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        restoreWorkspace(workspace, () => Effect.runPromise(wrap(effect))),
      fork: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        restoreWorkspace(workspace, () => Effect.runFork(wrap(effect))),
      run: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.callback<A, E>((resume) => {
          restoreWorkspace(workspace, () =>
            Effect.runPromiseExit(wrap(effect)).then((exit) =>
              resume(Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause)),
            ),
          )
        }),
      bind:
        <Args extends readonly unknown[], Result>(fn: (...args: Args) => Result) =>
        (...args: Args) =>
          restoreWorkspace(workspace, () => Effect.runSync(wrap(Effect.sync(() => fn(...args))))),
    } satisfies Shape
  })
}

export * as EffectBridge from "./bridge"
