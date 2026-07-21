#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
// arcana launcher — downloads the binary from R2 if needed, then runs it.
// Entrypoint for: npx arcana-ai
const { spawnSync, execSync } = require("child_process")
const { existsSync, mkdirSync, chmodSync, writeFileSync, unlinkSync } = require("fs")
const path = require("path")
const crypto = require("crypto")
const os = require("os")

const RELEASES_URL = "https://releases.otnelhq.com/arcana"
const VERSION = "v0.3.15"

// Ed25519 public key — hardcoded in the launcher so signature verification
// works without any env var. The corresponding private key lives in GitHub
// Secrets (ARCANA_SIGNING_PRIVATE_KEY) and signs every .sha256 in CI.
//
// To rotate: generate new key pair, update this constant, redeploy to npm.
//   openssl genpkey -algorithm Ed25519 -out private.pem
//   openssl pkey -in private.pem -pubout | base64 -w0   ← paste below
const SIGNING_PUBLIC_KEY_BASE64 =
  "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUNvd0JRWURLMlZ3QXlFQVVaV3ViNlZodUdzc056TzhSVHhrU2FMeVEyZmphdFlFMGFLVEpDK2R5Tm89Ci0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo="

const SIGNING_PUBLIC_KEY_PEM = SIGNING_PUBLIC_KEY_BASE64
  ? atob(SIGNING_PUBLIC_KEY_BASE64)
  : ""

function verifySha256Signature(sha256Content, signatureHex) {
  try {
    if (!SIGNING_PUBLIC_KEY_PEM) return true // not configured — skip verification
    const key = crypto.createPublicKey({ key: SIGNING_PUBLIC_KEY_PEM, format: "pem", type: "spki" })
    const sig = Buffer.from(signatureHex, "hex")
    return crypto.verify(null, Buffer.from(sha256Content), key, sig)
  } catch {
    return false
  }
}

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
  console.error(`arcana: supported platforms: ${Object.keys(PLATFORM_MAP).join(", ")}`)
  process.exit(1)
}

const CACHE_DIR = process.env.ARCANA_CACHE || path.join(os.homedir(), ".arcana", "bin")
const CACHED_BINARY = path.join(CACHE_DIR, entry.binary)
const VERSION_FILE = path.join(CACHE_DIR, ".version")

async function downloadAndExtract() {
  // Clean up any stale temp file from previous failed attempts
  try { unlinkSync(path.join(CACHE_DIR, entry.asset)) } catch {}

  const url = `${RELEASES_URL}/${VERSION}/${entry.asset}`
  console.error(`arcana: ${VERSION} — downloading ${entry.asset}...`)

  mkdirSync(CACHE_DIR, { recursive: true })

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`arcana: download failed: ${res.status} ${res.statusText}`)
    process.exit(1)
  }

  const tmp = path.join(CACHE_DIR, entry.asset)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(tmp, buf)
  console.error(`arcana: ${(buf.length / 1e6).toFixed(1)}MB, verifying...`)

  // Verify binary integrity — checksum is mandatory
  const shaUrl = url + ".sha256"
  const shaRes = await fetch(shaUrl)
  if (!shaRes.ok) {
    console.error(`arcana: FATAL — checksum unavailable (${shaUrl})`)
    console.error(`arcana: the binary cannot be verified and will not be executed`)
    try { unlinkSync(tmp) } catch {}
    process.exit(1)
  }
  const shaText = (await shaRes.text()).trim()

  // Verify Ed25519 signature on checksum before trusting it.
  // Both checksum and signature come from R2 — signature proves
  // the checksum was authored by the CI signing key, not an attacker
  // who gained write access to the R2 bucket.
  if (SIGNING_PUBLIC_KEY_PEM) {
    const sigUrl = url + ".sha256.sig"
    const sigRes = await fetch(sigUrl)
    if (!sigRes.ok) {
      console.error(`arcana: FATAL — signature unavailable (${sigUrl})`)
      console.error(`arcana: the binary cannot be verified and will not be executed`)
      try { unlinkSync(tmp) } catch {}
      process.exit(1)
    }
    const sigHex = (await sigRes.text()).trim()
    if (!verifySha256Signature(shaText, sigHex)) {
      console.error("arcana: SIGNATURE VERIFICATION FAILED")
      console.error("arcana: the checksum may have been tampered with — aborting")
      try { unlinkSync(tmp) } catch {}
      process.exit(1)
    }
    console.error("arcana: signature OK")
  }

  const expectedHash = shaText.split(/\s+/)[0]
  const actualHash = crypto.createHash("sha256").update(buf).digest("hex")
  if (expectedHash !== actualHash) {
    console.error(`arcana: CHECKSUM MISMATCH`)
    console.error(`  expected: ${expectedHash}`)
    console.error(`  actual:   ${actualHash}`)
    console.error(`arcana: binary may be corrupted or tampered — deleting`)
    try { unlinkSync(tmp) } catch {}
    process.exit(1)
  }
  console.error(`arcana: checksum OK`)

  console.error(`arcana: extracting...`)
  try {
    if (entry.asset.endsWith(".tar.gz")) {
      execSync(`tar xzf "${tmp}" -C "${CACHE_DIR}"`, { stdio: "pipe" })
      unlinkSync(tmp)
    } else if (entry.asset.endsWith(".zip")) {
      if (os.platform() === "win32") {
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

  // Write version file so we can detect staleness on next run
  try { writeFileSync(VERSION_FILE, VERSION, "utf8") } catch {}
  console.error(`arcana: ready`)
}

async function main() {
  // Check if cached binary is stale (wrong version)
  let cachedVersion = ""
  try { cachedVersion = require("fs").readFileSync(VERSION_FILE, "utf8").trim() } catch {}

  if (!existsSync(CACHED_BINARY) || cachedVersion !== VERSION) {
    await downloadAndExtract()
  }

  if (!existsSync(CACHED_BINARY)) {
    console.error(`arcana: binary not found after download`)
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const child = spawnSync(CACHED_BINARY, args, { stdio: "inherit" })
  process.exit(child.status ?? 0)
}

main().then((code) => process.exit(code), (err) => {
  console.error(`arcana: ${err.message}`)
  process.exit(1)
})
