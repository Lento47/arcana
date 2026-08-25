// script/authority-dynamic.preload.ts
// Bun preload that records EXERCISED raw authority from global surfaces:
//   fetch · Bun.spawn · Bun.spawnSync · Bun.write
//
// Claim scope (honest per AUTHORITY-KERNEL.md §3): this proves exercised paths
// only — never absence of dormant paths, and it cannot see node:* module
// internals (static scan owns those). It complements, never replaces, the scan.
//
// Reporting: every call APPENDS one JSONL line immediately (no reliance on
// process exit events). Destination = $ARCANA_AUTHORITY_REPORT when set;
// otherwise records stay in-memory only.

import { appendFileSync } from "node:fs"

if (typeof globalThis.__arcanaAuthorityLog === "undefined") {
  ;(globalThis as any).__arcanaAuthorityLog = []
}

const log = (globalThis as any).__arcanaAuthorityLog as Array<{ api: string; file: string }>
const REPORT = process.env.ARCANA_AUTHORITY_REPORT

function originFile(): string {
  const stack = new Error().stack ?? ""
  for (const line of stack.split("\n")) {
    if (!line.includes(" at ")) continue
    const m = line.match(/\(?([^\s()]+(?:\.ts|\.tsx|\.js|\.mjs))(?::\d+:\d+)?\)?$/)
    const raw = m?.[1]
    if (!raw) continue
    if (raw.includes("authority-dynamic.preload") || raw.includes("node_modules") || raw.startsWith("bun:")) continue
    return raw
  }
  return "(unknown)"
}

function record(api: string): void {
  const entry = { api, file: originFile() }
  log.push(entry)
  if (REPORT) {
    try { appendFileSync(REPORT, JSON.stringify(entry) + "\n", "utf8") } catch {}
  }
}

// ── fetch ───────────────────────────────────────────────────────────────
const originalFetch = globalThis.fetch
const wrappedFetch = function wrappedFetch(input: any, init?: any) {
  record("fetch")
  return originalFetch.call(this, input, init)
}
;(globalThis as any).fetch = Object.assign(wrappedFetch, {
  preconnect: originalFetch.preconnect.bind(originalFetch),
}) satisfies typeof fetch

// ── Bun.spawn / spawnSync / write ───────────────────────────────────────
const bunAny = Bun as any
for (const api of ["spawn", "spawnSync"] as const) {
  if (typeof bunAny[api] !== "function") continue
  const original = bunAny[api].bind(Bun)
  bunAny[api] = function (...argv: unknown[]) {
    record(`Bun.${api}`)
    return original(...argv)
  }
}
if (typeof bunAny.write === "function") {
  const originalWrite = bunAny.write.bind(Bun)
  bunAny.write = function (...argv: unknown[]) {
    record("Bun.write")
    return originalWrite(...argv)
  }
}
