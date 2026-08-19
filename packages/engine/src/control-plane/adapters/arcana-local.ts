import fs from "fs/promises"
import os from "os"
import path from "path"
import { Schema } from "effect"
import { ProjectV2 } from "@arcana/core/project"
import { type WorkspaceAdapter, type WorkspaceAdapterContext, WorkspaceInfo, type WorkspaceListedInfo } from "../types"

const ArcanaLocalConfig = Schema.Struct({
  name: WorkspaceInfo.fields.name,
  directory: Schema.String,
})
const decodeConfig = Schema.decodeUnknownSync(ArcanaLocalConfig)

function sanitizeName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace"
}

function arcanaHome(): string {
  return (
    process.env.ARCANA_HOME?.trim() ||
    process.env.ARCANA_TEST_HOME?.trim() ||
    path.join(os.homedir(), ".arcana")
  )
}

function workspaceDirectory(name: string) {
  return path.join(arcanaHome(), "workspaces", sanitizeName(name))
}

export const ArcanaLocalAdapter: WorkspaceAdapter = {
  name: "Arcana Workspace",
  description: "A self-contained local workspace under ~/.arcana/workspaces",
  async configure(info) {
    const directory = workspaceDirectory(info.name)
    return {
      ...info,
      name: sanitizeName(info.name),
      directory,
    }
  },
  async create(info) {
    const config = decodeConfig(info)
    await fs.mkdir(config.directory, { recursive: true })
  },
  async remove(info) {
    const config = decodeConfig(info)
    // Only remove empty sandbox directories to avoid accidental data loss.
    try {
      await fs.rmdir(config.directory)
    } catch {
      // Leave non-empty workspaces alone.
    }
  },
  async list(context) {
    const instance = context?.instance
    const root = path.join(arcanaHome(), "workspaces")
    const entries: WorkspaceListedInfo[] = []
    try {
      const items = await fs.readdir(root, { withFileTypes: true })
      for (const item of items) {
        if (!item.isDirectory()) continue
        const directory = path.join(root, item.name)
        entries.push({
          type: "arcana-local",
          name: item.name,
          directory,
          projectID: instance?.project.id ?? ProjectV2.ID.global,
        })
      }
    } catch {
      // Workspaces directory may not exist yet.
    }
    return entries
  },
  target(info) {
    const config = decodeConfig(info)
    return {
      type: "local",
      directory: config.directory,
    }
  },
}
