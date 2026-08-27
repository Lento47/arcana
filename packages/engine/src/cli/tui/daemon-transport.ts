import path from "node:path"
import type { DaemonLock } from "../../daemon/lock"
import { isLockStale, readLock, removeLock } from "../../daemon/lock"

const DEFAULT_CONNECT_ATTEMPTS = 35
const DEFAULT_CONNECT_INTERVAL_MS = 200
const HEALTH_TIMEOUT_MS = 1_500

type SpawnedProcess = { unref?: () => void }

export interface DaemonTransportDependencies {
  readonly readLock: (directory: string) => DaemonLock | null
  readonly isLockStale: (lock: DaemonLock) => boolean
  readonly removeLock: (directory: string) => void
  readonly health: (url: string) => Promise<boolean>
  readonly spawn: (input: {
    cmd: string[]
    cwd: string
    env: Record<string, string>
    stdio: ["ignore", "ignore", "ignore"]
  }) => SpawnedProcess
  readonly sleep: (ms: number) => Promise<void>
}

export interface DaemonTransportOptions {
  readonly directory: string
  readonly command: readonly string[]
  readonly fetch?: typeof fetch
  readonly connectAttempts?: number
  readonly connectIntervalMs?: number
  readonly dependencies?: Partial<DaemonTransportDependencies>
}

export interface DaemonTransport {
  readonly url: string
  readonly fetch: typeof fetch
}

export type DaemonTransportFailureReason = "invalid_lock" | "spawn_failed" | "health_timeout" | "not_configured"

export type DaemonTransportAttempt =
  | { readonly status: "connected"; readonly transport: DaemonTransport }
  | { readonly status: "unavailable"; readonly reason: DaemonTransportFailureReason }

type ConnectionFailure = "not_started" | "uncertain"

export class DaemonRequestOutcomeUnknownError extends Error {
  override readonly name = "DaemonRequestOutcomeUnknownError"

  constructor(method: string, pathname: string, cause: unknown) {
    super(
      `Daemon connection failed while sending ${method} ${pathname}; the request outcome is uncertain and Arcana did not replay it. Check current state before retrying.`,
      { cause },
    )
  }
}

function normalizeWorkspace(directory: string): string {
  const normalized = path.resolve(directory).replace(/[\\/]+$/, "")
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function sameWorkspace(left: string, right: string): boolean {
  return normalizeWorkspace(left) === normalizeWorkspace(right)
}

function daemonUrl(port: number): string | undefined {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return undefined
  return `http://127.0.0.1:${port}`
}

function daemonBase(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return undefined
    if (url.username || url.password || url.search || url.hash) return undefined
    if (url.pathname !== "/") return undefined
    if (!url.port) return undefined
    return url
  } catch {
    return undefined
  }
}

