import { cmd } from "./cmd"
import { UI } from "../ui"

const PROXY_URL = "https://proxy.arcana.otnelhq.com"
const FALLBACK = "https://arcana-proxy.lejzerv.workers.dev"
const DEV_KEY = "ARCANA-DEV-0000-0000-0000-000000000001"

async function proxyFetch(path: string, opts?: any): Promise<any> {
  const key = process.env.ARCANA_PROXY_KEY ?? DEV_KEY
  const timeout = opts?.signal ? undefined : 15000
  const urls = [`${PROXY_URL}${path}`, `${FALLBACK}${path}`]
  for (const base of urls) {
    try {
      const res = await fetch(base, {
        ...opts,
        headers: { ...opts?.headers, Authorization: `Bearer ${key}` },
        ...(timeout ? { signal: AbortSignal.timeout(timeout) } : {}),
      })
      return await res.json()
    } catch {}
  }
  throw new Error("All proxy servers unreachable")
}

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
            const data = await proxyFetch("/v1/health")
            if (data.status === "ok") {
              UI.println("✅ Proxy connected")
              UI.println(`   Endpoint: ${PROXY_URL}/v1/chat/completions`)
              UI.println(`   Account: ${data.user}`)
              UI.println(`   Plan: ${data.tier}`)
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
        describe: "list available models through the proxy — filter by model name or use --provider",
        builder: (y) =>
          y
            .positional("query", { describe: "search by model name", type: "string" })
            .option("provider", { alias: "p", type: "string", describe: "filter by provider (e.g. openai, anthropic, deepseek, google)" }),
        async handler(args: any) {
          try {
            const data = await proxyFetch("/v1/models", { signal: AbortSignal.timeout(10000) })
            const models = data.data ?? []
            if (!models.length) { UI.println("No models available."); return }
            const q = args.query ? String(args.query).toLowerCase() : ""
            const p = args.provider ? String(args.provider).toLowerCase() : ""
            let filtered = models
            if (q) filtered = filtered.filter((m: any) => m.id?.toLowerCase().includes(q))
            if (p) filtered = filtered.filter((m: any) => m.id?.toLowerCase().startsWith(p + "/"))
            if (!filtered.length) { UI.println(`No models match${p ? " provider " + p : ""}${q ? " query " + q : ""}.`); return }
            UI.println(`⛧ Models (${filtered.length} available)`)
            const max = p ? filtered.length : 50
            for (const m of filtered.slice(0, max)) {
              const free = m.pricing?.prompt === "0" ? " (free)" : ""
              UI.println(`  ${m.id}${free}`)
            }
            if (filtered.length > max) UI.println(`  ... and ${filtered.length - max} more — use --provider to narrow`)
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
            const data = await proxyFetch("/v1/usage")
            UI.println("⛧ Proxy Usage Today")
            UI.println(`   Tokens in:  ${(data.tokensIn ?? 0).toLocaleString()}`)
            UI.println(`   Tokens out: ${(data.tokensOut ?? 0).toLocaleString()}`)
            UI.println(`   Requests:   ${(data.requests ?? 0).toLocaleString()}`)
          } catch (e) {
            UI.println(`Error: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      .command({
        command: "balance",
        describe: "check your pay-as-you-go credit balance",
        async handler() {
          try {
            const [data, health] = await Promise.all([
              proxyFetch("/v1/balance"),
              proxyFetch("/v1/health"),
            ])
            UI.println("⛧ Proxy Balance")
            if (health.tier === "enterprise") {
              UI.println("   Credits: Unlimited (Enterprise plan)")
            } else {
              UI.println(`   Credits: $${data.dollars}`)
            }
          } catch (e) {
            UI.println(`Error: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      .command({
        command: "buy <amount>",
        describe: "buy credits via PayPal (min $5)",
        builder: (y) => y.positional("amount", { describe: "USD amount", type: "number" }),
        async handler(args: any) {
          try {
            // Bind the order to the buyer's account so credits land on the same key
            // /v1/balance reads, and so capture is authorized for real license keys.
            const key = process.env.ARCANA_PROXY_KEY ?? DEV_KEY
            const data = await proxyFetch("/v1/pay/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ amount: args.amount, userId: key }),
            })
            if (data.approvalUrl) {
              UI.println(`⛧ PayPal checkout ready`)
              UI.println(`   Amount: $${args.amount}`)
              UI.println(`   Open this URL in your browser:`)
              UI.println(`   ${data.approvalUrl}`)
              UI.println(``)
              UI.println(`After approving, run: arcana proxy capture ${data.orderId}`)
            } else {
              UI.println(`Error: ${data.error ?? "unknown"}`)
            }
          } catch (e) {
            UI.println(`Error: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      .command({
        command: "capture <orderId>",
        describe: "capture PayPal payment and credit your account",
        builder: (y) => y.positional("orderId", { describe: "PayPal order ID", type: "string" }),
        async handler(args: any) {
          try {
            // Worker credits the authenticated caller's account (from the Bearer key),
            // so no userId is needed in the body — real license keys are authorized.
            const data = await proxyFetch("/v1/pay/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: args.orderId }),
            })
            if (data.success) {
              UI.println(`✅ Payment captured!`)
              UI.println(`   Credits added: $${(data.creditsAdded / 100).toFixed(2)}`)
              UI.println(`   New balance: $${(data.newBalance / 100).toFixed(2)}`)
            } else {
              UI.println(`Error: ${data.error ?? "capture failed"}`)
            }
          } catch (e) {
            UI.println(`Error: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      .demandCommand(),
  async handler() {},
})
