import { cmd } from "./cmd"
import { Duration, Effect, Match, Option } from "effect"
import { UI } from "../ui"
import { Account } from "@/account/account"
import { AccountID, OrgID, PollExpired, type PollResult, type AccountError } from "@/account/schema"
import { effectCmd } from "../effect-cmd"
import * as Prompt from "../effect/prompt"
import open from "open"

const openBrowser = (url: string) => Effect.promise(() => open(url).catch(() => undefined))

const println = (msg: string) => Effect.sync(() => UI.println(msg))

const dim = (value: string) => UI.Style.TEXT_DIM + value + UI.Style.TEXT_NORMAL
const hi = (value: string) => UI.Style.TEXT_HIGHLIGHT + value + UI.Style.TEXT_NORMAL
const bold = (value: string) => UI.Style.TEXT_HIGHLIGHT_BOLD + value + UI.Style.TEXT_NORMAL
const ok = (value: string) => UI.Style.TEXT_SUCCESS + value + UI.Style.TEXT_NORMAL
const bad = (value: string) => UI.Style.TEXT_DANGER + value + UI.Style.TEXT_NORMAL
const warn = (value: string) => UI.Style.TEXT_WARNING + value + UI.Style.TEXT_NORMAL

const activeSuffix = (isActive: boolean) => (isActive ? dim(" (active)") : "")

/**
 * Product origin for Arcana web auth (site serves sign-in at /auth).
 * CLI device flow: POST {origin}/auth/device/code · poll /auth/device/token.
 * Override with ARCANA_CONSOLE_URL when needed.
 */
export const ARCANA_CONSOLE_DEFAULT = "https://arcana.otnelhq.com"

/** Default console URL for login. Override with env `ARCANA_CONSOLE_URL`. */
export function getDefaultConsoleUrl(): string {
  const fromEnv = process.env.ARCANA_CONSOLE_URL?.trim()
  return fromEnv || ARCANA_CONSOLE_DEFAULT
}

/** @deprecated Prefer getDefaultConsoleUrl() — kept for tests/imports. */
export const defaultConsoleUrl = ARCANA_CONSOLE_DEFAULT

export const formatAccountLabel = (account: { email: string; url: string }, isActive: boolean) =>
  `${account.email} ${dim(account.url)}${activeSuffix(isActive)}`

const formatOrgChoiceLabel = (account: { email: string }, org: { name: string }, isActive: boolean) =>
  `${org.name} (${account.email})${activeSuffix(isActive)}`

export const formatOrgLine = (
  account: { email: string; url: string },
  org: { id: string; name: string },
  isActive: boolean,
) => {
  const dot = isActive ? UI.Style.TEXT_SUCCESS + "●" + UI.Style.TEXT_NORMAL : " "
  const name = isActive ? UI.Style.TEXT_HIGHLIGHT_BOLD + org.name + UI.Style.TEXT_NORMAL : org.name
  return `  ${dot} ${name}  ${dim(account.email)}  ${dim(account.url)}  ${dim(org.id)}`
}

const isActiveOrgChoice = (
  active: Option.Option<{ id: AccountID; active_org_id: OrgID | null }>,
  choice: { accountID: AccountID; orgID: OrgID },
) => Option.isSome(active) && active.value.id === choice.accountID && active.value.active_org_id === choice.orgID

const blank = () => println("")

/** Horizontal rule used under the banner / around the seal card. */
const rule = (width: number) => "─".repeat(Math.max(width, 8))

/**
 * Center `text` inside a field of `width` (pad left/right with spaces).
 * Width is measured in string length (ANSI-free content only).
 */
const center = (text: string, width: number) => {
  const pad = Math.max(0, width - text.length)
  const left = Math.floor(pad / 2)
  const right = pad - left
  return " ".repeat(left) + text + " ".repeat(right)
}

/** Banner for device-flow login — Arcana voice, not generic clack. */
export function formatLoginBanner(): string[] {
  return [
    "",
    bold("  ⛧  ARCANA"),
    dim("     open the seal"),
    "",
  ]
}

/**
 * Ritual steps: seal is the hero (boxed code), gate is the link.
 * Pure string lines so tests can assert voice + URL hygiene without a TTY.
 *
 * Box math: interior is exactly `inner` cells wide.
 * Top border content is `─ seal ` (7) + remaining dashes (inner - 7).
 */
