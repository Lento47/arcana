import launch from "cross-spawn"
import { type Config } from "./gen/types.gen.js"
import { stop, bindAbort } from "../process.js"

export type ServerOptions = {
  hostname?: string
  port?: number
  signal?: AbortSignal
  timeout?: number
  config?: Config
}

export type TuiOptions = {
  project?: string
  model?: string
  session?: string
  agent?: string
  signal?: AbortSignal
  config?: Config
}

export async function createOpencodeServer(options?: ServerOptions) {
  options = Object.assign(
    {
      hostname: "127.0.0.1",
      port: 4096,
      timeout: 5000,
    },
    options ?? {},
  )

  const args = [`serve`, `--hostname=${options.hostname}`, `--port=${options.port}`]
  if (options.config?.logLevel) args.push(`--log-level=${options.config.logLevel}`)

  const proc = launch(`arcana`, args, {
    env: {
      ...process.env,
      ARCANA_CONFIG_CONTENT: JSON.stringify(options.config ?? {}),
    },
  })
  let clear = () => {}

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => {
      clear()
      stop(proc)
      reject(new Error(`Timeout waiting for server to start after ${options.timeout}ms`))
    }, options.timeout)
    let output = ""
    let resolved = false
    proc.stdout?.on("data", (chunk) => {
      if (resolved) return
      output += chunk.toString()
      const lines = output.split("\n")
      for (const line of lines) {
        if (line.startsWith("arcana server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (!match) {
            clear()
            stop(proc)
            clearTimeout(id)
            reject(new Error(`Failed to parse server url from output: ${line}`))
            return
          }
          clearTimeout(id)
          resolved = true
          // Health check: verify server is actually ready before resolving
          const healthUrl = `${match[1]}/health`
          fetch(healthUrl, { signal: options.signal })
            .then((r) => {
              if (r.ok) return resolve(match[1]!)
              reject(new Error(`Server health check failed: ${r.status}`))
            })
            .catch((err) => {
              // Fallback: if health endpoint doesn't exist, still resolve (older servers)
              if (err?.cause?.code === "ECONNREFUSED" || err?.name === "TypeError") {
                // Server not ready yet — retry once after 500ms
                setTimeout(() => {
                  fetch(healthUrl, { signal: options.signal })
                    .then((r2) =>
                      r2.ok ? resolve(match[1]!) : reject(new Error(`Server health check failed: ${r2.status}`)),
                    )
                    .catch(() => resolve(match[1]!)) // ultimate fallback
                }, 500)
              } else {
                resolve(match[1]!) // non-connection error, server is likely fine
              }
            })
          return
        }
      }
    })
    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
    })
    proc.on("exit", (code) => {
      clearTimeout(id)
      let msg = `Server exited with code ${code}`
      if (output.trim()) {
        msg += `\nServer output: ${output}`
      }
      reject(new Error(msg))
    })
    proc.on("error", (error) => {
      clearTimeout(id)
      reject(error)
    })
    clear = bindAbort(proc, options.signal, () => {
      clearTimeout(id)
      reject(options.signal?.reason)
    })
  })

  return {
    url,
    async close() {
      clear()
      // Graceful shutdown: SIGTERM first, wait, then force kill
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGTERM")
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            stop(proc)
            resolve()
          }, 3000)
          proc.on("exit", () => {
            clearTimeout(timeout)
            resolve()
          })
        })
      }
    },
  }
}

export function createOpencodeTui(options?: TuiOptions) {
  const args = []

  if (options?.project) {
    args.push(`--project=${options.project}`)
  }
  if (options?.model) {
    args.push(`--model=${options.model}`)
  }
  if (options?.session) {
    args.push(`--session=${options.session}`)
  }
  if (options?.agent) {
    args.push(`--agent=${options.agent}`)
  }

  const proc = launch(`arcana`, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ARCANA_CONFIG_CONTENT: JSON.stringify(options?.config ?? {}),
    },
  })

  const clear = bindAbort(proc, options?.signal)

  return {
    close() {
      clear()
      stop(proc)
    },
  }
}
