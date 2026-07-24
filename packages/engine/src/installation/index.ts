import { LayerNode } from "@arcana/core/effect/layer-node"
import { httpClient } from "@arcana/core/effect/layer-node-platform"
import { Effect, Layer, Schema, Context, Stream } from "effect"
import { serviceUse } from "@arcana/core/effect/service-use"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { errorMessage } from "@/util/error"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@arcana/core/process"
import path from "path"
import { EventV2 } from "@arcana/core/event"
import { makeRuntime } from "@arcana/core/effect/runtime"
import semver from "semver"
import { InstallationChannel, InstallationVersion } from "@arcana/core/installation/version"
import { NpmConfig } from "@arcana/core/npm-config"

export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"

export type ReleaseType = "patch" | "minor" | "major"

// Self-contained arcana upgrade script (curl method). Downloads the platform binary
// from R2, verifies its sha256, and replaces the running binary. Uses only `$VAR`
// (no `${}`) so nothing is interpolated by this TS template literal. VERSION + ARCANA_BIN
// are passed via env. Replaces the old behaviour of piping upstream opencode's installer.
const ARCANA_UPGRADE_SCRIPT = `set -e
V="$VERSION"
case "$V" in v*) ;; *) V="v$V" ;; esac
BIN="$ARCANA_BIN"
OS=$(uname -s)
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) A=x64 ;;
  aarch64|arm64) A=arm64 ;;
  *) echo "arcana: unsupported arch $ARCH" >&2; exit 1 ;;
esac
case "$OS" in
  Linux) OSN=linux; EXT=tar.gz ;;
  Darwin) OSN=darwin; EXT=zip ;;
  *) echo "arcana: unsupported os $OS (use npm/bun to upgrade)" >&2; exit 1 ;;
esac
ASSET="arcana-$OSN-$A.$EXT"
if [ "$OSN" = linux ] && grep -qi musl /etc/os-release 2>/dev/null; then
  ASSET="arcana-linux-$A-musl.$EXT"
fi
URL="https://releases.otnelhq.com/arcana/$V/$ASSET"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$URL" -o "$TMP/pkg" || { echo "arcana: download failed $URL" >&2; exit 1; }
if curl -fsSL "$URL.sha256" -o "$TMP/sha" 2>/dev/null && [ -s "$TMP/sha" ]; then
  EXP=$(cut -d' ' -f1 "$TMP/sha")
  if command -v sha256sum >/dev/null 2>&1; then GOT=$(sha256sum "$TMP/pkg" | cut -d' ' -f1); else GOT=$(shasum -a 256 "$TMP/pkg" | cut -d' ' -f1); fi
  [ "$EXP" = "$GOT" ] || { echo "arcana: checksum mismatch" >&2; exit 1; }
fi
mkdir -p "$TMP/x"
case "$EXT" in
  tar.gz) tar -xzf "$TMP/pkg" -C "$TMP/x" ;;
  zip) unzip -oq "$TMP/pkg" -d "$TMP/x" ;;
esac
NEW=$(find "$TMP/x" -type f -name arcana | head -1)
[ -n "$NEW" ] || { echo "arcana: binary not found in archive" >&2; exit 1; }
chmod +x "$NEW"
cp "$NEW" "$BIN.new" && chmod +x "$BIN.new" && mv -f "$BIN.new" "$BIN"
echo "arcana: upgraded to $V"
`

export const Event = {
  Updated: EventV2.define({
    type: "installation.updated",
    schema: {
      version: Schema.String,
    },
  }),
  UpdateAvailable: EventV2.define({
    type: "installation.update-available",
    schema: {
      version: Schema.String,
    },
  }),
}

export function getReleaseType(current: string, latest: string): ReleaseType {
  const currMajor = semver.major(current)
  const currMinor = semver.minor(current)
  const newMajor = semver.major(latest)
  const newMinor = semver.minor(latest)

  if (newMajor > currMajor) return "major"
  if (newMinor > currMinor) return "minor"
  return "patch"
}