export function formatLoginSteps(input: { url: string; code: string }): string[] {
  const code = input.code.trim()
  const inner = Math.max(code.length + 6, 20)
  // "┌─ seal " then dashes then "┐" — label sits in the top border.
  // Leading "─ " (2) + "seal" (4) + " " (1) = 7 cells before remaining dashes.
  const rest = Math.max(0, inner - 7)
  const top = dim("  ┌─ ") + hi("seal") + dim(" " + rule(rest) + "┐")
  const mid = dim("  │") + bold(center(code, inner)) + dim("│")
  const empty = dim("  │" + " ".repeat(inner) + "│")
  const bot = dim("  └" + rule(inner) + "┘")

  return [
    top,
    empty,
    mid,
    empty,
    bot,
    "",
    dim("  ◆  gate"),
    "     " + hi(input.url),
    "",
    dim("  ·  speak the seal on the page if the browser stays dark"),
    "",
  ]
}

/** Closing lines after a successful bind. */
export function formatLoginSuccess(email: string): string[] {
  return [
    "",
    ok("  ⛧  bound") + dim("  ·  ") + bold(email),
    dim("     welcome back. the seal holds."),
    "",
  ]
}

const loginEffect = Effect.fn("login")(function* (url: string) {
  const service = yield* Account.Service

  for (const line of formatLoginBanner()) yield* println(line)

  const login = yield* service.login(url)

  for (const line of formatLoginSteps({ url: login.url, code: login.user })) {
    yield* println(line)
  }

  yield* openBrowser(login.url)

  // Braille dots (same family as the TUI spinner) — not clack's circle.
  const s = Prompt.spinner({
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    delay: 80,
  })
  yield* s.start(dim("awaiting the seal…"))

  const poll = (wait: Duration.Duration): Effect.Effect<PollResult, AccountError> =>
    Effect.gen(function* () {
      yield* Effect.sleep(wait)
      const result = yield* service.poll(login)
      if (result._tag === "PollPending") return yield* poll(wait)
      if (result._tag === "PollSlow") return yield* poll(Duration.sum(wait, Duration.seconds(5)))
      return result
    })

  const result = yield* poll(login.interval).pipe(
    Effect.timeout(login.expiry),
    Effect.catchTag("TimeoutError", () => Effect.succeed(new PollExpired())),
  )

  yield* Match.valueTags(result, {
    PollSuccess: (r) =>
      Effect.gen(function* () {
        // Clear spinner with a quiet tick; the real welcome is formatLoginSuccess.
        yield* s.stop(ok("✦") + dim("  seal accepted"))
        for (const line of formatLoginSuccess(r.email)) yield* println(line)
      }),
    PollExpired: () =>
      s.stop(bad("◌  the seal faded") + dim("  — run ") + hi("arcana console login") + dim(" again"), 1),
    PollDenied: () => s.stop(bad("⊘  refused") + dim("  — the gate stayed shut"), 1),
    PollError: (r) => s.stop(bad("⊘  binding failed") + dim(`  — ${String(r.cause)}`), 1),
    PollPending: () => s.stop(warn("◌  unexpected pending state"), 1),
    PollSlow: () => s.stop(warn("◌  unexpected slow state"), 1),
  })
})

const logoutEffect = Effect.fn("logout")(function* (email?: string) {
  const service = yield* Account.Service
  const accounts = yield* service.list()
  if (accounts.length === 0) return yield* println("Not logged in")

  if (email) {
    const match = accounts.find((a) => a.email === email)
    if (!match) return yield* println("Account not found: " + email)
    yield* service.remove(match.id)
    yield* Prompt.outro("Logged out from " + email)
    return
  }

  const active = yield* service.active()
  const activeID = Option.map(active, (a) => a.id)

  yield* Prompt.intro("Log out")

  const opts = accounts.map((a) => {
    const isActive = Option.isSome(activeID) && activeID.value === a.id
    return {
      value: a,
      label: formatAccountLabel(a, isActive),
    }
  })

  const selected = yield* Prompt.select({ message: "Select account to log out", options: opts })
  if (Option.isNone(selected)) return

  yield* service.remove(selected.value.id)
  yield* Prompt.outro("Logged out from " + selected.value.email)
})

