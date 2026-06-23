import path from "path"
import fs from "fs/promises"
import { existsSync } from "fs"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import os from "os"
import { Context, Effect, Layer } from "effect"
import { Flock } from "./util/flock"
import { Flag } from "./flag/flag"
import { LayerNode } from "./effect/layer-node"

const app = "arcana"
const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)
const tmp = path.join(os.tmpdir(), app)

const paths = {
  get home() {
    return process.env.ARCANA_TEST_HOME ?? os.homedir()
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  repos: path.join(data, "repos"),
  cache,
  config,
  state,
  tmp,
}

export const Path = paths

Flock.setGlobal({ state })

if (process.env["ARCANA_PROFILE_STARTUP"]) performance.mark("global-mkdir-start")
// Recursive mkdir of these 7 dirs measured ~116ms on Windows even when they all
// already exist (warm runs — the common case). Skip the syscall when the dir is
// already present; only create the missing ones on first run.
//
// Awaiting this Promise.all keeps the main thread parked on disk I/O just long
// enough for Bun's module loader to resolve the next batch of engine top-level
// imports in parallel — without the await, the engine pays the same wall-clock
// cost later, just under a different profile marker. The audit confirmed this:
// the 69ms "global-mkdir" duration was really the engine's import resolution
// running concurrently with the mkdir. Awaiting keeps the total stable and the
// measurement honest.
await Promise.all(
  [Path.data, Path.config, Path.state, Path.tmp, Path.log, Path.bin, Path.repos].map((d) =>
    existsSync(d) ? Promise.resolve() : fs.mkdir(d, { recursive: true }),
  ),
)
if (process.env["ARCANA_PROFILE_STARTUP"]) { performance.mark("global-mkdir-end"); try { performance.measure("global-mkdir", "global-mkdir-start", "global-mkdir-end") } catch {} }

export class Service extends Context.Service<Service, Interface>()("@arcana/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.ARCANA_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

export const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const defaultLayer = layer
export const node = LayerNode.make(layer, [])

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )

export * as Global from "./global"
