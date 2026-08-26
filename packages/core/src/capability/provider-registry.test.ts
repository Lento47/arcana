import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  recordProviderLoad,
  approveProvider,
  getProviderRecord,
  allProviderRecords,
  providerKey,
  defaultRegistryPath,
  driftSummary,
  saveProviderRegistry,
} from "./provider-registry"
import { canonicalJson } from "./supply-chain"

function tempRegistryPath(): string {
  return join(mkdtempSync(join(tmpdir(), "k10-registry-")), "providers.json")
}

const baseInput = {
  kind: "skill" as const,
  providerId: "my-skill",
  version: "unversioned",
  manifestJson: '{"name":"my-skill","description":"d"}',
  schemaDeclarations: "skill body v1",
  description: "d",
}

describe("provider registry (K10)", () => {
  test("first load is a baseline grant: new, no drift", () => {
    const path = tempRegistryPath()
    const report = recordProviderLoad(baseInput, path)
    expect(report.isNew).toBe(true)
    expect(report.drift.drifted).toBe(false)
    expect(report.key).toBe("skill:my-skill")
    // content_hash covers the body
    expect(report.identity.content_hash).toBeTruthy()
  })

  test("identical reload reports no drift", () => {
    const path = tempRegistryPath()
    recordProviderLoad(baseInput, path)
    const second = recordProviderLoad(baseInput, path)
    expect(second.isNew).toBe(false)
    expect(second.drift.drifted).toBe(false)
  })

  test("content change ⇒ drift with changed fields", () => {
    const path = tempRegistryPath()
    recordProviderLoad(baseInput, path)
    const drifted = recordProviderLoad(
      { ...baseInput, schemaDeclarations: "skill body v2 — TAMPERED", description: "d" },
      path,
    )
    expect(drifted.drift.drifted).toBe(true)
    expect(drifted.drift.changedFields).toContain("content_hash")
    const rec = getProviderRecord(providerKey("skill", "my-skill"), path)
    expect(rec?.last_load_drifted).toBe(true)
  })

  test("description-only change flags description_hash drift", () => {
    const path = tempRegistryPath()
    recordProviderLoad(baseInput, path)
    const drifted = recordProviderLoad({ ...baseInput, description: "changed description" }, path)
    expect(drifted.drift.drifted).toBe(true)
    expect(drifted.drift.changedFields).toEqual(["description_hash"])
  })

  test("approveProvider re-pins baseline and clears drift", () => {
    const path = tempRegistryPath()
    recordProviderLoad(baseInput, path)
    recordProviderLoad({ ...baseInput, schemaDeclarations: "v2" }, path)
    expect(driftSummary(path).drifted).toBe(1)
    const ok = approveProvider("skill:my-skill", path)
    expect(ok).toBe(true)
    expect(driftSummary(path).drifted).toBe(0)
    // Same content now loads clean
    const third = recordProviderLoad({ ...baseInput, schemaDeclarations: "v2" }, path)
    expect(third.drift.drifted).toBe(false)
  })

  test("approveProvider returns false for unknown keys", () => {
    const path = tempRegistryPath()
    expect(approveProvider("skill:nope", path)).toBe(false)
  })

  test("registry persists to disk and survives re-hydration", () => {
    const path = tempRegistryPath()
    recordProviderLoad(baseInput, path)
    expect(existsSync(path)).toBe(true)
    const raw = JSON.parse(readFileSync(path, "utf8"))
    expect(raw.version).toBe(1)
    expect(Object.keys(raw.providers)).toContain("skill:my-skill")
    // Fresh process simulation: force re-hydration by reading through a new call chain.
    // (hydrate() caches by path; a direct file check above proves durability.)
    expect(allProviderRecords(path).length).toBe(1)
  })

  test("different providers tracked independently", () => {
    const path = tempRegistryPath()
    recordProviderLoad(baseInput, path)
    recordProviderLoad(
      { ...baseInput, kind: "mcp_server" as const, providerId: "srv/tool1" },
      path,
    )
    expect(allProviderRecords(path).length).toBe(2)
  })

  test("canonicalJson is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 4, y: 5 }] } })).toBe(
      canonicalJson({ a: { c: [3, { y: 5, z: 4 }], d: 2 }, b: 1 }),
    )
  })

  test("default registry path lands in user config dir", () => {
    expect(defaultRegistryPath()).toContain("arcana")
    expect(defaultRegistryPath().endsWith("provider-identities.json")).toBe(true)
  })
})
