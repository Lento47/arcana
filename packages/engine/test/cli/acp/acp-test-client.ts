import { expect } from "bun:test"
import type { SessionConfigOption, SessionConfigSelectOption } from "@agentclientprotocol/sdk"
import { Duration, Effect } from "effect"
import type { AcpHandle } from "../../lib/cli-process"

type JsonRpcRequest = {
  readonly jsonrpc: "2.0"
  readonly id: number
  readonly method: string
  readonly params?: unknown
}

type JsonRpcResponse<T = unknown> = {
  readonly jsonrpc: "2.0"
  readonly id: number
  readonly result?: T
  readonly error?: unknown
}

type JsonRpcNotification<T = unknown> = {
  readonly jsonrpc: "2.0"
  readonly method: string
  readonly params?: T
}

const isServerRequest = (value: unknown): value is JsonRpcRequest => {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return typeof record.method === "string" && typeof record.id === "number" && record.jsonrpc === "2.0"
}

export type AcpClient = {
  readonly request: <T>(method: string, params?: unknown) => Effect.Effect<JsonRpcResponse<T>, unknown>
  readonly receive: Effect.Effect<unknown>
  readonly waitForNotification: <T>(
    method: string,
    predicate: (params: T) => boolean,
    timeoutMs?: number,
  ) => Effect.Effect<JsonRpcNotification<T>, unknown>
}

export function createAcpClient(acp: AcpHandle): AcpClient {
  const state = { nextId: 1 }

  // Server-initiated requests (e.g. session/request_permission) must be
  // answered or the engine's prompt loop blocks forever. Auto-approve once,
  // which is what a permissive host would do for a smoke test.
  const answerServerRequest = (received: JsonRpcRequest) =>
    received.method === "session/request_permission"
      ? acp.send({
          jsonrpc: "2.0",
          id: received.id,
          result: { outcome: { outcome: "selected", optionId: "once" } },
        })
      : Effect.void

  const request = <T>(method: string, params?: unknown) =>
    Effect.gen(function* () {
      const id = state.nextId++
      const message: JsonRpcRequest =
        params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params }
      yield* acp.send(message)

      while (true) {
        const received = yield* acp.receive.pipe(
          Effect.timeoutOrElse({
            duration: Duration.seconds(15),
            orElse: () =>
              Effect.fail(
                new Error(
                  `timed out waiting for JSON-RPC response to ${method}\n` +
                    `child stderr (last 4000):\n${acp.stderr()}`,
                ),
              ),
          }),
        )
        if (isJsonRpcResponse<T>(received) && received.id === id) return received
        if (isServerRequest(received)) yield* answerServerRequest(received)
      }
    })

  const waitForNotification = <T>(method: string, predicate: (params: T) => boolean, timeoutMs = 15_000) =>
    Effect.gen(function* () {
      while (true) {
        const received = yield* acp.receive.pipe(Effect.timeout(Duration.millis(timeoutMs)))
        if (isServerRequest(received)) {
          yield* answerServerRequest(received)
          continue
        }
        if (!isJsonRpcNotification<T>(received)) continue
        if (received.method === method && predicate(received.params as T)) return received
      }
    })

  return {
    request,
    receive: acp.receive,
    waitForNotification,
  }
}

export function expectOk<T>(response: JsonRpcResponse<T>) {
  expect(response.error).toBeUndefined()
  expect(response.result).toBeDefined()
  return response.result as T
}

export function selectConfigOption(options: SessionConfigOption[] | null | undefined, id: string) {
  return options?.find(
    (option): option is Extract<SessionConfigOption, { type: "select" }> =>
      option.id === id && option.type === "select",
  )
}

export function firstAlternateValue(option: Extract<SessionConfigOption, { type: "select" }>) {
  return flattenSelectOptions(option).find((item) => item.value !== option.currentValue)?.value
}

export function flattenSelectOptions(option: Extract<SessionConfigOption, { type: "select" }>) {
  return option.options.flatMap((item): SessionConfigSelectOption[] => ("value" in item ? [item] : item.options))
}

function isJsonRpcResponse<T>(input: unknown): input is JsonRpcResponse<T> {
  if (!input || typeof input !== "object") return false
  return "id" in input && "jsonrpc" in input
}

function isJsonRpcNotification<T>(input: unknown): input is JsonRpcNotification<T> {
  if (!input || typeof input !== "object") return false
  return "method" in input && !("id" in input) && "jsonrpc" in input
}
