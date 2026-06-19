#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
// arcana launcher — downloads the binary from GitHub releases if needed, then runs it.
// Entrypoint for: npx arcana-ai
const { spawnSync, execSync } = require("child_process")
const { existsSync, mkdirSync, chmodSync, writeFileSync, unlinkSync } = require("fs")
const path = require("path")
const crypto = require("crypto")
const os = require("os")

const REPO = "Lento47/arcana"
const VERSION = "v0.1.0" // TODO: fetch latest via GitHub API

const PLATFORM_MAP = {
  "win32-x64":    { asset: "arcana-windows-x64.zip",    binary: "arcana.exe" },
  "win32-arm64":  { asset: "arcana-windows-arm64.zip",  binary: "arcana.exe" },
  "linux-x64":    { asset: "arcana-linux-x64.tar.gz",   binary: "arcana" },
  "linux-arm64":  { asset: "arcana-linux-arm64.tar.gz", binary: "arcana" },
  "darwin-x64":   { asset: "arcana-darwin-x64.zip",     binary: "arcana" },
  "darwin-arm64": { asset: "arcana-darwin-arm64.zip",   binary: "arcana" },
}

const platform = `${os.platform()}-${os.arch()}`
const entry = PLATFORM_MAP[platform]

if (!entry) {
  console.error(`arcana: unsupported platform ${platform}`)
  console.error(`arcana: try installing from source: https://github.com/Lento47/arcana`)
  process.exit(1)
}

const CACHE_DIR = process.env.ARCANA_CACHE || path.join(os.homedir(), ".arcana", "bin")
const CACHED_BINARY = path.join(CACHE_DIR, entry.binary)

async function downloadAndExtract() {
  const ext = entry.asset.endsWith(".tar.gz") ? ".tar.gz" : ".zip"
  const zipName = `arcana-${platform}${ext}`

  // Clean up any stale temp file from previous failed attempts
  try { unlinkSync(path.join(CACHE_DIR, zipName)) } catch {}

  const url = `https://github.com/${REPO}/releases/download/${VERSION}/${entry.asset}`
  console.error(`arcana: downloading ${zipName}...`)

  mkdirSync(CACHE_DIR, { recursive: true })

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`arcana: download failed: ${res.status} ${res.statusText}`)
    process.exit(1)
  }

  const tmp = path.join(CACHE_DIR, zipName)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(tmp, buf)
  console.error(`arcana: ${(buf.length / 1e6).toFixed(1)}MB, verifying checksum...`)

  // Verify binary checksum against GitHub release .sha256 artifact
  const shaUrl = url + ".sha256"
  try {
    const shaRes = await fetch(shaUrl)
    if (!shaRes.ok) {
      console.error(`arcana: checksum file not found (${shaUrl}), skipping verification`)
    } else {
      const shaText = (await shaRes.text()).trim()
      const expectedHash = shaText.split(/\s+/)[0]
      const actualHash = crypto.createHash("sha256").update(buf).digest("hex")
      if (expectedHash !== actualHash) {
        console.error(`arcana: CHECKSUM MISMATCH for ${zipName}`)
        console.error(`  expected: ${expectedHash}`)
        console.error(`  actual:   ${actualHash}`)
        console.error(`arcana: binary may be corrupted or tampered — deleting`)
        try { unlinkSync(tmp) } catch {}
        process.exit(1)
      }
      console.error(`arcana: checksum OK (SHA256: ${actualHash.slice(0, 16)}...)`)
    }
  } catch (e) {
    console.error(`arcana: checksum verification failed: ${e.message}`)
    process.exit(1)
  }

  console.error(`arcana: extracting...`)

  try {
    if (entry.asset.endsWith(".tar.gz")) {
      execSync(`tar xzf "${tmp}" -C "${CACHE_DIR}"`, { stdio: "pipe" })
      unlinkSync(tmp)
    } else if (entry.asset.endsWith(".zip")) {
      if (os.platform() === "win32") {
        // .NET ZipFile — built into .NET, no PowerShell module needed
        const safeTmp = tmp.replace(/'/g, "''")
        const safeDir = CACHE_DIR.replace(/'/g, "''")
        execSync(
          `powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null; [System.IO.Compression.ZipFile]::ExtractToDirectory('${safeTmp}', '${safeDir}')"`,
          { stdio: "pipe" },
        )
      } else {
        execSync(`unzip -o "${tmp}" -d "${CACHE_DIR}"`, { stdio: "pipe" })
      }
      unlinkSync(tmp)
    }
  } catch (e) {
    console.error(`arcana: extraction failed: ${e.message}`)
    process.exit(1)
  }

  if (os.platform() !== "win32") {
    try { chmodSync(CACHED_BINARY, 0o755) } catch {}
  }

  console.error(`arcana: ready — ${CACHED_BINARY}`)
}

async function main() {
  if (!existsSync(CACHED_BINARY)) {
    await downloadAndExtract()
  }

  if (!existsSync(CACHED_BINARY)) {
    console.error(`arcana: binary not found: ${CACHED_BINARY}`)
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const child = spawnSync(CACHED_BINARY, args, { stdio: "inherit" })
  process.exit(child.status ?? 0)
}

main().catch((err) => {
  console.error(`arcana: ${err.message}`)
  process.exit(1)
})
