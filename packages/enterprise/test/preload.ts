// Enterprise core storage tests exercise the Storage/Share layers without
// cloud credentials: route them through the filesystem adapter in a temp dir.
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll } from "bun:test"

const dir = await mkdtemp(path.join(tmpdir(), "arcana-storage-"))
process.env.ARCANA_STORAGE_ADAPTER = "local"
process.env.ARCANA_STORAGE_LOCAL_DIR = dir

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})
