import { AwsClient } from "aws4fetch"
import { promises as fsp } from "node:fs"
import path from "node:path"
import { lazy } from "@arcana/core/util/lazy"

export namespace Storage {
  export interface Adapter {
    read(path: string): Promise<string | undefined>
    write(path: string, value: string): Promise<void>
    remove(path: string): Promise<void>
    list(options?: { prefix?: string; limit?: number; after?: string; before?: string }): Promise<string[]>
  }

  function createAdapter(client: AwsClient, endpoint: string, bucket: string): Adapter {
    const base = `${endpoint}/${bucket}`
    return {
      async read(path: string): Promise<string | undefined> {
        const response = await client.fetch(`${base}/${path}`)
        if (response.status === 404) return undefined
        if (!response.ok) throw new Error(`Failed to read ${path}: ${response.status}`)
        return response.text()
      },

      async write(path: string, value: string): Promise<void> {
        const response = await client.fetch(`${base}/${path}`, {
          method: "PUT",
          body: value,
          headers: {
            "Content-Type": "application/json",
          },
        })
        if (!response.ok) throw new Error(`Failed to write ${path}: ${response.status}`)
      },

      async remove(path: string): Promise<void> {
        const response = await client.fetch(`${base}/${path}`, {
          method: "DELETE",
        })
        if (!response.ok) throw new Error(`Failed to remove ${path}: ${response.status}`)
      },

      async list(options?: { prefix?: string; limit?: number; after?: string; before?: string }): Promise<string[]> {
        const prefix = options?.prefix || ""
        const params = new URLSearchParams({ "list-type": "2", prefix })
        if (options?.limit) params.set("max-keys", options.limit.toString())
        if (options?.after) {
          const afterPath = prefix + options.after + ".json"
          params.set("start-after", afterPath)
        }
        const response = await client.fetch(`${base}?${params}`)
        if (!response.ok) throw new Error(`Failed to list ${prefix}: ${response.status}`)
        const xml = await response.text()
        const keys: string[] = []
        const regex = /<Key>([^<]+)<\/Key>/g
        let match
        while ((match = regex.exec(xml)) !== null) {
          keys.push(match[1])
        }
        if (options?.before) {
          const beforePath = prefix + options.before + ".json"
          return keys.filter((key) => key < beforePath)
        }
        return keys
      },
    }
  }

  function s3(): Adapter {
    const bucket = process.env.ARCANA_STORAGE_BUCKET!
    const region = process.env.ARCANA_STORAGE_REGION || "us-east-1"
    const client = new AwsClient({
      region,
      accessKeyId: process.env.ARCANA_STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.ARCANA_STORAGE_SECRET_ACCESS_KEY!,
    })
    return createAdapter(client, `https://s3.${region}.amazonaws.com`, bucket)
  }

  function r2() {
    const accountId = process.env.ARCANA_STORAGE_ACCOUNT_ID!
    const client = new AwsClient({
      accessKeyId: process.env.ARCANA_STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.ARCANA_STORAGE_SECRET_ACCESS_KEY!,
    })
    return createAdapter(client, `https://${accountId}.r2.cloudflarestorage.com`, process.env.ARCANA_STORAGE_BUCKET!)
  }

  /**
   * Filesystem adapter for local development and tests. Selected with
   * `ARCANA_STORAGE_ADAPTER=local`; `ARCANA_STORAGE_LOCAL_DIR` sets the root
   * (defaults to `<cwd>/.arcana-storage`). Mirrors the S3 adapter's
   * lexicographic key semantics so callers behave identically in both modes.
   */
  function local(): Adapter {
    const root = path.resolve(process.env.ARCANA_STORAGE_LOCAL_DIR || path.join(process.cwd(), ".arcana-storage"))
    const target = (key: string) => {
      const resolved = path.resolve(root, key)
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error(`Storage key escapes local root: ${key}`)
      }
      return resolved
    }
    return {
      async read(key: string): Promise<string | undefined> {
        try {
          return await fsp.readFile(target(key), "utf8")
        } catch (error) {
          if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ENOENT") {
            return undefined
          }
          throw error
        }
      },
      async write(key: string, value: string): Promise<void> {
        const file = target(key)
        await fsp.mkdir(path.dirname(file), { recursive: true })
        await fsp.writeFile(file, value, "utf8")
      },
      async remove(key: string): Promise<void> {
        await fsp.rm(target(key), { force: true })
      },
      async list(options?: { prefix?: string; limit?: number; after?: string; before?: string }): Promise<string[]> {
        const prefix = options?.prefix || ""
        const start = options?.after ? prefix + options.after + ".json" : undefined
        const before = options?.before ? prefix + options.before + ".json" : undefined
        const base = path.join(root, ...prefix.split("/").filter(Boolean))
        const keys: string[] = []
        const walk = async (dir: string, rel: string) => {
          const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
          entries.sort((a, b) => a.name.localeCompare(b.name))
          for (const entry of entries) {
            const full = path.join(dir, entry.name)
            const relPath = rel ? `${rel}/${entry.name}` : entry.name
            if (entry.isDirectory()) await walk(full, relPath)
            else if (entry.isFile() && entry.name.endsWith(".json")) keys.push(relPath)
          }
        }
        await walk(base, prefix.replace(/\/$/, ""))
        keys.sort((a, b) => a.localeCompare(b))
        const filtered = keys.filter((key) => (!start || key > start) && (!before || key < before))
        return options?.limit ? filtered.slice(0, options.limit) : filtered
      },
    }
  }

  const adapter = lazy(() => {
    const type = process.env.ARCANA_STORAGE_ADAPTER
    if (type === "r2") return r2()
    if (type === "s3") return s3()
    if (type === "local") return local()
    throw new Error("No storage adapter configured")
  })

  function resolve(key: string[]) {
    return key.join("/") + ".json"
  }

  export async function read<T>(key: string[]) {
    const result = await adapter().read(resolve(key))
    if (!result) return undefined
    return JSON.parse(result) as T
  }

  export function write<T>(key: string[], value: T) {
    return adapter().write(resolve(key), JSON.stringify(value))
  }

  export function remove(key: string[]) {
    return adapter().remove(resolve(key))
  }

  export async function list(options?: { prefix?: string[]; limit?: number; after?: string; before?: string }) {
    const p = options?.prefix ? options.prefix.join("/") + (options.prefix.length ? "/" : "") : ""
    const result = await adapter().list({
      prefix: p,
      limit: options?.limit,
      after: options?.after,
      before: options?.before,
    })
    return result.map((x) => x.replace(/\.json$/, "").split("/"))
  }

  export async function update<T>(key: string[], fn: (draft: T) => void) {
    const val = await read<T>(key)
    if (!val) throw new Error("Not found")
    fn(val)
    await write(key, val)
    return val
  }
}
