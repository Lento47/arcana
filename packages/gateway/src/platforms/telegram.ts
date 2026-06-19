import type { PlatformAdapter, MessageHandler, OutgoingMessage } from "../types.js"
import { randomUUID } from "node:crypto"

type TelegramConfig = {
  token: string
  allowedUsers?: string[]
}

export class TelegramAdapter implements PlatformAdapter {
  readonly name = "telegram" as const
  private bot: any = null

  constructor(private readonly config: TelegramConfig) {}

  async start(handler: MessageHandler): Promise<void> {
    const TelegramBot = (await import("node-telegram-bot-api")).default
    this.bot = new TelegramBot(this.config.token, { polling: true })

    this.bot.on("message", async (msg: any) => {
      if (!msg.text) return
      const userId = String(msg.from?.id ?? "")
      if (this.config.allowedUsers?.length && !this.config.allowedUsers.includes(userId)) {
        await this.bot.sendMessage(msg.chat.id, "Unauthorized.")
        return
      }
      try {
        const response = await handler({
          id: randomUUID(),
          platform: "telegram",
          chatId: String(msg.chat.id),
          userId,
          text: msg.text,
          timestamp: (msg.date ?? 0) * 1000,
        })
        await this.bot.sendMessage(msg.chat.id, response, { parse_mode: "Markdown" })
      } catch (err) {
        await this.bot.sendMessage(msg.chat.id, `Error: ${String(err)}`)
      }
    })
  }

  async stop(): Promise<void> {
    await this.bot?.stopPolling()
    this.bot = null
  }

  async send(msg: OutgoingMessage): Promise<void> {
    await this.bot?.sendMessage(msg.chatId, msg.text, msg.markdown ? { parse_mode: "Markdown" } : undefined)
  }
}
