import { createMemo, createSignal } from "solid-js"
import { homedir } from "node:os"
import { join } from "node:path"
import { readdirSync, readFileSync, existsSync } from "node:fs"

export type ArtifactType = "markdown" | "code" | "svg" | "html" | "diagram"

export type ArtifactSummary = {
  id: string
  title: string
  type: ArtifactType
  version: number
  versions: number
  tags: string[]
  updated_at: number
}

export type ArtifactFull = ArtifactSummary & {
  content: string
}

const ARTIFACTS_DIR = join(homedir(), ".arcana", "artifacts")

export function listArtifacts(sessionId?: string): ArtifactSummary[] {
  try {
    if (!existsSync(ARTIFACTS_DIR)) return []
    const files = readdirSync(ARTIFACTS_DIR).filter((f) => f.endsWith(".json"))
    const artifacts: ArtifactSummary[] = []
    for (const file of files) {
      try {
        const raw = readFileSync(join(ARTIFACTS_DIR, file), "utf8")
        const data = JSON.parse(raw)
        // Filter by session if specified
        if (sessionId && data.session_id && data.session_id !== sessionId) continue
        artifacts.push({
          id: data.id,
          title: data.title,
          type: data.type ?? "markdown",
          version: data.current_version ?? data.versions?.length ?? 1,
          versions: data.versions?.length ?? 1,
          tags: data.tags ?? [],
          updated_at: data.updated_at ?? data.created_at ?? 0,
        })
      } catch {}
    }
    return artifacts.sort((a, b) => b.updated_at - a.updated_at)
  } catch { return [] }
}

export function getArtifact(id: string, version?: number): ArtifactFull | null {
  try {
    const filePath = join(ARTIFACTS_DIR, `${id}.json`)
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, "utf8")
    const data = JSON.parse(raw)
    const targetVersion = version ?? data.current_version ?? 1
    const versionData = data.versions?.find((v: any) => v.version === targetVersion)
    if (!versionData) return null
    return {
      id: data.id,
      title: data.title,
      type: data.type ?? "markdown",
      version: targetVersion,
      versions: data.versions?.length ?? 1,
      tags: data.tags ?? [],
      updated_at: data.updated_at ?? data.created_at ?? 0,
      content: versionData.content,
    }
  } catch { return null }
}
