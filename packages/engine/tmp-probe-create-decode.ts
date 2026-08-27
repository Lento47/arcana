import { Effect } from "effect"
import { Schema } from "effect"
import { CreateInput } from "./src/session/session.ts"

const cases: Array<Record<string, unknown>> = [
  { title: "x" },
  {},
  { title: "x", agent: "build" },
]

for (const payload of cases) {
  const exit = await Effect.runPromiseExit(Schema.decodeUnknownEffect(CreateInput)(payload))
  console.log(JSON.stringify(payload), "→", exit._tag, exit._tag === "Failure" ? JSON.stringify(exit.cause).slice(0, 400) : JSON.stringify(exit.value))
}
