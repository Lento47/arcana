export * from "./client.js"
export * from "./server.js"

import { createOpencodeClient } from "./client.js"
import { createOpencodeServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

type ArcanaOptions = ServerOptions & { baseUrl?: string }

/** Create an arcana server + typed API client in one call. */
export async function createArcana(options?: ArcanaOptions) {
  if (options?.baseUrl) {
    const client = createOpencodeClient({ baseUrl: options.baseUrl })
    return { client, server: undefined }
  }

  const server = await createOpencodeServer({ ...options })
  const client = createOpencodeClient({ baseUrl: server.url })
  return { client, server }
}

/** @deprecated Use {@link createArcana} instead. */
export const createOpencode = createArcana
