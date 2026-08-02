/**
 * D-1 (node side): durable node identity file.
 *
 * Restart-safe local key/certificate store for the co-located node. The
 * secret key is stored base64url in the workspace state directory; OS-level
 * protection/encryption is a deployment concern (BLK-D-07).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type NodeIdentityFile = {
  nodeId: string
  trustDomain: string
  secretKeyB64: string
  publicKeyB64: string
  nodeKeyEpoch: number
  certificate: Record<string, unknown>
  enrolledAt: string
}

export function nodeIdentityPath(directory: string): string {
  return join(directory, ".arcana", "node-identity.json")
}

export function loadNodeIdentity(directory: string): NodeIdentityFile | undefined {
  const path = nodeIdentityPath(directory)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, "utf8")) as NodeIdentityFile
  } catch {
    return undefined
  }
}

export function saveNodeIdentity(directory: string, identity: NodeIdentityFile): void {
  const path = nodeIdentityPath(directory)
  mkdirSync(join(directory, ".arcana"), { recursive: true })
  writeFileSync(path, JSON.stringify(identity, null, 2), { mode: 0o600 })
}
