import type { GatewayConfig, MessageHandler, PlatformAdapter } from "./types.js"

export class Gateway {
  private adapters: PlatformAdapter[] = []

  async start(config: GatewayConfig, handler: MessageHandler): Promise<void> {
    const licenseTier = process.env.ARCANA_LICENSE_TIER ?? process.env.ARCANA_LICENSE_KEY ? "pro" : "free"
    if (licenseTier === "free") {
      console.warn("[gateway] Gateway requires a pro or enterprise license. Set ARCANA_LICENSE_KEY.")
    }

    if (config.telegram) {
      const { TelegramAdapter } = await import("./platforms/telegram.js")
      const adapter = new TelegramAdapter(config.telegram)
      await adapter.start(handler)
      this.adapters.push(adapter)
      console.error("[arcana:gateway] Telegram started")
    }

    if (config.discord) {
      const { DiscordAdapter } = await import("./platforms/discord.js")
      const adapter = new DiscordAdapter(config.discord)
      await adapter.start(handler)
      this.adapters.push(adapter)
      console.error("[arcana:gateway] Discord started")
    }

    if (config.slack) {
      const { SlackAdapter } = await import("./platforms/slack.js")
      const adapter = new SlackAdapter(config.slack)
      await adapter.start(handler)
      this.adapters.push(adapter)
      console.error("[arcana:gateway] Slack started")
    }

    if (config.whatsapp) {
      const { WhatsAppAdapter } = await import("./platforms/whatsapp.js")
      const adapter = new WhatsAppAdapter(config.whatsapp)
      await adapter.start(handler)
      this.adapters.push(adapter)
      console.error("[arcana:gateway] WhatsApp started")
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.adapters.map((a) => a.stop()))
    this.adapters = []
  }

  get activePlatforms(): string[] {
    return this.adapters.map((a) => a.name)
  }
}
