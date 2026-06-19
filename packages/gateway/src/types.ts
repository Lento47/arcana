export type Platform = "telegram" | "discord" | "slack" | "whatsapp" | "cli"

export type IncomingMessage = {
  id: string
  platform: Platform
  chatId: string
  userId: string
  text: string
  attachments?: Array<{ type: string; url: string }>
  replyToId?: string
  timestamp: number
}

export type OutgoingMessage = {
  chatId: string
  text: string
  replyToId?: string
  markdown?: boolean
}

export type GatewayConfig = {
  telegram?: { token: string; allowedUsers?: string[] }
  discord?: { token: string; allowedChannels?: string[] }
  slack?: { botToken: string; signingSecret: string; allowedChannels?: string[] }
  whatsapp?: { phoneNumberId: string; accessToken: string; appSecret?: string; verifyToken?: string; allowedUsers?: string[] }
}

export type MessageHandler = (msg: IncomingMessage) => Promise<string>

export interface PlatformAdapter {
  name: Platform
  start(handler: MessageHandler): Promise<void>
  stop(): Promise<void>
  send(msg: OutgoingMessage): Promise<void>
}
