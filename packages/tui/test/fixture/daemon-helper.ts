// Test-only fake daemon for daemon-respawn.test.ts.
// Serves GET /health on TEST_PORT, writes its PID to TEST_PID_FILE, and
// self-exits after 30s as a cleanup safety net.
const port = Number(process.env.TEST_PORT)
if (!Number.isInteger(port) || port <= 0) {
  console.error("[daemon-helper] TEST_PORT must be a positive integer")
  process.exit(1)
}

const pidFile = process.env.TEST_PID_FILE
if (pidFile) {
  try {
    await Bun.write(pidFile, String(process.pid))
  } catch {}
}

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/health") {
      return Response.json({ healthy: true })
    }
    return new Response("ok")
  },
})

setTimeout(() => {
  server.stop(true)
  process.exit(0)
}, 30_000)
