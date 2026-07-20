import type { GatewayConfig, MessageHandler, PlatformAdapter } from "./types.js"

/** Dev escape hatch — empty allowlists are otherwise refused (ARC-SEC-I06). */
export function gatewayOpenMode(): boolean {
  const v = process.env.ARCANA_GATEWAY_OPEN?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

/**
 * Refuse gateways with no allowlist unless ARCANA_GATEWAY_OPEN is set.
 * Prevents “anyone on the platform can drive a host-authority agent”.
 */
export function assertGatewayAllowlist(platform: string, list: string[] | undefined): void {
  if (list && list.length > 0) return
  if (gatewayOpenMode()) {
    console.warn(
      `[gateway] ${platform}: empty allowlist accepted because ARCANA_GATEWAY_OPEN is set (dev only)`,
    )
    return
  }
  throw new Error(
    `[gateway] ${platform} refused: empty allowlist. ` +
      `Configure allowed users/channels, or set ARCANA_GATEWAY_OPEN=1 for local development only.`,
  )
}

export class Gateway {
  private adapters: PlatformAdapter[] = []

  async start(config: GatewayConfig, handler: MessageHandler): Promise<void> {
    const licenseTier = process.env.ARCANA_LICENSE_TIER ?? process.env.ARCANA_LICENSE_KEY ? "pro" : "free"
    if (licenseTier === "free") {
      console.warn("[gateway] Gateway requires a pro or enterprise license. Set ARCANA_LICENSE_KEY.")
    }

    if (config.telegram) {
      assertGatewayAllowlist("telegram", config.telegram.allowedUsers)
      const { TelegramAdapter } = await import("./platforms/telegram.js")
      const adapter = new TelegramAdapter(config.telegram)
      await adapter.start(handler)
      this.adapters.push(adapter)
      console.error("[arcana:gateway] Telegram started")
    }

    if (config.discord) {
      assertGatewayAllowlist("discord", config.discord.allowedChannels)
      const { DiscordAdapter } = await import("./platforms/discord.js")
      const adapter = new DiscordAdapter(config.discord)
      await adapter.start(handler)
      this.adapters.push(adapter)
      console.error("[arcana:gateway] Discord started")
    }

    if (config.slack) {
      assertGatewayAllowlist("slack", config.slack.allowedChannels)
      const { SlackAdapter } = await import("./platforms/slack.js")
      const adapter = new SlackAdapter(config.slack)
      await adapter.start(handler)
      this.adapters.push(adapter)
      console.error("[arcana:gateway] Slack started")
    }

    if (config.whatsapp) {
      assertGatewayAllowlist("whatsapp", config.whatsapp.allowedUsers)
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
