#!/usr/bin/env node
// arcana launcher — downloads the opencode binary from GitHub releases if needed, then runs it.
// This is the entrypoint for: npx arcana-ai
const { spawnSync, execSync } = require("child_process")
const { existsSync, mkdirSync, chmodSync, writeFileSync, unlinkSync } = require("fs")
const path = require("path")
const os = require("os")

const REPO = "anomalyco/opencode"
const VERSION = "v1.17.8" // TODO: fetch latest via GitHub API

const PLATFORM_MAP = {
  "win32-x64":   { name: "opencode-windows-x64.zip",           binary: "opencode.exe" },
  "win32-arm64": { name: "opencode-windows-arm64.zip",         binary: "opencode.exe" },
  "linux-x64":     { name: "opencode-linux-x64.tar.gz",          binary: "opencode" },
  "linux-arm64":   { name: "opencode-linux-arm64.tar.gz",        binary: "opencode" },
  "darwin-x64":    { name: "opencode-darwin-x64.zip",            binary: "opencode" },
  "darwin-arm64":  { name: "opencode-darwin-arm64.zip",          binary: "opencode" },
}

const platform = `${os.platform()}-${os.arch()}`
const entry = PLATFORM_MAP[platform]

if (!entry) {
  console.error(`arcana: unsupported platform ${platform}`)
  console.error(`arcana: try installing from source: https://github.com/${REPO}`)
  process.exit(1)
}

const CACHE_DIR = process.env.ARCANA_CACHE || path.join(os.homedir(), ".arcana", "bin")
const CACHED_BINARY = path.join(CACHE_DIR, entry.binary)

async function downloadAndExtract() {
  const url = `https://github.com/${REPO}/releases/download/${VERSION}/${entry.name}`
  console.error(`arcana: downloading ${entry.name}...`)

  mkdirSync(CACHE_DIR, { recursive: true })

  // Download via Node.js fetch
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`arcana: download failed: ${res.status} ${res.statusText}`)
    console.error(`arcana: URL: ${url}`)
    process.exit(1)
  }

  // Clean up stale temp files from previous failed attempts
  try { unlinkSync(path.join(CACHE_DIR, entry.name)) } catch {}

  // Write to temp file
  const tmp = path.join(CACHE_DIR, entry.name)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(tmp, buf)
  console.error(`arcana: downloaded ${(buf.length / 1e6).toFixed(1)}MB`)

  // Extract
  try {
    if (entry.name.endsWith(".tar.gz")) {
      execSync(`tar xzf "${tmp}" -C "${CACHE_DIR}"`, { stdio: "pipe" })
      unlinkSync(tmp)
    } else if (entry.name.endsWith(".zip")) {
      if (os.platform() === "win32") {
        // Use .NET ZipFile (built into .NET, no PowerShell module needed)
        execSync(
          `powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null; [System.IO.Compression.ZipFile]::ExtractToDirectory('${tmp.replace(/'/g, "''")}', '${CACHE_DIR.replace(/'/g, "''")}')"`,
          { stdio: "pipe" },
        )
      } else {
        execSync(`unzip -o "${tmp}" -d "${CACHE_DIR}"`, { stdio: "pipe" })
      }
      unlinkSync(tmp)
    }
  } catch (e) {
    console.error(`arcana: extraction failed: ${e.message}`)
    // Leave tmp file for manual debugging
    process.exit(1)
  }

  // Ensure executable
  if (os.platform() !== "win32") {
    try { chmodSync(CACHED_BINARY, 0o755) } catch {}
  }

  console.error(`arcana: installed to ${CACHED_BINARY}`)
}

async function main() {
  // Download if needed
  if (!existsSync(CACHED_BINARY)) {
    await downloadAndExtract()
  }

  if (!existsSync(CACHED_BINARY)) {
    console.error(`arcana: binary not found after download: ${CACHED_BINARY}`)
    process.exit(1)
  }

  // Run binary with same args
  const args = process.argv.slice(2)
  const child = spawnSync(CACHED_BINARY, args, { stdio: "inherit" })
  process.exit(child.status ?? 0)
}

main().catch((err) => {
  console.error(`arcana: ${err.message}`)
  process.exit(1)
})
