export * from "./client.js"
export * from "./server.js"

import { createOpencodeClient } from "./client.js"
import { createOpencodeServer } from "./server.js"
import type { ServerOptions } from "./server.js"

async function createOpencode(options?: ServerOptions) {
  return createArcana(options)
}

/** Create an arcana server + typed API client in one call. */
export async function createArcana(options?: ServerOptions) {
  const server = await createOpencodeServer({
    ...options,
  })

  const client = createOpencodeClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}

/** @deprecated Use {@link createArcana} instead. */
export { createOpencode }
