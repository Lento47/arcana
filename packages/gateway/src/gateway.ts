import type { GatewayConfig, MessageHandler, PlatformAdapter } from "./types.js"

/** Dev escape hatch — empty allowlists are otherwise refused (ARC-SEC-I06). */
export function gatewayOpenMode(): boolean {
  const v = process.env.ARCANA_GATEWAY_OPEN?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

/**
 * Refuse gateways with no allowlist unless ARCANA_GATEWAY_OPEN is set.
 * Prevents "anyone on the platform can drive a host-authority agent".
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
      await this.startPlatform("telegram", config.telegram.allowedUsers, () => import("./platforms/telegram.js"), (m) => new m.TelegramAdapter(config.telegram), handler)
    }

    if (config.discord) {
      await this.startPlatform("discord", config.discord.allowedChannels, () => import("./platforms/discord.js"), (m) => new m.DiscordAdapter(config.discord), handler)
    }

    if (config.slack) {
      await this.startPlatform("slack", config.slack.allowedChannels, () => import("./platforms/slack.js"), (m) => new m.SlackAdapter(config.slack), handler)
    }

    if (config.whatsapp) {
      await this.startPlatform("whatsapp", config.whatsapp.allowedUsers, () => import("./platforms/whatsapp.js"), (m) => new m.WhatsAppAdapter(config.whatsapp), handler)
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.adapters.map((a) => a.stop()))
    this.adapters = []
  }

  get activePlatforms(): string[] {
    return this.adapters.map((a) => a.name)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter constructors have heterogeneous config types; the caller provides typed construction via createAdapter
  private async startPlatform(
    platform: string,
    allowlist: string[] | undefined,
    importModule: () => Promise<Record<string, new (config: any) => PlatformAdapter>>,
    createAdapter: (mod: Record<string, new (config: any) => PlatformAdapter>) => PlatformAdapter,
    handler: MessageHandler,
  ): Promise<void> {
    assertGatewayAllowlist(platform, allowlist)
    const mod = await importModule()
    const adapter = createAdapter(mod)
    await adapter.start(handler)
    this.adapters.push(adapter)
    console.error(`[arcana:gateway] ${platform} started`)
  }
}
