import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { wrapDaemonFetch } from "../src/context/sdk"

// The daemon respawn wrapper must bring a dead local daemon back on the next
// request instead of surfacing "Unable to connect" to the user (TUI-2.1
// stream reliability / daemon idle-stop recovery).
describe("daemon respawn on connection failure", () => {
  const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture")
  const helperPath = path.join(fixtureDir, "daemon-helper.ts")
  const pidFile = path.join(fixtureDir, ".daemon-helper.pid")

  let placeholder: ReturnType<typeof Bun.serve>
  let url: string

  beforeAll(async () => {
    // Reserve a free port; the helper daemon will bind it after respawn.
    placeholder = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("placeholder"),
    })
    url = `http://127.0.0.1:${placeholder.port!}`
    process.env.ARCANA_DAEMON_CMD = JSON.stringify([process.execPath, helperPath, "--daemon"])
    process.env.TEST_PORT = String(placeholder.port!)
    process.env.TEST_PID_FILE = pidFile
  })

  afterAll(async () => {
    delete process.env.ARCANA_DAEMON_CMD
    delete process.env.TEST_PORT
    delete process.env.TEST_PID_FILE
    try {
      const pid = Number(fs.readFileSync(pidFile, "utf8"))
      if (Number.isInteger(pid) && pid > 0) process.kill(pid)
    } catch {}
    try {
      fs.rmSync(pidFile, { force: true })
    } catch {}
    try {
      await placeholder.stop(true)
    } catch {}
  })

  test("respawns a dead daemon and retries the failed request", async () => {
    // Kill the placeholder: the next fetch must fail, then respawn the helper.
    await placeholder.stop(true)

    const wrapped = wrapDaemonFetch(url, process.cwd(), fetch)
    const response = await wrapped(`${url}/health`)

    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual({ healthy: true })
  })
})