export const Info = Schema.Struct({
  version: Schema.String,
  latest: Schema.String,
}).annotate({ identifier: "InstallationInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export function userAgent(client = "cli") {
  return `arcana/${InstallationChannel}/${InstallationVersion}/${client}`
}

export const USER_AGENT = userAgent()

export function isPreview() {
  return InstallationChannel !== "latest"
}

export function isLocal() {
  return InstallationChannel === "local"
}

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {
  override get message() {
    return this.stderr
  }
}

// Response schemas for external version APIs
const NpmPackage = Schema.Struct({ version: Schema.String })

/** Public R2 channel for Arcana binaries (Cloudflare). */
const ARCANA_RELEASES_LATEST_URL = "https://releases.otnelhq.com/arcana/latest.txt"

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/Installation") {}

export const use = serviceUse(Service)

export const layer: Layer.Layer<Service, never, HttpClient.HttpClient | AppProcess.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(withTransientReadRetry(http))
    const appProcess = yield* AppProcess.Service

    const text = Effect.fnUntraced(
      function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
        const result = yield* appProcess.run(
          ChildProcess.make(cmd[0], cmd.slice(1), {
            cwd: opts?.cwd,
            env: opts?.env,
            extendEnv: true,
          }),
        )
        return result.stdout.toString("utf8")
      },
      Effect.catch(() => Effect.succeed("")),
    )

    const run = Effect.fnUntraced(
      function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
        const result = yield* appProcess.run(
          ChildProcess.make(cmd[0], cmd.slice(1), {
            cwd: opts?.cwd,
            env: opts?.env,
            extendEnv: true,
          }),
        )
        return {
          code: result.exitCode,
          stdout: result.stdout.toString("utf8"),
          stderr: result.stderr.toString("utf8"),
        }
      },
      Effect.catch((err) => Effect.succeed({ code: 1, stdout: "", stderr: errorMessage(err) })),
    )

    const upgradeFailure = (method: Method, result?: { code: number; stdout: string; stderr: string }) => {
      if (method === "choco") return "not running from an elevated command shell"
      if (result) return `Upgrade failed for ${method} (exit code ${result.code}).`
      return `Upgrade failed for ${method}.`
    }

    const upgradeScriptShell = Effect.fnUntraced(function* () {
      const bashVersion = yield* text(["bash", "--version"])
      if (bashVersion) return "bash"
      return "sh"
    })

    const upgradeCurl = Effect.fnUntraced(
      function* (target: string) {
        // Arcana binaries from R2 (releases.otnelhq.com) — never upstream OpenCode installers.
        const bodyBytes = new TextEncoder().encode(ARCANA_UPGRADE_SCRIPT)
        const shell = yield* upgradeScriptShell()
        const result = yield* appProcess.run(
          ChildProcess.make(shell, [], {
            stdin: Stream.make(bodyBytes),
            env: { VERSION: target, ARCANA_BIN: process.execPath },
            extendEnv: true,
          }),
        )
        return {
          code: result.exitCode,
          stdout: result.stdout.toString("utf8"),
          stderr: result.stderr.toString("utf8"),
        }
      },
      Effect.mapError(() => new UpgradeFailedError({ stderr: upgradeFailure("curl") })),
    )

    /** Latest from npmjs (`arcana-ai` package). Used for npm/bun/pnpm/yarn installs. */
    const latestFromNpm = Effect.fnUntraced(function* () {
      const response = yield* httpOk.execute(
        HttpClientRequest.get(
          `${yield* NpmConfig.registry(process.cwd())}/arcana-ai/${InstallationChannel}`,
        ).pipe(HttpClientRequest.acceptJson),
      )
      const data = yield* HttpClientResponse.schemaBodyJson(NpmPackage)(response)
      return data.version
    })

    /**
     * Latest from Cloudflare R2 (`releases.otnelhq.com/arcana/latest.txt`).
     * Canonical for curl/binary installs and for methods without a published Arcana package.
     */
    const latestFromR2 = Effect.fnUntraced(function* () {
      const response = yield* httpOk.execute(
        HttpClientRequest.get(ARCANA_RELEASES_LATEST_URL).pipe(
          HttpClientRequest.setHeaders({ Accept: "text/plain" }),
        ),
      )
      const data = yield* response.text
      const version = data.trim().replace(/^v/, "")
      if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
        return yield* Effect.die(new Error(`Invalid version from Arcana releases: ${data}`))
      }
      return version
    })

    const result: Interface = {
      info: Effect.fn("Installation.info")(function* () {
        return {
          version: InstallationVersion,
          latest: yield* result.latest(),
        }
      }),
      method: Effect.fn("Installation.method")(function* () {
        if (process.execPath.includes(path.join(".arcana", "bin"))) return "curl" as Method
        if (process.execPath.includes(path.join(".local", "bin"))) return "curl" as Method
        const exec = process.execPath.toLowerCase()

        const checks: Array<{ name: Method; command: () => Effect.Effect<string> }> = [
          { name: "npm", command: () => text(["npm", "list", "-g", "--depth=0"]) },
          { name: "yarn", command: () => text(["yarn", "global", "list"]) },
          { name: "pnpm", command: () => text(["pnpm", "list", "-g", "--depth=0"]) },
          { name: "bun", command: () => text(["bun", "pm", "ls", "-g"]) },
          // Prefer detecting real Arcana package names only (never OpenCode legacy formulas).
          { name: "brew", command: () => text(["brew", "list", "--formula", "arcana"]) },
          { name: "scoop", command: () => text(["scoop", "list", "arcana"]) },
          { name: "choco", command: () => text(["choco", "list", "--limit-output", "arcana"]) },
        ]

        checks.sort((a, b) => {
          const aMatches = exec.includes(a.name)
          const bMatches = exec.includes(b.name)
          if (aMatches && !bMatches) return -1
          if (!aMatches && bMatches) return 1
          return 0
        })

        for (const check of checks) {
          const output = yield* check.command()
          // npm/yarn/pnpm/bun list may show package as arcana-ai; brew/scoop/choco as arcana
          if (output.includes("arcana")) {
            return check.name
          }
        }

        return "unknown" as Method
      }),
      latest: Effect.fn("Installation.latest")(function* (installMethod?: Method) {
        const detectedMethod = installMethod || (yield* result.method())

        // JS package managers: npm registry is authoritative (published by [bump] release).
        if (
          detectedMethod === "npm"
          || detectedMethod === "bun"
          || detectedMethod === "pnpm"
          || detectedMethod === "yarn"
        ) {
          return yield* latestFromNpm()
        }

        // curl / brew / scoop / choco / unknown: R2 binary channel (Cloudflare).
        // Do not query OpenCode brew/choco/scoop feeds — those are a different product.
        return yield* latestFromR2()
      }, Effect.orDie),
      upgrade: Effect.fn("Installation.upgrade")(function* (m: Method, target: string) {
        let upgradeResult: { code: number; stdout: string; stderr: string } | undefined
        switch (m) {
          case "curl":
            upgradeResult = yield* upgradeCurl(target)
            break
          case "npm":
          case "yarn":
            upgradeResult = yield* run(["npm", "install", "-g", `arcana-ai@${target}`])
            break
          case "pnpm":
            upgradeResult = yield* run(["pnpm", "install", "-g", `arcana-ai@${target}`])
            break
          case "bun":
            upgradeResult = yield* run(["bun", "install", "-g", `arcana-ai@${target}`])
            break
          case "brew": {
            // Prefer Homebrew formula named arcana when present; otherwise npm global (arcana-ai).
            const listed = yield* text(["brew", "list", "--formula", "arcana"])
            if (listed.includes("arcana")) {
              const env = { HOMEBREW_NO_AUTO_UPDATE: "1" }
              upgradeResult = yield* run(["brew", "upgrade", "arcana"], { env })
            } else {
              upgradeResult = yield* run(["npm", "install", "-g", `arcana-ai@${target}`])
            }
            break
          }
          case "choco":
            // Official Chocolatey package is arcana when published; fall back to npm.
            upgradeResult = yield* run(["choco", "upgrade", "arcana", `--version=${target}`, "-y"])
            if (upgradeResult.code !== 0) {
              upgradeResult = yield* run(["npm", "install", "-g", `arcana-ai@${target}`])
            }
            break
          case "scoop":
            upgradeResult = yield* run(["scoop", "update", "arcana"])
            if (upgradeResult.code !== 0) {
              upgradeResult = yield* run(["npm", "install", "-g", `arcana-ai@${target}`])
            }
            break
          default:
            return yield* new UpgradeFailedError({ stderr: `Unknown installation method: ${m}` })
        }
        if (!upgradeResult || upgradeResult.code !== 0) {
          return yield* new UpgradeFailedError({ stderr: upgradeFailure(m, upgradeResult) })
        }
        yield* Effect.logInfo("upgraded", {
          method: m,
          target,
          stdout: upgradeResult.stdout,
          stderr: upgradeResult.stderr,
        })
        yield* text([process.execPath, "--version"])
      }),
    }

    return Service.of(result)
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(AppProcess.defaultLayer))

const { runPromise } = makeRuntime(Service, defaultLayer)

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))

export const node = LayerNode.make(layer, [httpClient, AppProcess.node])

export * as Installation from "."
