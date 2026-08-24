import type { CommandModule } from "yargs"
import { spawnSync } from "node:child_process"
import { Gateway } from "@arcana/gateway"
import { loadConfig, getDataDir } from "../../config.js"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import type { AgentRunner } from "../../agent/runner.js"
import { createDelegatedRunner } from "../../agent/delegated.js"

// Platform SDK install helper (mirrors the engine gateway command).
const PLATFORM_SDKS: Record<string, string> = {
  telegram: "node-telegram-bot-api",
  discord: "discord.js",
  slack: "@slack/bolt",
}

function installPlatform(platform: string): boolean {
  const pkg = PLATFORM_SDKS[platform]
  if (!pkg) {
    console.error(`Unknown platform: ${platform}. Choices: ${Object.keys(PLATFORM_SDKS).join(", ")}`)
    return false
  }
  console.log(`Installing ${pkg} for the arcana gateway.`)
  const r = spawnSync("bun", ["add", pkg], { stdio: "inherit", timeout: 60_000 })
  if (r.status !== 0) {
    console.error(`Install failed (exit ${r.status}). Try manually: bun add ${pkg}`)
    return false
  }
  console.log(`✓ ${platform} SDK installed. Run: arcana gateway`)
  return true
}

export const GatewayCommand: CommandModule = {
  command: "gateway [action]",
  describe: "start the messaging gateway (Telegram, Discord, Slack, WhatsApp) or install platform SDKs",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["install"] as const, describe: "install a platform SDK" })
      .option("platform", { type: "string", choices: Object.keys(PLATFORM_SDKS), describe: "platform for install" })
      .option("telegram-token", { type: "string", describe: "Telegram bot token (overrides config)" })
      .option("discord-token", { type: "string", describe: "Discord bot token (overrides config)" }),
  async handler(args) {
    const action = String((args as { action?: string }).action ?? "")

    if (action === "install") {
      const platform = String((args as { platform?: string }).platform ?? "")
      process.exitCode = installPlatform(platform) ? 0 : 1
      return
    }

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
