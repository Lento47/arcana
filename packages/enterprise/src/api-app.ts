import { Hono } from "hono"
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi"
import { validator } from "hono-openapi"
import z from "zod"
import { cors } from "hono/cors"
import { Share } from "./core/share"
import { MemorySync, type SharedFact } from "./core/memory-sync"
import { forwardToEngine, resolveEngineBaseURL } from "./core/enterprise-proxy"

export const app = new Hono()

app
  .basePath("/api")
  .use("/enterprise/*", (c) =>
    forwardToEngine(c.req.raw, resolveEngineBaseURL(process.env)),
  )
  .use(
    cors({
      origin: process.env.ARCANA_CONSOLE_ORIGIN?.trim() || "",
      credentials: Boolean(process.env.ARCANA_CONSOLE_ORIGIN?.trim()),
    }),
  )
  .get(
    "/doc",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "Arcana Enterprise API",
          version: "1.0.0",
          description: "Arcana Enterprise API endpoints",
        },
        openapi: "3.1.1",
      },
    }),
  )
  .post(
    "/share",
    describeRoute({
      description: "Create a share",
      operationId: "share.create",
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: resolver(
                z
                  .object({
                    id: z.string(),
                    url: z.string(),
                    secret: z.string(),
                  })
                  .meta({ ref: "Share" }),
              ),
            },
          },
        },
      },
    }),
    validator("json", z.object({ sessionID: z.string() })),
    async (c) => {
      const body = c.req.valid("json")
      const share = await Share.create({ sessionID: body.sessionID })
      const protocol = c.req.header("x-forwarded-proto") ?? c.req.header("x-forwarded-protocol") ?? "https"
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host")
      return c.json({
        id: share.id,
        secret: share.secret,
        url: `${protocol}://${host}/share/${share.id}`,
      })
    },
  )
  .post(
    "/share/:shareID/sync",
    describeRoute({
      description: "Sync share data",
      operationId: "share.sync",
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: resolver(z.object({})),
            },
          },
        },
      },
    }),
    validator("param", z.object({ shareID: z.string() })),
    validator("json", z.object({ secret: z.string(), data: Share.Data.array() })),
    async (c) => {
      const { shareID } = c.req.valid("param")
      const body = c.req.valid("json")
      await Share.sync({
        share: { id: shareID, secret: body.secret },
        data: body.data,
      })
      return c.json({})
    },
  )
  .get(
    "/share/:shareID/data",
    describeRoute({
      description: "Get share data",
      operationId: "share.data",
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: resolver(z.array(Share.Data)),
            },
          },
        },
      },
    }),
    validator("param", z.object({ shareID: z.string() })),
    async (c) => {
      const { shareID } = c.req.valid("param")
      c.header("Cache-Control", "public, max-age=30, s-maxage=300, stale-while-revalidate=86400")
      return c.json(await Share.data(shareID))
    },
  )
  .delete(
    "/share/:shareID",
    describeRoute({
      description: "Remove a share",
      operationId: "share.remove",
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: resolver(z.object({})),
            },
          },
        },
      },
    }),
    validator("param", z.object({ shareID: z.string() })),
    validator("json", z.object({ secret: z.string() })),
    async (c) => {
      const { shareID } = c.req.valid("param")
      const body = c.req.valid("json")
      await Share.remove({ id: shareID, secret: body.secret })
      return c.json({})
    },
  )
  .post("/api/team/:orgId/memory/sync", async (c) => {
    try {
      const orgId = c.req.param("orgId")
      const body = await c.req.json() as { facts: SharedFact[]; orgId?: string }
      if (!body.facts?.length) return c.json({ error: "no_facts" }, 400)
      const result = MemorySync.mergeFacts(orgId, body.facts)
      return c.json({ merged: result.merged, conflicts: result.conflicts, total: MemorySync.getOrgFacts(orgId).length })
    } catch (e) {
      return c.json({ error: String(e) }, 500)
    }
  })
  .get("/api/team/:orgId/memory/facts", async (c) => {
    const orgId = c.req.param("orgId")
    const facts = MemorySync.getOrgFacts(orgId)
    return c.json({ facts })
  })

const auditStore: Array<{
  id: string
  org_id?: string
  actor: string
  action: string
  resource?: string
  detail?: any
  tool?: string
  tool_args?: any
  tool_result?: string
  duration_ms?: number
  tokens_used?: number
  cost?: number
  time_created: number
}> = []

app.post("/api/team/:orgId/audit/events", async (c) => {
  try {
    const orgId = c.req.param("orgId")
    const body = await c.req.json() as { events: any[] }
    if (!body.events?.length) return c.json({ error: "no_events" }, 400)
    const now = Date.now()
    for (const evt of body.events) {
      auditStore.push({ ...evt, org_id: orgId, time_created: now })
    }
    const orgEvents = auditStore.filter((e) => e.org_id === orgId)
    if (orgEvents.length > 10000) {
      const excess = orgEvents.length - 10000
      for (let i = 0; i < excess; i++) {
        const idx = auditStore.indexOf(orgEvents[i]!)
        if (idx >= 0) auditStore.splice(idx, 1)
      }
    }
    return c.json({ accepted: body.events.length })
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

app.get("/api/team/:orgId/audit/events", async (c) => {
  const orgId = c.req.param("orgId")
  const limit = Math.min(Number(c.req.query("limit") ?? "100"), 1000)
  const offset = Number(c.req.query("offset") ?? "0")
  const action = c.req.query("action")
  const actor = c.req.query("actor")

  let events = auditStore.filter((e) => e.org_id === orgId)
  if (action) events = events.filter((e) => e.action === action)
  if (actor) events = events.filter((e) => e.actor === actor)
  events.sort((a, b) => b.time_created - a.time_created)

  return c.json({
    events: events.slice(offset, offset + limit),
    total: events.length,
    limit,
    offset,
  })
})
