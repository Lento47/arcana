import { Effect } from "effect"
import { Hono } from "hono"

type Env = {
  Vault: {
    listOrgSessions: (orgId: string) => Promise<Array<{ id: string; title: string; created_at: number; member: string }>>
    getSession: (sessionId: string) => Promise<any>
  }
}

export function vaultRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  app.get("/api/team/status", async (c) => {
    return c.json({ status: "ok", module: "vault" })
  })

  app.get("/api/team/:orgId/sessions", async (c) => {
    const orgId = c.req.param("orgId")
    const sessions = await c.env.Vault.listOrgSessions(orgId)
    return c.json({ sessions })
  })

  app.get("/api/team/:orgId/sessions/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId")
    const session = await c.env.Vault.getSession(sessionId)
    if (!session) return c.json({ error: "not_found" }, 404)
    return c.json({ session })
  })

  return app
}
