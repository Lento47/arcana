/**
 * Brand rebrand regression guard.
 *
 * Locks down the user-facing rebrand away from "OpenCode Go" / `opencode.ai`.
 * If you intentionally rename a tier or change a URL, update BRAND_TIERS in
 * `packages/tui/src/branding.ts` AND the mirror in
 * `packages/engine/src/session/retry.ts` AND the test allowlist below.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const TUI_SRC = join(import.meta.dir, "..", "src")
const ENGINE_SRC = join(import.meta.dir, "..", "..", "engine", "src")

/** Forbidden substrings in user-facing brand copy. */
const NEEDLES = [
  "OpenCode Go",
  "opencode.ai",
  "opencode-ai",
  "Subscribe to OpenCode",
  "Go is a $",
  "$5/month",
] as const

/** Substrings that look like a hit but are not (false-positive suppressions). */
const ALLOWLIST = [
  // "opencode-go" is the provider id and OAuth/SDK path; intentional per the
  // M10 revert documented in docs/qa-fixes-2026-07-10.md.
  "opencode-go",
  // docs that document the historical rebrand
  "docs/route-decisions.md",
  "docs/qa-fixes-2026-07-10.md",
  // fallback shell still uses the opencode-shell resolver
  "opencode-shell.tsx",
  // package metadata / scope name is "arcana-ai" (not "arcana" — squatted),
  // but the upstream registry that build.yml still falls back to is opencode-ai.
  // Tracked separately in c4-fix branch, not a brand copy regression.
  "packages/script/src/index.ts",
  // Upstream API endpoints (dev.api.opencode.ai, api.opencode.ai) — engine
  // talks to the upstream service, not user-facing copy. Tracked in CTO M8
  // backlog for a future arcana.dev mirror.
  "packages/engine/src/cli/cmd/github.handler.ts",
  "packages/engine/src/server/shared/ui.ts",
  // Plugin shim — `opencode-ai-plugin-compat` is an intentional compatibility
  // alias for third-party plugins published under the @opencode-ai scope.
  // Per rebrand-service-tags.md Tier 3, the shim is kept.
  "packages/engine/src/kernel/compat.ts",
  // OAuth client_uri registered with the upstream identity provider. Changing
  // this requires re-registering the OAuth client on the provider side.
  "packages/engine/src/mcp/oauth-provider.ts",
  // HTTP-Referer is now https://arcana.otnelhq.com/ (Arcana app attribution).
  // Keep this path allowlisted only if residual opencode.ai strings remain.
  // Theme JSON schema source — JSONSchema's $schema URL points at the upstream
  // theme spec. Not user-facing.
  "src/theme/assets/",
  // AI SDK package name + the `llm` adapter path. The `@opencode-ai/llm`
  // package is the upstream runtime SDK; renaming requires forking the
  // adapter (Tracked as part of any future SDK rebrand, not this hotfix).
  "@opencode-ai/llm",
  "packages/engine/src/session/llm/AGENTS.md",
] as const

function* walk(dir: string, exts: ReadonlyArray<string>): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) yield* walk(full, exts)
    else if (exts.some((e) => entry.endsWith(e))) yield full
  }
}

function checkFile(path: string, srcRoot: string) {
  // Resolve both repo-root and the file's package-relative path so allowlist
  // entries can be written as either "packages/engine/src/..." or
  // "engine/src/..." (depending on walk root).
  const repoRoot = join(import.meta.dir, "..", "..", "..")
  const fromRepo = relative(repoRoot, path).replaceAll("\\", "/")
  const fromPkg = relative(join(import.meta.dir, "..", ".."), path).replaceAll("\\", "/")
  for (const allow of ALLOWLIST) {
    if (fromRepo.includes(allow) || fromPkg.includes(allow)) return
  }
  const text = readFileSync(path, "utf8")
  for (const needle of NEEDLES) {
    if (text.includes(needle)) {
      throw new Error(`brand-rebrand regression in ${fromRepo}: forbidden substring "${needle}"`)
    }
  }
}

describe("brand rebrand regression", () => {
  test("tui/src has no OpenCode Go / opencode.ai in user-facing copy", () => {
    for (const file of walk(TUI_SRC, [".ts", ".tsx"])) checkFile(file, TUI_SRC)
  })
  test("engine/src has no OpenCode Go / opencode.ai in user-facing copy", () => {
    for (const file of walk(ENGINE_SRC, [".ts", ".tsx"])) checkFile(file, ENGINE_SRC)
  })
  test("BRAND_TIERS.go.name is Arcana Pro", () => {
    // import after the file scan to avoid pulling branding into both test contexts
    const { BRAND_TIERS } = require("../src/branding")
    expect(BRAND_TIERS.go.name).toBe("Arcana Pro")
    expect(BRAND_TIERS.go.price).toBe("$10/month")
    expect(BRAND_TIERS.go.url).toMatch(/^https:\/\/arcana\.otnelhq\.com\//)
  })
})
