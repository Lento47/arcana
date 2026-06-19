import { run as runTui, type TuiInput } from "@arcana/tui"
import { Global } from "@arcana/core/global"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(Global.defaultLayer))
}