interface OrgChoice {
  orgID: OrgID
  accountID: AccountID
  label: string
}

const switchEffect = Effect.fn("switch")(function* () {
  const service = yield* Account.Service

  const groups = yield* service.orgsByAccount()
  if (groups.length === 0) return yield* println("Not logged in")

  const active = yield* service.active()

  const opts = groups.flatMap((group) =>
    group.orgs.map((org) => {
      const isActive = isActiveOrgChoice(active, { accountID: group.account.id, orgID: org.id })
      return {
        value: { orgID: org.id, accountID: group.account.id, label: org.name },
        label: formatOrgChoiceLabel(group.account, org, isActive),
      }
    }),
  )
  if (opts.length === 0) return yield* println("No orgs found")

  yield* Prompt.intro("Switch org")

  const selected = yield* Prompt.select<OrgChoice>({ message: "Select org", options: opts })
  if (Option.isNone(selected)) return

  const choice = selected.value
  yield* service.use(choice.accountID, Option.some(choice.orgID))
  yield* Prompt.outro("Switched to " + choice.label)
})

const orgsEffect = Effect.fn("orgs")(function* () {
  const service = yield* Account.Service

  const groups = yield* service.orgsByAccount()
  if (groups.length === 0) return yield* println("No accounts found")
  if (!groups.some((group) => group.orgs.length > 0)) return yield* println("No orgs found")

  const active = yield* service.active()

  for (const group of groups) {
    for (const org of group.orgs) {
      const isActive = isActiveOrgChoice(active, { accountID: group.account.id, orgID: org.id })
      yield* println(formatOrgLine(group.account, org, isActive))
    }
  }
})

const openEffect = Effect.fn("open")(function* () {
  const service = yield* Account.Service
  const active = yield* service.active()
  if (Option.isNone(active)) return yield* println("No active account")

  const url = active.value.url
  yield* openBrowser(url)
  yield* Prompt.outro("Opened " + url)
})

export const LoginCommand = effectCmd({
  command: "login [url]",
  describe: false,
  instance: false,
  builder: (yargs) =>
    yargs.positional("url", {
      describe: "server URL",
      type: "string",
    }),
  handler: Effect.fn("Cli.account.login")(function* (args) {
    UI.empty()
    yield* Effect.orDie(loginEffect(args.url ?? getDefaultConsoleUrl()))
  }),
})

export const LogoutCommand = effectCmd({
  command: "logout [email]",
  describe: false,
  instance: false,
  builder: (yargs) =>
    yargs.positional("email", {
      describe: "account email to log out from",
      type: "string",
    }),
  handler: Effect.fn("Cli.account.logout")(function* (args) {
    UI.empty()
    yield* Effect.orDie(logoutEffect(args.email))
  }),
})

export const SwitchCommand = effectCmd({
  command: "switch",
  describe: false,
  instance: false,
  handler: Effect.fn("Cli.account.switch")(function* () {
    UI.empty()
    yield* Effect.orDie(switchEffect())
  }),
})

export const OrgsCommand = effectCmd({
  command: "orgs",
  describe: false,
  instance: false,
  handler: Effect.fn("Cli.account.orgs")(function* () {
    UI.empty()
    yield* Effect.orDie(orgsEffect())
  }),
})

export const OpenCommand = effectCmd({
  command: "open",
  describe: false,
  instance: false,
  handler: Effect.fn("Cli.account.open")(function* () {
    UI.empty()
    yield* Effect.orDie(openEffect())
  }),
})

export const ConsoleCommand = cmd({
  command: "console",
  describe: false,
  builder: (yargs) =>
    yargs
      .command({
        ...LoginCommand,
        describe: "log in to console",
      })
      .command({
        ...LogoutCommand,
        describe: "log out from console",
      })
      .command({
        ...SwitchCommand,
        describe: "switch active org",
      })
      .command({
        ...OrgsCommand,
        describe: "list orgs",
      })
      .command({
        ...OpenCommand,
        describe: "open active console account",
      })
      .demandCommand(),
  async handler() {},
})
