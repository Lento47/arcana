import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@arcana/core/flag/flag"

/** Hostnames that never leave the local machine (ARC-SEC-I08). */
export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase()
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]"
}

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless arcana server",
  // Server loads instances per-request via x-opencode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    const opts = yield* resolveNetworkOptions(args)
    const loopback = isLoopbackHostname(opts.hostname)

    // ARC-SEC-I08: non-loopback bind requires a password so the control plane is not open.
    if (!loopback && !Flag.ARCANA_SERVER_PASSWORD) {
      console.error(
        "Refusing to bind non-loopback without ARCANA_SERVER_PASSWORD.\n" +
          `  hostname: ${opts.hostname}\n` +
          "  Set ARCANA_SERVER_PASSWORD, or use --hostname 127.0.0.1 for local-only.",
      )
      process.exitCode = 1
      return
    }

    if (!Flag.ARCANA_SERVER_PASSWORD) {
      console.log("Warning: ARCANA_SERVER_PASSWORD is not set; server is unsecured (loopback only).")
    }

    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`arcana server listening on http://${server.hostname}:${server.port}`)

    yield* Effect.never
  }),
})
