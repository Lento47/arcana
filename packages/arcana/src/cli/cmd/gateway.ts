import type { CommandModule } from "yargs"
import { Gateway } from "@arcana/gateway"
import { loadConfig, getDataDir } from "../../config.js"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import type { AgentRunner } from "../../agent/runner.js"
import { createDelegatedRunner } from "../../agent/delegated.js"

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
      process.exitCode = 1
      return
    }

    const gateway = new Gateway()

    // Per-chat agent sessions — createDelegatedRunner ensures M4 single tool path.
    const db = openMemoryDB(getDataDir(config))
    const memory = new MemoryStore(db)
    const sessions = new Map<string, { runner: AgentRunner; history: any[] }>()

    console.log("Starting arcana gateway…")
    await gateway.start(gatewayConfig, async (msg) => {
      let session = sessions.get(msg.chatId)
      if (!session) {
        const { runner } = await createDelegatedRunner({
          kind: "gateway",
          config: {
            provider: config.provider,
            model: config.model,
            apiKey: config.apiKey,
            utilityModel: config.utilityModel,
          },
          memory,
          skillsDirs: config.skillsDirs,
          sessionId: msg.chatId,
        })
        session = { runner, history: [] }
        sessions.set(msg.chatId, session)
      }

      session.history.push({ role: "user" as const, content: msg.text })
      try {
        // AgentRunner.run → executeAuthorizedTool for every tool (including MCP).
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
