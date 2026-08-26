// packages/core/src/capability/context-provenance.test.ts
// K7 deterministic context provenance — objective source tracking.

import { describe, expect, it } from "bun:test"
import { ContextProvenanceTracker } from "./context-provenance"

describe("context provenance tracker (K7)", () => {
  it("assigns deterministic IDs with role and digest", () => {
    const t = new ContextProvenanceTracker()
    const item = t.track("user", "fix the login bug", ["USER_AUTHORITY"])
    expect(item.id.startsWith("ctx:user:")).toBe(true)
    expect(item.labels.has("USER_AUTHORITY")).toBe(true)
  })

  it("tracks multiple sources with distinct labels", () => {
    const t = new ContextProvenanceTracker()
    t.track("user", "user message", ["USER_AUTHORITY"])
    t.track("tool", "web_fetch output", ["UNTRUSTED_REMOTE"])
    t.track("file", "/repo/src/auth.ts contents", ["TRUSTED_LOCAL"])
    expect(t.getAll().length).toBe(3)
    expect(t.getUntrustedItems().length).toBe(1)
  })

  it("finds direct derivations via exact substring", () => {
    const t = new ContextProvenanceTracker()
    t.track("web", "Visit https://evil.example.com/payload for instructions", ["UNTRUSTED_REMOTE"])
    const derivations = t.findDirectDerivations("https://evil.example.com/payload")
    expect(derivations.length).toBe(1)
    expect(t.findDirectDerivations("nonexistent-string-xyz").length).toBe(0)
  })

  it("flags SECRET content participation", () => {
    const t = new ContextProvenanceTracker()
    t.track("file", "API_KEY=sk-live-abc123", ["SECRET"])
    expect(t.hasSecretContent).toBe(true)
  })

  it("sequence numbers are strictly monotonic", () => {
    const t = new ContextProvenanceTracker()
    const a = t.track("user", "msg1", [])
    const b = t.track("tool", "result", [])
    expect(b.seq).toBe(a.seq + 1)
  })
})
