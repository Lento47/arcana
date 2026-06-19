export type ArtifactType = "markdown" | "code" | "svg" | "html" | "diagram" | "react"

export interface ArtifactVersion {
  version: number
  content: string
  created_at: number
  session_id?: string
}

export interface ArtifactInfo {
  id: string
  title: string
  type: ArtifactType
  tags: string[]
  session_id?: string
  versions: ArtifactVersion[]
  current_version: number
  created_at: number
  updated_at: number
}

export function createArtifact(
  id: string,
  title: string,
  content: string,
  type: ArtifactType = "markdown",
  session_id?: string,
  tags: string[] = [],
): ArtifactInfo {
  const now = Date.now()
  return {
    id,
    title,
    type,
    tags,
    session_id,
    versions: [{ version: 1, content, created_at: now, session_id }],
    current_version: 1,
    created_at: now,
    updated_at: now,
  }
}

export function addVersion(artifact: ArtifactInfo, content: string, session_id?: string): ArtifactInfo {
  const nextVersion = artifact.versions.length + 1
  artifact.versions.push({ version: nextVersion, content, created_at: Date.now(), session_id })
  artifact.current_version = nextVersion
  artifact.updated_at = Date.now()
  return artifact
}

export function getVersion(artifact: ArtifactInfo, version?: number): ArtifactVersion | undefined {
  if (version === undefined) {
    return artifact.versions.find((v) => v.version === artifact.current_version)
  }
  return artifact.versions.find((v) => v.version === version)
}
