import { cmd } from "./cmd"
import { UI } from "../ui"

const PROXY_URL = "https://proxy.arcana.otnelhq.com"
const DEV_KEY = "ARCANA-DEV-0000-0000-0000-000000000001"

export const ProxyCommand = cmd({
  command: "proxy",
  describe: "manage arcana AI proxy (route models through arcana's pooled keys)",
  builder: (yargs) =>
    yargs
      .command({
        command: "status",
        describe: "show proxy connection status and usage",
        async handler() {
          try {
            const key = process.env.ARCANA_PROXY_KEY ?? DEV_KEY
            const res = await fetch(`${PROXY_URL}/v1/health`, {
              headers: { Authorization: `Bearer ${key}` },
              signal: AbortSignal.timeout(5000),
            })
            const data = await res.json()
            if (data.status === "ok") {
              UI.println("✅ Proxy connected")
              UI.println(`   Endpoint: ${PROXY_URL}/v1`)
              UI.println(`   User: ${data.user}`)
              UI.println(`   Tier: ${data.tier}`)
            } else {
              UI.println("❌ Proxy not responding")
            }
          } catch {
            UI.println("❌ Cannot reach proxy server")
          }
        },
      })
      .command({
        command: "models [query]",
        describe: "list available models through the proxy",
        builder: (y) => y.positional("query", { describe: "optional search filter", type: "string" }),
        async handler(args: any) {
          try {
            const key = process.env.ARCANA_PROXY_KEY ?? DEV_KEY
            const res = await fetch(`${PROXY_URL}/v1/models`, {
              headers: { Authorization: `Bearer ${key}` },
              signal: AbortSignal.timeout(10000),
            })
            const data = await res.json()
            const models = data.data ?? []
            if (!models.length) { UI.println("No models available."); return }
            const q = args.query ? String(args.query).toLowerCase() : ""
            const filtered = q ? models.filter((m: any) => m.id?.toLowerCase().includes(q)) : models
            UI.println(`⛧ Models (${filtered.length} available)`)
            for (const m of filtered.slice(0, 30)) {
              const price = m.pricing?.prompt ? `$${m.pricing.prompt}/token` : ""
              UI.println(`  ${m.id}${price ? " " + price : ""}`)
            }
            if (filtered.length > 30) UI.println(`  ... and ${filtered.length - 30} more`)
          } catch (e) {
            UI.println(`Error: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      .command({
        command: "usage",
        describe: "show your proxy usage for today",
        async handler() {
          try {
            const key = process.env.ARCANA_PROXY_KEY ?? DEV_KEY
            const res = await fetch(`${PROXY_URL}/v1/usage`, {
              headers: { Authorization: `Bearer ${key}` },
              signal: AbortSignal.timeout(5000),
            })
            const data = await res.json()
            UI.println("⛧ Proxy Usage Today")
            UI.println(`   Tokens in:  ${(data.tokensIn ?? 0).toLocaleString()}`)
            UI.println(`   Tokens out: ${(data.tokensOut ?? 0).toLocaleString()}`)
            UI.println(`   Requests:   ${(data.requests ?? 0).toLocaleString()}`)
          } catch (e) {
            UI.println(`Error: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      .demandCommand(),
  async handler() {},
})