export async function assertEngineHealthy(input: { url: string; fetch?: typeof fetch }): Promise<void> {
  const fetchImpl = input.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${input.url}/health`, { signal: controller.signal })
    if (!response.ok) throw new Error(`health endpoint returned HTTP ${response.status}`)
    const body = (await response.json()) as { status?: unknown; version?: unknown }
    if (body.status !== "ok" || typeof body.version !== "string") {
      throw new Error("health endpoint returned an invalid response")
    }
  } finally {
    clearTimeout(timer)
  }
}

async function defaultHealth(fetchImpl: typeof fetch, url: string): Promise<boolean> {
  try {
    await assertEngineHealthy({ url, fetch: fetchImpl })
    return true
  } catch {
    return false
  }
}

function defaultSpawn(input: Parameters<DaemonTransportDependencies["spawn"]>[0]): SpawnedProcess {
  const bun = (globalThis as { Bun?: { spawn?: (options: typeof input) => SpawnedProcess } }).Bun
  if (!bun?.spawn) throw new Error("Bun.spawn is unavailable")
  return bun.spawn(input)
}

function connectionCode(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; cause?: unknown }
    if (typeof value.code === "string") return value.code.toUpperCase()
    current = value.cause
  }
  return undefined
}

function classifyConnectionFailure(error: unknown): ConnectionFailure | undefined {
  if (!(error instanceof Error)) return undefined
  if (error.name === "AbortError" || error.name === "TimeoutError") return undefined

  const code = connectionCode(error)
  if (code === "ECONNREFUSED") return "not_started"
  if (code && ["ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET"].includes(code)) return "uncertain"

  const message = error.message.toLowerCase()
  if (message.includes("econnrefused") || message.includes("connection refused")) return "not_started"
  // Bun's dead-loopback error is explicit that no connection was established.
  if (message.includes("unable to connect")) return "not_started"
  if (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("connect")
  ) {
    return "uncertain"
  }
  return undefined
}

function isReadOnlyMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS"
}

function requestForBase(request: Request, baseUrl: URL): Request {
  const source = new URL(request.url)
  if (source.origin === baseUrl.origin) return request

  const target = new URL(source.pathname + source.search, baseUrl)
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    cache: request.cache,
    credentials: request.credentials,
    integrity: request.integrity,
    keepalive: request.keepalive,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal,
  }
  if (request.body) init.duplex = "half"
  return new Request(target, init)
}

export function createRecoveringDaemonFetch(input: {
  readonly initialUrl: string
  readonly fetch: typeof fetch
  readonly recover: () => Promise<string | undefined>
}): typeof fetch {
  const logicalBase = daemonBase(input.initialUrl)
  if (!logicalBase) throw new TypeError(`Invalid local daemon URL: ${input.initialUrl}`)

  let currentBase = logicalBase
  let recoveryInFlight: Promise<string | undefined> | undefined

  const recover = () => {
    if (recoveryInFlight) return recoveryInFlight
    recoveryInFlight = input.recover().finally(() => {
      recoveryInFlight = undefined
    })
    return recoveryInFlight
  }

  const wrapped = async (requestInput: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(requestInput, init)
    const source = new URL(request.url)
    if (source.origin !== logicalBase.origin) {
      throw new TypeError(`Daemon transport rejected non-daemon origin: ${source.origin}`)
    }

    let replay: Request | undefined
    try {
      replay = request.clone()
    } catch {
      // A disturbed body can still be dispatched once, but it cannot be retried.
    }

    try {
      return await input.fetch(requestForBase(request, currentBase))
    } catch (error) {
      const failure = classifyConnectionFailure(error)
      if (!failure) throw error

      const recovered = await recover()
      const recoveredBase = recovered ? daemonBase(recovered) : undefined
      if (!recoveredBase) throw error
      currentBase = recoveredBase

      if (replay?.signal.aborted) throw replay.signal.reason ?? error
      if (!isReadOnlyMethod(request.method) && failure !== "not_started") {
        throw new DaemonRequestOutcomeUnknownError(request.method, source.pathname, error)
      }
      if (!replay) throw error
      return input.fetch(requestForBase(replay, currentBase))
    }
  }

  return wrapped as typeof fetch
}

export async function createDaemonTransport(options: DaemonTransportOptions): Promise<DaemonTransportAttempt> {
  const fetchImpl = options.fetch ?? fetch
  const dependencies: DaemonTransportDependencies = {
    readLock,
    isLockStale,
    removeLock,
    health: (url) => defaultHealth(fetchImpl, url),
    spawn: defaultSpawn,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...options.dependencies,
  }
  const attempts = options.connectAttempts ?? DEFAULT_CONNECT_ATTEMPTS
  const intervalMs = options.connectIntervalMs ?? DEFAULT_CONNECT_INTERVAL_MS
  const directory = path.resolve(options.directory)

  async function matchingLockUrl(): Promise<{ state: "missing" | "invalid" | "unhealthy" | "healthy"; url?: string }> {
    const lock = dependencies.readLock(directory)
    if (!lock) return { state: "missing" }
    if (!sameWorkspace(lock.workspace, directory)) return { state: "invalid" }
    if (dependencies.isLockStale(lock)) {
      dependencies.removeLock(directory)
      return { state: "missing" }
    }
    const url = daemonUrl(lock.port)
    if (!url) return { state: "invalid" }
    return (await dependencies.health(url)) ? { state: "healthy", url } : { state: "unhealthy" }
  }

  async function connect(): Promise<
    | { readonly status: "connected"; readonly url: string }
    | { readonly status: "unavailable"; readonly reason: DaemonTransportFailureReason }
  > {
    try {
      const initial = await matchingLockUrl()
      if (initial.state === "healthy") return { status: "connected", url: initial.url! }
      if (initial.state === "invalid") return { status: "unavailable", reason: "invalid_lock" }

      if (initial.state === "missing") {
        if (options.command.length === 0) return { status: "unavailable", reason: "not_configured" }
        const proc = dependencies.spawn({
          cmd: [...options.command],
          stdio: ["ignore", "ignore", "ignore"],
          cwd: directory,
          env: {
            ...(process.env as Record<string, string>),
            ARCANA_DAEMON: "1",
            ARCANA_DAEMON_CWD: directory,
          },
        })
        proc.unref?.()
      }

      for (let attempt = 0; attempt < attempts; attempt++) {
        await dependencies.sleep(intervalMs)
        const candidate = await matchingLockUrl()
        if (candidate.state === "healthy") return { status: "connected", url: candidate.url! }
        if (candidate.state === "invalid") return { status: "unavailable", reason: "invalid_lock" }
      }
    } catch {
      return { status: "unavailable", reason: "spawn_failed" }
    }
    return { status: "unavailable", reason: "health_timeout" }
  }

  const initial = await connect()
  if (initial.status === "unavailable") return initial
  const initialUrl = initial.url

  return {
    status: "connected",
    transport: {
      url: initialUrl,
      fetch: createRecoveringDaemonFetch({
        initialUrl,
        fetch: fetchImpl,
        recover: async () => {
          const recovered = await connect()
          return recovered.status === "connected" ? recovered.url : undefined
        },
      }),
    },
  }
}
