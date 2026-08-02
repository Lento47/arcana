/**
 * D-5: Emergency revocation push channel.
 *
 * Beyond pull-based polling, subscribed control-plane clients receive
 * revocation statements over SSE the moment they are published. The channel
 * is per-directory; statements remain issuer-signed and a subscriber must
 * still verify them before applying (push never bypasses verification).
 */

import { randomUUID } from "node:crypto"
import { Effect, Queue } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerResponse } from "effect/unstable/http"
import * as Sse from "effect/unstable/encoding/Sse"
import type { RevocationStatement } from "@arcana/core/crypto/signed-envelopes"

const subscribers = new Map<string, Set<Queue.Queue<RevocationStatement>>>()

export function publishRevocationStatement(
  directory: string,
  statement: RevocationStatement,
): void {
  const set = subscribers.get(directory)
  if (!set) return
  for (const queue of set) Queue.offerUnsafe(queue, statement)
}

function eventData(event: string, data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event,
    id: undefined,
    data: JSON.stringify(data),
  }
}

export function revocationStreamResponse(directory: string) {
  return Effect.gen(function* () {
    const streamID = `rev_${randomUUID()}`
    const queue = yield* Queue.unbounded<RevocationStatement>()
    let set = subscribers.get(directory)
    if (!set) {
      set = new Set()
      subscribers.set(directory, set)
    }
    set.add(queue)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        set!.delete(queue)
        if (set!.size === 0) subscribers.delete(directory)
      }),
    )

    let sequence = 0
    const output = Stream.fromQueue(queue).pipe(
      Stream.map((statement) =>
        eventData("revocation.statement", {
          type: "revocation.statement",
          statement,
          transport: { streamID, sequence: ++sequence },
        }),
      ),
    )

    return HttpServerResponse.stream(
      Stream.make(
        eventData("server.connected", {
          type: "server.connected",
          transport: { streamID, sequence: 0 },
        }),
      ).pipe(
        Stream.concat(output),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
      ),
      {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  })
}
