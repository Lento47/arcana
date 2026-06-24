import { EventV2 } from "@arcana/core/event"
import { Location } from "@arcana/core/location"
import { Effect, Stream } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { Api } from "../api"

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data),
  }
}

export const EventHandler = HttpApiBuilder.group(Api, "server.event", (handlers) =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    return handlers.handleRaw("event.subscribe", () =>
      Effect.gen(function* () {
        const location = yield* Location.Service
        const connected = {
          id: EventV2.ID.create(),
          type: "server.connected",
          location: new Location.Info({
            directory: location.directory,
            workspaceID: location.workspaceID,
            project: location.project,
          }),
          data: {},
        }
        return HttpServerResponse.stream(
          Stream.make(connected).pipe(
            Stream.concat(
              events
                .all()
                .pipe(
                  Stream.filter(
                    (event) =>
                      event.location?.directory === location.directory &&
                      event.location.workspaceID === location.workspaceID,
                  ),
                  // EventV2 payloads carry location as a Location.Ref (directory +
                  // workspaceID only); the project is stripped by the payload schema.
                  // The filter above guarantees the event's directory matches the
                  // resolved request location, so we can safely attach its project
                  // to produce a full Location.Info on the wire — matching the
                  // server.connected payload and the SSE location contract.
                  Stream.map((event) => ({
                    ...event,
                    location: new Location.Info({
                      directory: event.location?.directory ?? location.directory,
                      workspaceID: event.location?.workspaceID,
                      project: location.project,
                    }),
                  })),
                ),
            ),
            Stream.map(eventData),
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
      }),
    )
  }),
)
