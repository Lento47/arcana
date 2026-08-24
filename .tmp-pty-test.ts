import { spawn } from "@lydell/node-pty"
import process from "node:process"

const pty = spawn("bun", ["run", "dev:tui"], {
  name: "xterm-256color",
  cols: 120,
  rows: 40,
  cwd: process.cwd(),
  env: { ...process.env, ARCANA_DEBUG_VOICE: "1", ARCANA_DISABLE_MOUSE: "1" },
})

let output = ""
pty.onData((data) => {
  output += data
  process.stdout.write(data)
})

pty.onExit((exitCode) => {
  console.error(`\nPTY exited with code ${exitCode}`)
  console.error(`Captured ${output.length} chars`)
  process.exit(0)
})

setTimeout(() => {
  // try pressing alt by sending escape sequence? Actually send some keys.
  // But just capture startup crash.
  pty.kill()
}, 6000)
