/**
 * WhatsApp adapter — uses WhatsApp Cloud API via webhook.
 * Requires a Meta Business App with WhatsApp product added.
 * Sends/receives text messages through the Cloud API.
 */
import type { PlatformAdapter, MessageHandler, OutgoingMessage } from "../types.js"
import { randomUUID } from "node:crypto"
import { createHmac } from "node:crypto"

type WhatsAppConfig = {
  /** Phone number ID from Meta Business App */
  phoneNumberId: string
  /** Access token from Meta Business App */
  accessToken: string
  /** App secret for webhook verification */
  appSecret?: string
  /** Verify token for webhook setup */
  verifyToken?: string
  /** Allowed phone numbers (with country code, no +) */
  allowedUsers?: string[]
}

export class WhatsAppAdapter implements PlatformAdapter {
  readonly name = "whatsapp" as const
  private config: WhatsAppConfig
  private handler: MessageHandler | null = null
  private server: any = null

  constructor(config: WhatsAppConfig) {
    this.config = config
  }

  async start(handler: MessageHandler): Promise<void> {
    this.handler = handler

    // WhatsApp Cloud API uses webhooks — we start a minimal HTTP server
    const http = await import("node:http")
    this.server = http.createServer(async (req: any, res: any) => {
      // Webhook verification (GET with hub.mode)
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      if (req.method === "GET" && url.searchParams.has("hub.mode")) {
        const mode = url.searchParams.get("hub.mode")
        const token = url.searchParams.get("hub.verify_token")
        const challenge = url.searchParams.get("hub.challenge")
        if (mode === "subscribe" && token === (this.config.verifyToken ?? "arcana")) {
          res.writeHead(200, { "Content-Type": "text/plain" })
          res.end(challenge ?? "")
        } else {
          res.writeHead(403)
          res.end("Forbidden")
        }
        return
      }

      // Incoming message (POST with JSON body)
      if (req.method === "POST") {
        let body = ""
        for await (const chunk of req) body += chunk

        // Verify signature if app secret is set
        const signature = req.headers["x-hub-signature-256"]
        if (this.config.appSecret && signature) {
          const expected = "sha256=" + createHmac("sha256", this.config.appSecret).update(body).digest("hex")
          if (signature !== expected) { res.writeHead(403); res.end("Bad signature"); return }
        }

        try {
          const data = JSON.parse(body)
          const entries = data?.entry ?? []
          for (const entry of entries) {
            for (const change of entry?.changes ?? []) {
              const msg = change?.value?.messages?.[0]
              if (!msg?.text?.body) continue
              const from = msg.from as string
              if (this.config.allowedUsers?.length && !this.config.allowedUsers.includes(from)) {
                await this.send({ chatId: from, text: "🔒 Unauthorized." })
                continue
              }
              try {
                const response = await this.handler!({
                  id: randomUUID(),
                  platform: "whatsapp",
                  chatId: from,
                  userId: from,
                  text: msg.text.body,
                  timestamp: parseInt(msg.timestamp ?? "0") * 1000 || Date.now(),
                })
                await this.send({ chatId: from, text: response })
              } catch (err) {
                await this.send({ chatId: from, text: `Error: ${String(err)}` })
              }
            }
          }
        } catch { /* skip invalid payloads */ }
        res.writeHead(200)
        res.end("OK")
        return
      }

      res.writeHead(404)
      res.end("Not found")
    })

    const port = parseInt(process.env.WHATSAPP_WEBHOOK_PORT ?? "3100")
    this.server.listen(port)
    console.error(`[arcana:gateway] WhatsApp webhook on :${port}`)
  }

  async stop(): Promise<void> {
    this.server?.close()
    this.server = null
    this.handler = null
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const url = `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/messages`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.chatId,
        type: "text",
        text: { body: msg.text.slice(0, 4096) },
      }),
    })
    if (!res.ok) console.error(`[whatsapp] Send error: HTTP ${res.status}`)
  }
}
