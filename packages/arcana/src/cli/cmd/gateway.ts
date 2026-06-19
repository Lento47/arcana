import type { CommandModule } from "yargs"
import { Gateway } from "@arcana/gateway"
import { loadConfig, getDataDir } from "../../config.js"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { AgentRunner } from "../../agent/runner.js"
import { registerBuiltinTools } from "../../agent/tools.js"
import { registerMcpTools } from "../../agent/mcp.js"

export const GatewayCommand: CommandModule = {
  command: "gateway",
  describe: "start the messaging gateway (Telegram, Discord, Slack, WhatsApp)",
  builder: (yargs) =>
    yargs
      .option("telegram-token", { type: "string", describe: "Telegram bot token (overrides config)" })
      .option("discord-token", { type: "string", describe: "Discord bot token (overrides config)" }),
  async handler(args) {
    const config = await loadConfig()

    const gatewayConfig = {
      ...(config.gateway ?? {}),
      ...(args.telegramToken ? { telegram: { token: String(args.telegramToken) } } : {}),
      ...(args.discordToken ? { discord: { token: String(args.discordToken) } } : {}),
    }

    if (!gatewayConfig.telegram && !gatewayConfig.discord && !gatewayConfig.slack && !gatewayConfig.whatsapp) {
      console.error("No platform configured. Set gateway config or pass --telegram-token / --discord-token.")
      process.exit(1)
    }

    const gateway = new Gateway()

    // Per-chat agent sessions — create a fresh runner per conversation
    const db = openMemoryDB(getDataDir(config))
    const memory = new MemoryStore(db)
    const sessions = new Map<string, { runner: AgentRunner; history: any[] }>()

    console.log("Starting arcana gateway…")
    await gateway.start(gatewayConfig, async (msg) => {
      let session = sessions.get(msg.chatId)
      if (!session) {
        const runner = new AgentRunner({
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey,
          utilityModel: config.utilityModel,
        })
        registerBuiltinTools(runner, memory, config.skillsDirs)
        registerMcpTools(runner).catch(() => {}) // MCP is best-effort
        runner.setSession(msg.chatId.slice(0, 12))
        session = { runner, history: [] }
        sessions.set(msg.chatId, session)
      }

      session.history.push({ role: "user" as const, content: msg.text })
      try {
        const result = await session.runner.run(session.history)
        session.history.push({ role: "assistant" as const, content: result.content })
        return result.content || "(no response)"
      } catch (err) {
        console.error(`[gateway:${msg.platform}] agent error:`, err)
        return `Error: ${err instanceof Error ? err.message : String(err)}`
      }
    })

    console.log(`Gateway active on: ${gateway.activePlatforms.join(", ")}`)
    console.log("Press Ctrl+C to stop.")

    process.on("SIGINT", async () => {
      console.log("\nShutting down gateway…")
      await gateway.stop()
      process.exit(0)
    })

    await new Promise(() => {})
  },
}
