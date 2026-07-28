import type { CommandModule } from "yargs"
import { Gateway } from "@arcana/gateway"
import type { IncomingMessage } from "@arcana/gateway"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { getArcanaHome } from "./arcana-home.js"

/** Read config with env var overrides for gateway tokens. */
function readGatewayConfig(): Record<string, unknown> {
  const cp = join(getArcanaHome(), "config.json")
  let config: Record<string, unknown> = {}
  if (existsSync(cp)) {
    try { config = JSON.parse(readFileSync(cp, "utf8")) } catch {}
  }

  const gw = (config.gateway as Record<string, unknown>) ?? {}

  // Env var overrides for gateway tokens (consistent with other commands)
  if (process.env.ARCANA_TELEGRAM_TOKEN && !(gw.telegram as any)?.token) {
    gw.telegram = { ...(gw.telegram as any ?? {}), token: process.env.ARCANA_TELEGRAM_TOKEN }
  }
  if (process.env.ARCANA_DISCORD_TOKEN && !(gw.discord as any)?.token) {
    gw.discord = { ...(gw.discord as any ?? {}), token: process.env.ARCANA_DISCORD_TOKEN }
  }

  return gw
}

function getArcanaBinary(): string {
  const ep = process.execPath.toLowerCase()
  if (ep.endsWith("bun.exe") || ep.endsWith("bun") || ep.endsWith("node.exe") || ep.endsWith("node")) {
    return "arcana"
  }
  return process.execPath
}

/**
 * Run agent for a chat message using a persistent session.
 * Uses --session to maintain per-chat state across messages,
 * --format json for machine-parseable output,
 * --timeout 60 for chat-appropriate latency.
 */
function runChatAgent(chatId: string, text: string): Promise<string> {
  return new Promise((resolve) => {
    const binary = getArcanaBinary()
    const sessionId = `gateway:${chatId}`
    const result = spawnSync(binary, [
      "run",
      "--session", sessionId,
      "--format", "json",
      "--timeout", "60",
      text,
    ], { stdio: "pipe", timeout: 70_000 })

    const stdout = result.stdout?.toString() ?? ""
    if (!stdout) {
      resolve(result.status === 0 ? "(no response)" : `Error: exit ${result.status}`)
      return
    }

    // Parse JSONL output — each line is a JSON event.
    // Find the last assistant message and return its content.
    let lastContent = ""
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const event = JSON.parse(trimmed)
        if (event.type === "assistant" && typeof event.content === "string") {
          lastContent = event.content
        }
      } catch { /* skip malformed lines */ }
    }
    resolve(lastContent || "(no response)")
  })
}

export const GatewayCommand: CommandModule = {
  command: "gateway",
  describe: "start the messaging gateway (Telegram, Discord, Slack, WhatsApp)",
  builder: (yargs) =>
    yargs
      .option("telegram-token", { type: "string", describe: "Telegram bot token (overrides config)" })
      .option("discord-token", { type: "string", describe: "Discord bot token (overrides config)" }),
  async handler(args) {
    const gwConfig = readGatewayConfig()

    // CLI flags override config
    const gatewayConfig = {
      ...gwConfig,
      ...(args.telegramToken ? { telegram: { ...(gwConfig.telegram as any ?? {}), token: String(args.telegramToken) } } : {}),
      ...(args.discordToken ? { discord: { ...(gwConfig.discord as any ?? {}), token: String(args.discordToken) } } : {}),
    }

    if (!gatewayConfig.telegram && !gatewayConfig.discord && !gatewayConfig.slack && !gatewayConfig.whatsapp) {
      console.error("No platform configured. Set gateway config or pass --telegram-token / --discord-token.")
      process.exit(1)
    }

    const gateway = new Gateway()

    // Track seen chats for first-message detection (subprocess handles history).
    // Evict oldest entries when map exceeds 10,000 to prevent memory leak.
    const seenChats = new Map<string, number>() // chatId → lastSeen timestamp
    const MAX_CHATS = 10_000

    function markSeen(chatId: string) {
      seenChats.set(chatId, Date.now())
      if (seenChats.size > MAX_CHATS) {
        // Evict oldest 20%
        const sorted = [...seenChats.entries()].sort((a, b) => a[1] - b[1])
        for (const [id] of sorted.slice(0, Math.floor(MAX_CHATS * 0.2))) {
          seenChats.delete(id)
        }
      }
    }

    console.log("Starting arcana gateway…")
    await gateway.start(gatewayConfig as any, async (msg: IncomingMessage) => {
      markSeen(msg.chatId)

      try {
        const response = await runChatAgent(msg.chatId, msg.text)
        return response
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
