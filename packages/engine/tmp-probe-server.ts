import { Effect, Schema } from "effect"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, HttpServerResponse } from "effect/unstable/httpapi"
import { CreateInput } from "./src/session/session.ts"

const Info = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
})

class BadReq extends Schema.ErrorClass<BadReq>("BadReq")({ _tag: Schema.tag("BadRequest") }) {}

function makeGroup(payload: unknown) {
  return HttpApiGroup.make("session")
    .add(
      HttpApiEndpoint.post("create", "/session", {
        payload: payload as any,
        success: Info,
        error: BadReq,
      }).annotateMerge({ identifier: "session.create" } as any),
    )
}

async function start(label: string, payload: unknown) {
  const group = makeGroup(payload)
  const api = HttpApi.make("probe").add(group)
  const layer = HttpApiBuilder.api(api).toHandled(async () =>
    Effect.succeed({ id: "ses_probe", title: "t" })
  )
  // serve
  const { HttpServerLive } = await import("./src/server/probe-http-live.ts").catch(() => ({ HttpServerLive: null as any }))
  void HttpServerLive
  return { label, layer }
}

void start; void HttpServerResponse; void BadReq; void Info
console.log("placeholder")
