import type { PlatformAdapter, MessageHandler, OutgoingMessage } from "../types.js"
import { randomUUID } from "node:crypto"

type SlackConfig = {
  botToken: string
  signingSecret: string
  allowedChannels?: string[]
}

export class SlackAdapter implements PlatformAdapter {
  readonly name = "slack" as const
  private app: any = null

  constructor(private readonly config: SlackConfig) {}

  async start(handler: MessageHandler): Promise<void> {
    const { App } = await import("@slack/bolt")
    this.app = new App({
      token: this.config.botToken,
      signingSecret: this.config.signingSecret,
    })

    this.app.message(async ({ message, say }: any) => {
      if (message.subtype) return // skip bot messages, edits, etc.
      if (!message.text) return
      if (this.config.allowedChannels?.length && !this.config.allowedChannels.includes(message.channel)) {
        await say(":lock: Unauthorized.")
        return
      }
      try {
        const response = await handler({
          id: randomUUID(),
          platform: "slack",
          chatId: message.channel,
          userId: message.user,
          text: message.text,
          timestamp: parseInt(message.ts, 10) * 1000 || Date.now(),
        })
        await say({ text: response, mrkdwn: true })
      } catch (err) {
        await say({ text: `:warning: Error: ${String(err)}` })
      }
    })

    await this.app.start()
    // Slack Bolt may open an HTTP endpoint; log for visibility
    console.error("[arcana:gateway] Slack adapter started")
  }

  async stop(): Promise<void> {
    await this.app?.stop()
    this.app = null
  }

  async send(msg: OutgoingMessage): Promise<void> {
    await this.app?.client?.chat.postMessage({
      channel: msg.chatId,
      text: msg.text,
      mrkdwn: msg.markdown ?? true,
      thread_ts: msg.replyToId,
    })
  }
}
