import type { PlatformAdapter, MessageHandler, OutgoingMessage } from "../types.js"
import { randomUUID } from "node:crypto"

type DiscordConfig = {
  token: string
  allowedChannels?: string[]
}

export class DiscordAdapter implements PlatformAdapter {
  readonly name = "discord" as const
  private client: any = null

  constructor(private readonly config: DiscordConfig) {}

  async start(handler: MessageHandler): Promise<void> {
    const { Client, GatewayIntentBits } = await import("discord.js")
    this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })

    this.client.on("messageCreate", async (msg: any) => {
      if (msg.author.bot) return
      if (this.config.allowedChannels?.length && !this.config.allowedChannels.includes(msg.channelId)) return
      try {
        const response = await handler({
          id: randomUUID(),
          platform: "discord",
          chatId: msg.channelId,
          userId: msg.author.id,
          text: msg.content,
          timestamp: msg.createdTimestamp,
        })
        await msg.reply(response.slice(0, 2000))
      } catch (err) {
        await msg.reply(`Error: ${String(err)}`)
      }
    })

    await this.client.login(this.config.token)
  }

  async stop(): Promise<void> {
    this.client?.destroy()
    this.client = null
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const channel = await this.client?.channels.fetch(msg.chatId)
    await channel?.send?.(msg.text.slice(0, 2000))
  }
}
