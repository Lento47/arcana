import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeCredentialStore } from "./credential-store"

function withStore(run: (input: {
  root: string
  storePath: string
  keyPath: string
  store: ReturnType<typeof makeCredentialStore>
}) => void): void {
  const root = mkdtempSync(join(tmpdir(), "arcana-credential-store-"))
  const storePath = join(root, "credential_store")
  const keyPath = join(root, "credential_key")
  try {
    run({ root, storePath, keyPath, store: makeCredentialStore({ storePath, keyPath }) })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe("credential store", () => {
  test("a read-only miss does not materialize a key or store", () => {
    withStore(({ keyPath, storePath, store }) => {
      expect(store.load()).toBeNull()
      expect(existsSync(keyPath)).toBe(false)
      expect(existsSync(storePath)).toBe(false)
    })
  })

  test("round-trips a credential without persisting plaintext", () => {
    withStore(({ keyPath, storePath, store }) => {
      store.save("proxy-secret-value")
      expect(store.load()).toBe("proxy-secret-value")
      expect(readFileSync(storePath, "utf8")).not.toContain("proxy-secret-value")
      expect(readFileSync(keyPath, "utf8")).not.toContain("proxy-secret-value")
    })
  })

  test("migrates legacy plaintext only after a verified secure write", () => {
    withStore(({ root, store }) => {
      const legacyPath = join(root, "proxy_key")
      writeFileSync(legacyPath, " legacy-secret \n", "utf8")
      store.migrateFromLegacy(legacyPath)
      expect(store.load()).toBe("legacy-secret")
      expect(existsSync(legacyPath)).toBe(false)
    })
  })

  test("returns null for corrupt ciphertext", () => {
    withStore(({ storePath, store }) => {
      store.save("valid-secret")
      writeFileSync(storePath, "not-valid-ciphertext", "utf8")
      expect(store.load()).toBeNull()
    })
  })
})
