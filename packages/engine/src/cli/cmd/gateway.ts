import type { CommandModule } from "yargs"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { getArcanaHome } from "./arcana-home.js"

// ── config ────────────────────────────────────────────────────────────

type PlatformWithToken = { token?: string; [key: string]: unknown }
type GatewayConfigFile = {
  telegram?: PlatformWithToken
  discord?: PlatformWithToken
  slack?: PlatformWithToken
  whatsapp?: PlatformWithToken
  [key: string]: unknown
}

function readGatewayConfig(): GatewayConfigFile {
  const cp = join(getArcanaHome(), "config.json")
  let config: Record<string, unknown> = {}
  if (existsSync(cp)) {
    try { config = JSON.parse(readFileSync(cp, "utf8")) } catch {}
  }
  const gw = (config.gateway as GatewayConfigFile) ?? {}
  if (process.env.ARCANA_TELEGRAM_TOKEN && !gw.telegram?.token) {
    gw.telegram = { ...(gw.telegram ?? {}), token: process.env.ARCANA_TELEGRAM_TOKEN }
  }
  if (process.env.ARCANA_DISCORD_TOKEN && !gw.discord?.token) {
    gw.discord = { ...(gw.discord ?? {}), token: process.env.ARCANA_DISCORD_TOKEN }
  }
  return gw
}

// ── lazy gateway loader ───────────────────────────────────────────────

/** Import path hidden behind a function so Bun's compiler doesn't bundle @arcana/gateway. */
function gatewayModulePath(): string {
  return "@arcana/gateway"
}

async function loadGateway(): Promise<any> {
  try {
    return await import(gatewayModulePath())
  } catch {
    return null
  }
}

// ── platform SDKs ─────────────────────────────────────────────────────

const PLATFORM_SDKS: Record<string, string> = {
  telegram: "node-telegram-bot-api",
  discord: "discord.js",
  slack: "@slack/bolt",
}

async function installPlatform(platform: string): Promise<boolean> {
  const pkg = PLATFORM_SDKS[platform]
  if (!pkg) {
    console.error(`Unknown platform: ${platform}. Choices: ${Object.keys(PLATFORM_SDKS).join(", ")}`)
    return false
  }

  // Ensure @arcana/gateway is installed first
  console.log(`Installing @arcana/gateway + ${pkg}…`)
  const r1 = spawnSync("bun", ["add", "--cwd", process.cwd(), "@arcana/gateway@workspace:*", pkg], {
    stdio: "inherit",
    timeout: 60_000,
  })
  if (r1.status !== 0) {
    console.error(`Install failed (exit ${r1.status}). Try manually: bun add @arcana/gateway ${pkg}`)
    return false
  }
  console.log(`✓ ${platform} SDK installed. Run: arcana gateway`)
  return true
}

// ── agent runner ──────────────────────────────────────────────────────

function getArcanaBinary(): string {
  const ep = process.execPath.toLowerCase()
  if (ep.endsWith("bun.exe") || ep.endsWith("bun") || ep.endsWith("node.exe") || ep.endsWith("node")) {
    return "arcana"
  }
  return process.execPath
}

function runChatAgent(chatId: string, text: string): Promise<string> {
  return new Promise((resolve) => {
    const binary = getArcanaBinary()
    const result = spawnSync(binary, [
      "run", "--session", `gateway:${chatId}`, "--format", "json", "--timeout", "60", text,
    ], { stdio: "pipe", timeout: 70_000 })

    const stdout = result.stdout?.toString() ?? ""
    if (!stdout) {
      resolve(result.status === 0 ? "(no response)" : `Error: exit ${result.status}`)
      return
    }
    let lastContent = ""
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const event = JSON.parse(trimmed)
        if (event.type === "assistant" && typeof event.content === "string") {
          lastContent = event.content
        }
      } catch { /* skip */ }
    }
    resolve(lastContent || "(no response)")
  })
}

// ── command ───────────────────────────────────────────────────────────

export const GatewayCommand: CommandModule = {
  command: "gateway [action]",
  describe: "start the messaging gateway or install platform SDKs",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["start", "install"] as const,
        default: "start" as const,
        describe: "start the gateway or install a platform SDK",
      })
      .option("platform", { alias: "p", type: "string", describe: "platform to install (telegram, discord, slack)" })
      .option("telegram-token", { type: "string", describe: "Telegram bot token (overrides config)" })
      .option("discord-token", { type: "string", describe: "Discord bot token (overrides config)" }),
  async handler(args) {
    const action = String(args.action ?? "start")

    // ── install ──────────────────────────────────────────────────
    if (action === "install") {
      if (!args.platform) {
        console.error("--platform required. Choices: telegram, discord, slack")
        process.exitCode = 1
        return
      }
      const ok = await installPlatform(String(args.platform))
      if (!ok) process.exitCode = 1
      return
    }

    // ── start ────────────────────────────────────────────────────
    const gatewayMod = await loadGateway()
    if (!gatewayMod) {
      console.error("Gateway SDKs not installed.")
      console.error("")
      console.error("  arcana gateway install --platform telegram    (or discord, slack)")
      console.error("")
      console.error("This installs the messaging libraries needed to run the gateway.")
      console.error("After install, run: arcana gateway")
      process.exitCode = 1
      return
    }

    const { Gateway } = gatewayMod
    const gwConfig = readGatewayConfig()
    const gatewayConfig: GatewayConfigFile = {
      ...gwConfig,
      ...(args.telegramToken ? { telegram: { ...(gwConfig.telegram ?? {}), token: String(args.telegramToken) } } : {}),
      ...(args.discordToken ? { discord: { ...(gwConfig.discord ?? {}), token: String(args.discordToken) } } : {}),
    }

    if (!gatewayConfig.telegram && !gatewayConfig.discord && !gatewayConfig.slack && !gatewayConfig.whatsapp) {
      console.error("No platform configured. Set gateway config or pass --telegram-token / --discord-token.")
      process.exitCode = 1
      return
    }

    const gateway = new Gateway()
    const seenChats = new Map<string, number>()
    const MAX_CHATS = 10_000

    function markSeen(chatId: string) {
      seenChats.set(chatId, Date.now())
      if (seenChats.size > MAX_CHATS) {
        const sorted = [...seenChats.entries()].sort((a, b) => a[1] - b[1])
        for (const [id] of sorted.slice(0, Math.floor(MAX_CHATS * 0.2))) {
          seenChats.delete(id)
        }
      }
    }

    console.log("Starting arcana gateway…")
    await gateway.start(gatewayConfig as any, async (msg: any) => {
      markSeen(msg.chatId)
      try {
        return await runChatAgent(msg.chatId, msg.text)
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
