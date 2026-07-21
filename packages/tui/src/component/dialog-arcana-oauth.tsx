import { createSignal, onCleanup, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useToast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { useBindings } from "../keymap"
import { useClipboard } from "../context/clipboard"
import { DialogModel } from "./dialog-model"
import { COPY, Glyph } from "../branding"
import { errorMessage } from "../util/error"
import { Locale } from "../util/locale"
import { isRecord } from "../util/record"

type PollStatus = "pending" | "slow_down" | "expired" | "denied" | "success"

interface ArcanaOAuthMethodProps {
  onSuccess?: () => void
}

/**
 * TUI-side device-code OAuth flow for the Arcana console. Mirrors the existing
 * `AutoMethod` (line 247 of dialog-provider.tsx) but is wired to the engine's
 * new `experimental.console.login*` endpoints so the user can sign in from
 * inside the TUI without shelling out to `arcana console login`.
 *
 * On browser confirm, the engine mints a `proxy_key` and writes
 * `~/.arcana/proxy_key` for us. We then `sync.bootstrap()` to refresh the
 * catalog so the free arcana-fallback lifts to the full proxy catalog.
 */
export function ArcanaOAuthMethod(props: ArcanaOAuthMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const sync = useSync()
  const toast = useToast()
  const clipboard = useClipboard()

  const [phase, setPhase] = createSignal<"starting" | "waiting" | "binding" | "success" | "error">("starting")
  const [user, setUser] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [email, setEmail] = createSignal<string | undefined>(undefined)
  const [code, setCode] = createSignal<string | undefined>(undefined)
  const [server, setServer] = createSignal<string | undefined>(undefined)

  let cancelled = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined

  // Open the verification URL in the OS default browser via the engine.
  // Going server-side avoids terminal-side OSC 8 click handlers that can
  // mangle the `?code=` query (Warp, tmux, some Windows shells).
  async function openInBrowser() {
    const target = url()
    if (!target) return
    try {
      const result = await sdk.client.experimental.console.openUrl({ url: target })
      if (result.error || !result.data?.ok) {
        toast.show({
          variant: "info",
          message: "Couldn't open your browser. Press c to copy the link and paste it in a browser yourself.",
        })
      }
    } catch (e) {
      // ANY throw here would propagate as an unhandled rejection and the
      // engine's process.on("unhandledRejection") handler exits the TUI.
      // Map to a toast and let the user fall back to the copy-link path.
      toast.error(friendlyError(e, "Couldn't open your browser. Press c to copy the link."))
    }
  }

  useBindings(() => ({
    bindings: [
      {
        key: "c",
        desc: "Copy link",
        group: "Dialog",
        cmd: () => {
          // Copy the FULL URL (with code) so the user can paste into a
          // browser themselves. The TUI never echoes it back to the screen.
          const value = url()
          if (!value) return
          clipboard
            .write?.(value)
            .then(() => toast.show({ message: COPY.inscribedToClipboard, variant: "info" }))
            .catch(toast.error)
        },
      },
      {
        key: "return",
        desc: "Open link",
        group: "Dialog",
        cmd: () => {
          void openInBrowser()
        },
      },
    ],
  }))

  // Map raw errors to user-safe messages. Never expose upstream URLs,
  // stack traces, bundle paths, or error refs to the user. The engine
  // logs the full cause; we only surface actionable guidance here.
  function friendlyError(e: unknown, fallback: string): string {
    if (isRecord(e) && typeof e.message === "string" && e.message) {
      const lower = e.message.toLowerCase()
      if (lower.includes("connection refused") || lower.includes("unable to connect")) {
        return "Can't reach the Arcana sign-in server. Check your network and try again."
      }
      if (lower.includes("timeout") || lower.includes("timed out")) {
        return "The sign-in server took too long to respond. Try again."
      }
      if (lower.includes("invalid") || lower.includes("bad request") || lower.includes("400")) {
        return "The sign-in request was rejected. Please retry."
      }
      if (lower.includes("500") || lower.includes("server error")) {
        return "Sign-in service hit an error. Please retry in a moment."
      }
    }
    return fallback
  }

  async function start() {
    try {
      // Must send a non-empty body: the SDK strips `body: {}` when every field is
      // optional/undefined, and the server then sees payload === undefined
      // ("Expected ConsoleLoginRequest, got undefined").
      const server =
        (typeof process !== "undefined" && process.env?.ARCANA_CONSOLE_URL?.trim())
        || "https://arcana.otnelhq.com"
      const result = await sdk.client.experimental.console.login({ server })
      if (cancelled) return
      if (result.error || !result.data) {
        setError(friendlyError(result.error, "Couldn't start sign-in. Please try again."))
        setPhase("error")
        return
      }
      setUser(result.data.user)
      setUrl(result.data.url)
      setCode(result.data.code)
      setServer(result.data.server)
      setPhase("waiting")
      scheduleNext(result.data.intervalSeconds * 1000)
    } catch (e) {
      if (cancelled) return
      setError(friendlyError(e, "Couldn't start sign-in. Please try again."))
      setPhase("error")
    }
  }

  function scheduleNext(delayMs: number) {
    if (cancelled) return
    pollTimer = setTimeout(poll, Math.max(500, delayMs))
  }

  async function poll() {
    if (cancelled) return
    const c = code()
    const s = server()
    if (!c || !s) return
    try {
      const result = await sdk.client.experimental.console.loginPoll({ code: c, server: s })
      if (cancelled) return
      if (result.error || !result.data) {
        setError(friendlyError(result.error, "Lost the connection while waiting for confirmation. Please try again."))
        setPhase("error")
        return
      }
      const status = result.data.status as PollStatus
      if (status === "pending") {
        scheduleNext(5_000)
        return
      }
      if (status === "slow_down") {
        scheduleNext(10_000)
        return
      }
      if (status === "expired") {
        setError("The sign-in code expired. Press esc and try again.")
        setPhase("error")
        return
      }
      if (status === "denied") {
        setError(result.data.error ?? "Sign-in was denied.")
        setPhase("error")
        return
      }
      if (status === "success") {
        await complete(result.data.accessToken, result.data.email)
      }
    } catch (e) {
      if (cancelled) return
      setError(friendlyError(e, "Lost the connection while waiting for confirmation. Please try again."))
      setPhase("error")
    }
  }

  async function complete(accessToken: string | undefined, emailAddr: string | undefined) {
    if (!accessToken) {
      setError("Sign-in succeeded but no access token was returned. Try again.")
      setPhase("error")
      return
    }
    const c = code()
    const s = server()
    if (!c || !s) {
      setError("Lost login session — please try again.")
      setPhase("error")
      return
    }
    setPhase("binding")
    setEmail(emailAddr)
    try {
      const result = await sdk.client.experimental.console.loginComplete({
        accessToken,
        server: s,
        email: emailAddr,
      })
      if (cancelled) return
      if (result.error || !result.data?.ok) {
        setError(result.data?.error ?? errorMessage(result.error))
        setPhase("error")
        return
      }
      setPhase("success")
      toast.show({
        variant: "info",
        message: `Signed in to arcana as ${emailAddr ?? "you"}. Models unlocked.`,
      })
      // Reload the catalog so the free-arcana fallback lifts to the full proxy.
      await sdk.client.instance.dispose()
      await sync.bootstrap()
      props.onSuccess?.()
      dialog.replace(() => <DialogModel providerID="arcana" />)
    } catch (e) {
      if (cancelled) return
      setError(friendlyError(e, "Couldn't finish signing in. Please try again."))
      setPhase("error")
    }
  }

  onCleanup(() => {
    cancelled = true
    if (pollTimer) clearTimeout(pollTimer)
  })

  // Kick off the login immediately on mount.
  void start()

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {Glyph.sigil} Sign in with arcana
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={phase() === "starting"}>
        <text fg={theme.textMuted}>Generating sign-in code…</text>
      </Show>
      <Show when={phase() === "waiting" || phase() === "binding" || phase() === "success"}>
        <box gap={1}>
          <text fg={theme.textMuted}>
            Visit{" "}
            <span style={{ fg: theme.primary, attributes: TextAttributes.UNDERLINE }}>{url()}</span>{" "}
            and enter this code:
          </text>
          <text attributes={TextAttributes.BOLD} fg={theme.primary}>
            {user() || "…"}
          </text>
          <Show when={phase() === "waiting"}>
            <text fg={theme.textMuted}>Waiting for confirmation…</text>
          </Show>
          <Show when={phase() === "binding"}>
            <text fg={theme.textMuted}>Confirmed. Unlocking more models…</text>
          </Show>
          <Show when={phase() === "success"}>
            <text fg={theme.success}>
              {email() ? `Signed in as ${email()}.` : "Signed in."} Models unlocked.
            </text>
          </Show>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>open link</span>
          </text>
          <text fg={theme.text}>
            c <span style={{ fg: theme.textMuted }}>copy link</span>
          </text>
        </box>
      </Show>
      <Show when={phase() === "error"}>
        <box gap={1}>
          <text fg={theme.error}>Sign-in failed</text>
          <text fg={theme.textMuted}>{Locale.truncate(error() ?? "", 120)}</text>
          <text fg={theme.textMuted}>Press esc to close and try again.</text>
        </box>
      </Show>
    </box>
  )
}
