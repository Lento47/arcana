import * as NodeFS from "node:fs"
import * as NodePath from "node:path"
import * as Crypto from "node:crypto"

export interface CredentialStoreConfig {
  readonly storePath: string
  readonly keyPath: string
}

export interface CredentialStore {
  readonly load: () => string | null
  readonly save: (proxyKey: string) => void
  readonly remove: () => void
  readonly migrateFromLegacy: (legacyPath: string) => void
}

const ensureDir = (path: string): void => {
  const directory = NodePath.dirname(path)
  NodeFS.mkdirSync(directory, { recursive: true, mode: 0o700 })
  try {
    NodeFS.chmodSync(directory, 0o700)
  } catch {
    // Windows and some mounted filesystems do not expose POSIX mode bits.
  }
}

const chmod0600 = (path: string): void => {
  try {
    NodeFS.chmodSync(path, 0o600)
  } catch {
    // non-fatal
  }
}

const readText = (path: string): string | null => {
  try {
    return NodeFS.readFileSync(path, "utf8")
  } catch {
    return null
  }
}

const writeText = (path: string, content: string): void => {
  ensureDir(path)
  const temporary = `${path}.${process.pid}.${Crypto.randomBytes(6).toString("hex")}.tmp`
  try {
    NodeFS.writeFileSync(temporary, content, { mode: 0o600, flag: "wx" })
    chmod0600(temporary)
    NodeFS.renameSync(temporary, path)
    chmod0600(path)
  } finally {
    try {
      NodeFS.unlinkSync(temporary)
    } catch {
      // The successful rename consumes the temporary file.
    }
  }
}

const readKey = (keyPath: string): Buffer | null => {
  const existing = readText(keyPath)
  if (!existing) return null
  const key = Buffer.from(existing.trim(), "base64")
  return key.length === 32 ? key : null
}

const getOrCreateKey = (keyPath: string): Buffer => {
  const existing = readKey(keyPath)
  if (existing) return existing
  const newKey = Crypto.randomBytes(32)
  writeText(keyPath, newKey.toString("base64"))
  return newKey
}

const encrypt = (plaintext: string, key: Buffer): string => {
  const iv = Crypto.randomBytes(12)
  const cipher = Crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64")
}

const decrypt = (ciphertextB64: string, key: Buffer): string | null => {
  const data = Buffer.from(ciphertextB64, "base64")
  if (data.length < 12 + 16) {
    return null
  }
  const iv = data.subarray(0, 12)
  const authTag = data.subarray(data.length - 16)
  const ciphertext = data.subarray(12, data.length - 16)
  const decipher = Crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
  return plaintext
}

export const makeCredentialStore = (config: CredentialStoreConfig): CredentialStore => {
  const { storePath, keyPath } = config

  const load = (): string | null => {
    const stored = readText(storePath)
    if (!stored) return null
    const key = readKey(keyPath)
    if (!key) return null
    try {
      return decrypt(stored.trim(), key)
    } catch {
      return null
    }
  }

  const save = (proxyKey: string): void => {
    const key = getOrCreateKey(keyPath)
    const encrypted = encrypt(proxyKey, key)
    writeText(storePath, encrypted)
  }

  const remove = (): void => {
    try {
      NodeFS.unlinkSync(storePath)
    } catch {
      // non-fatal
    }
    try {
      NodeFS.unlinkSync(keyPath)
    } catch {
      // non-fatal
    }
  }

  const migrateFromLegacy = (legacyPath: string): void => {
    const legacy = readText(legacyPath)
    if (!legacy) {
      return
    }
    const trimmed = legacy.trim()
    if (!trimmed) {
      return
    }
    save(trimmed)
    if (load() !== trimmed) {
      throw new Error("Credential migration verification failed")
    }
    try {
      NodeFS.unlinkSync(legacyPath)
    } catch {
      // non-fatal
    }
  }

  return { load, save, remove, migrateFromLegacy }
}
