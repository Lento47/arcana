import fs from "fs/promises"
import os from "os"
import path from "path"

// Prevent temp test directories from being treated as inside an outer git repo
// (e.g. the user's home directory) when VCS discovery walks upward.
if (!process.env.GIT_CEILING_DIRECTORIES) process.env.GIT_CEILING_DIRECTORIES = os.tmpdir()

export const tmpdir = async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "opencode-core-test-")))
  return {
    path: dir,
    async [Symbol.asyncDispose]() {
      await remove(dir)
    },
  }
}

async function remove(dir: string, retries = 30): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch (error) {
    if (retries === 0 || !error || typeof error !== "object" || !("code" in error) || error.code !== "EBUSY")
      throw error
    Bun.gc(true)
    await Bun.sleep(100)
    return remove(dir, retries - 1)
  }
}
