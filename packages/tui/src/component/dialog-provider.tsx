import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useSync } from "../context/sync"
import { map, pipe, sortBy } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Link } from "../ui/link"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import type { ProviderAuthAuthorization, ProviderAuthMethod } from "@arcana/sdk/v2"
import { DialogModel } from "./dialog-model"
import { useToast } from "../ui/toast"
import { isConsoleManagedProvider } from "../util/provider-origin"
import { useConnected } from "./use-connected"
import { BRAND_TIERS } from "../branding"
import { useHasProxyKey } from "./use-has-proxy-key"
import { errorMessage } from "../util/error"
import { useBindings } from "../keymap"
import { useClipboard } from "../context/clipboard"
import { COPY, Glyph } from "../branding"
import { ArcanaOAuthMethod } from "./dialog-arcana-oauth"

const PROVIDER_PRIORITY: Record<string, number> = {
  opencode: 0,
  "opencode-go": 1,
  openai: 2,
  "github-copilot": 3,
  anthropic: 4,
  google: 5,
}

const CUSTOM_PROVIDER_OPTION_VALUE = "__ARCANA_custom_provider__"
const CUSTOM_PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/

/**
 * Derive a provider id from a base-URL hostname: drop the TLD, drop leading
 * infrastructure labels (`api.` `www.` …), slugify what remains.
 *   api.tokenrouter.com → tokenrouter · openrouter.ai → openrouter · x.ai → x
 * Collisions with `existingIDs` get numeric suffixes (-2, -3, …).
 */
export function deriveProviderIDFromHost(
  hostname: string,
  existingIDs: ReadonlySet<string> = new Set(),
): string | undefined {
  const labels = hostname.toLowerCase().split(".").filter(Boolean)
  if (labels.length === 0) return undefined
  // The brand lives in the last label before the TLD; everything before it
  // is infrastructure (api./www./v1.api./…). Single-label hosts use it as-is.
  const slug = (labels.length > 1 ? labels[labels.length - 2] : labels[0])!
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  if (!CUSTOM_PROVIDER_ID.test(slug)) return undefined
  let id = slug
  let n = 2
  while (existingIDs.has(id)) id = `${slug}-${n++}`
  return id
}

/**
 * Accept either a short slug (`tokenrouter`) or a full base URL
 * (`https://api.tokenrouter.com/v1`). URLs yield `{ id, baseURL }`; slugs
 * behave exactly like the old normalize path (plus case-folding).
 */
export function parseCustomProviderInput(
  value: string,
  existingIDs: ReadonlySet<string> = new Set(),
): { id: string; baseURL?: string } | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      return undefined
    }
    const id = deriveProviderIDFromHost(url.hostname, existingIDs)
    if (!id) return undefined
    const baseURL = `${url.origin}${url.pathname.replace(/\/+$/, "")}`
    return { id, baseURL }
  }

  const id = normalizeCustomProviderID(trimmed.toLowerCase())
  return id ? { id } : undefined
}

/** Error copy that names the actual problem instead of blaming the first character. */
export function invalidProviderIDMessage(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return `Couldn't derive a provider id from that URL. Try a short id like tokenrouter instead.`
  }
  const bad = [...new Set([...trimmed].filter((ch) => !/[a-z0-9\-_]/.test(ch)))]
  const listed = bad.map((ch) => (ch === " " ? "space" : `"${ch}"`)).join(", ")
  return `Provider ids use lowercase letters, numbers, hyphens, underscores${bad.length ? ` — found ${listed}` : ""}. Example: tokenrouter`
}

type ProviderOptionBase = {
  title: string
  value: string
  description?: string
  category: string
}

type ProviderOption =
  | (ProviderOptionBase & {
      type: "provider"
      providerID: string
    })
  | (ProviderOptionBase & {
      type: "custom"
    })
  | (ProviderOptionBase & {
      type: "arcana-oauth"
    })

export function providerOptions(
  list: { id: string; name: string }[],
  opts: { showArcanaOauth?: boolean } = {},
): ProviderOption[] {
  const base: ProviderOption[] = pipe(
    list,
    sortBy(
      (x) => PROVIDER_PRIORITY[x.id] ?? 99,
      (x) => x.name.toLowerCase(),
      (x) => x.id,
    ),
    map((provider) => ({
      type: "provider" as const,
      title: provider.id === "opencode-go" ? "Arcana Plan" : provider.name,
      value: provider.id,
      providerID: provider.id,
      description: {
        arcana: "(Recommended)",
        anthropic: "(API key)",
        openai: "(ChatGPT Plus/Pro or API key)",
        "opencode-go": "Low cost plan for everyone",
      }[provider.id],
      category: provider.id in PROVIDER_PRIORITY ? "Popular" : "Providers",
    })),
  )
  const oauth: ProviderOption[] = opts.showArcanaOauth
    ? [
        {
          type: "arcana-oauth" as const,
          title: "Sign in with arcana",
          value: "__ARCANA_oauth__",
          description: "Free account · unlock more models",
          category: "Popular",
        },
      ]
    : []
  return [
    ...oauth,
    ...base,
    {
      type: "custom",
      title: "Other",
      value: CUSTOM_PROVIDER_OPTION_VALUE,
      description: "Custom provider",
      category: "Providers",
    },
  ]
}

export function normalizeCustomProviderID(value: string) {
  const providerID = value.trim().replace(/^@ai-sdk\//, "")
  if (!CUSTOM_PROVIDER_ID.test(providerID)) return
  return providerID
}

export function createDialogProviderOptions() {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()
  const onboarded = useConnected()
  const proxyKey = useHasProxyKey()

  async function promptCustomProvider(): Promise<{ id: string; baseURL?: string } | undefined> {
    while (true) {
      const value = await DialogPrompt.show(dialog, "Other", {
        placeholder: "Provider id or base URL",
        description: () => (
          <text fg={theme.textMuted}>
            Short id like {"tokenrouter"} — or paste your provider's base URL (e.g. https://api.tokenrouter.com/v1)
            and Arcana derives the rest. Press escape to cancel.
          </text>
        ),
      })
      if (value === null) return undefined

      const existing = new Set(sync.data.provider_next.all.map((provider) => provider.id))
      const parsed = parseCustomProviderInput(value, existing)
      if (parsed) return parsed

      toast.show({ variant: "error", message: invalidProviderIDMessage(value) })
    }
  }

  const options = createMemo(() => {
    // Show the OAuth option until we know the proxy key is present.
    // `loading` is true on the first paint — better to err on the side of
    // showing the option (a logged-in user can simply ignore it) than to
    // hide it during the brief gap before the resource resolves.
    const showArcanaOauth = !proxyKey.present()
    return pipe(
      providerOptions(sync.data.provider_next.all, { showArcanaOauth }),
      map((provider) => {
        if (provider.type === "arcana-oauth") {
          return {
            title: provider.title,
            value: provider.value,
            description: provider.description,
            category: provider.category,
            async onSelect() {
              await proxyKey.refetch()
              if (proxyKey.present()) {
                // User already has a key — refresh catalog in case it's stale
                // and jump straight to the model picker.
                await sdk.client.instance.dispose()
                await sync.bootstrap()
                dialog.replace(() => <DialogModel providerID="arcana" />)
                return
              }
              dialog.replace(() => <ArcanaOAuthMethod />)
            },
          }
        }

        if (provider.type === "custom") {
          return {
            title: provider.title,
            value: provider.value,
            description: provider.description,
            category: provider.category,
            async onSelect() {
              const parsed = await promptCustomProvider()
              if (!parsed) return
              return dialog.replace(() => (
                <ApiMethod providerID={parsed.id} title="API key" custom baseURL={parsed.baseURL} />
              ))
            },
          }
        }

        const providerID = provider.providerID
        const consoleManaged = isConsoleManagedProvider(sync.data.console_state.consoleManagedProviders, providerID)
        const connected = sync.data.provider_next.connected.includes(providerID)

        return {
          title: provider.title,
          value: provider.value,
          description: provider.description,
          footer: consoleManaged ? sync.data.console_state.activeOrgName : undefined,
          category: provider.category,
          gutter: connected && onboarded() ? () => <text fg={theme.success}>✓</text> : undefined,
          async onSelect() {
            if (consoleManaged) return
            // Skip auth if already connected (e.g., via ARCANA_PROXY_KEY)
            if (connected) {
              dialog.replace(() => <DialogModel providerID={providerID} />)
              return
            }

            const methods = sync.data.provider_auth[providerID] ?? [
              {
                type: "api",
                label: "API key",
              },
            ]
            let index: number | null = 0
            if (methods.length > 1) {
              index = await new Promise<number | null>((resolve) => {
                dialog.replace(
                  () => (
                    <DialogSelect
                      title="Select auth method"
                      options={methods.map((x, index) => ({
                        title: x.label,
                        value: index,
                      }))}
                      onSelect={(option) => resolve(option.value)}
                    />
                  ),
                  () => resolve(null),
                )
              })
            }
            if (index == null) return
            const method = methods[index]
            if (method.type === "oauth") {
              let inputs: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({
                  dialog,
                  prompts: method.prompts,
                })
                if (!value) return
                inputs = value
              }

              const result = await sdk.client.provider.oauth.authorize({
                providerID,
                method: index,
                inputs,
              })
              if (result.error) {
                toast.show({
                  variant: "error",
                  message: errorMessage(result.error),
                })
                dialog.clear()
                return
              }
              if (result.data?.method === "code") {
                dialog.replace(() => (
                  <CodeMethod providerID={providerID} title={method.label} index={index} authorization={result.data!} />
                ))
              }
              if (result.data?.method === "auto") {
                dialog.replace(() => (
                  <AutoMethod providerID={providerID} title={method.label} index={index} authorization={result.data!} />
                ))
              }
            }
            if (method.type === "api") {
              let metadata: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({ dialog, prompts: method.prompts })
                if (!value) return
                metadata = value
              }
              return dialog.replace(() => (
                <ApiMethod providerID={providerID} title={method.label} metadata={metadata} />
              ))
            }
          },
        }
      }),
    )
  })
  return options
}

export function DialogProvider() {
  const options = createDialogProviderOptions()
  return <DialogSelect title={`${Glyph.sigil} Connect a provider`} options={options()} />
}

interface AutoMethodProps {
  index: number
  providerID: string
  title: string
  authorization: ProviderAuthAuthorization
}
function AutoMethod(props: AutoMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const sync = useSync()
  const toast = useToast()
  const clipboard = useClipboard()

  useBindings(() => ({
    bindings: [
      {
        key: "c",
        desc: "Copy provider code",
        group: "Dialog",
        cmd: () => {
          const code =
            props.authorization.instructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0] ?? props.authorization.url
          clipboard
            .write?.(code)
            .then(() => toast.show({ message: COPY.inscribedToClipboard, variant: "info" }))
            .catch(toast.error)
        },
      },
    ],
  }))

  onMount(async () => {
    const result = await sdk.client.provider.oauth.callback({
      providerID: props.providerID,
      method: props.index,
    })
    if (result.error) {
      toast.show({
        variant: "error",
        message:
          "name" in result.error && result.error.name === "ProviderAuthOauthCallbackFailed"
            ? "OAuth authorization failed. Try /connect again."
            : errorMessage(result.error),
      })
      dialog.clear()
      return
    }
    await sdk.client.instance.dispose()
    await sync.bootstrap()
    dialog.replace(() => <DialogModel providerID={props.providerID} />)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box gap={1}>
        <Link href={props.authorization.url} fg={theme.primary} />
        <text fg={theme.textMuted}>{props.authorization.instructions}</text>
      </box>
      <text fg={theme.textMuted}>Waiting for authorization...</text>
      <text fg={theme.text}>
        c <span style={{ fg: theme.textMuted }}>copy</span>
      </text>
    </box>
  )
}

interface CodeMethodProps {
  index: number
  title: string
  providerID: string
  authorization: ProviderAuthAuthorization
}
function CodeMethod(props: CodeMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const [error, setError] = createSignal(false)

  return (
    <DialogPrompt
      title={props.title}
      placeholder="Authorization code"
      onConfirm={async (value) => {
        const { error } = await sdk.client.provider.oauth.callback({
          providerID: props.providerID,
          method: props.index,
          code: value,
        })
        if (!error) {
          await sdk.client.instance.dispose()
          await sync.bootstrap()
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
          return
        }
        setError(true)
      }}
      description={() => (
        <box gap={1}>
          <text fg={theme.textMuted}>{props.authorization.instructions}</text>
          <Link href={props.authorization.url} fg={theme.primary} />
          <Show when={error()}>
            <text fg={theme.error}>Invalid code</text>
          </Show>
        </box>
      )}
    />
  )
}

interface ApiMethodProps {
  providerID: string
  title: string
  metadata?: Record<string, string>
  custom?: boolean
  /** Present when the id was derived from a pasted base URL — register the provider after the key is saved. */
  baseURL?: string
}

/**
 * Probe an OpenAI-compatible endpoint for its model catalog. Tries
 * `<baseURL>/models`, falling back to `<origin>/v1/models` when the URL
 * omitted the version path. Returns discovered model ids (possibly empty).
 */
export async function discoverModelIDs(baseURL: string, apiKey: string): Promise<string[]> {
  const candidates = new Set<string>([`${baseURL}/models`])
  if (!/\/v1$/.test(baseURL)) candidates.add(`${baseURL}/v1/models`)
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3_500),
      })
      if (!res.ok) continue
      const json = (await res.json()) as { data?: Array<{ id?: string }> }
      const ids = (json.data ?? [])
        .map((model) => model.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
      if (ids.length > 0) return ids
    } catch {}
  }
  return []
}

/** The `provider.<id>` block written to global config for a URL-derived custom provider. */
export function customProviderConfigBlock(baseURL: string, modelIDs: string[]) {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: providerDisplayName(baseURL),
    options: { baseURL },
    ...(modelIDs.length > 0 ? { models: Object.fromEntries(modelIDs.map((id) => [id, {}])) } : {}),
  }
}

function providerDisplayName(baseURL: string): string {
  const host = new URL(baseURL).hostname.split(".").filter(Boolean)
  const word = (host.length > 1 ? host[host.length - 2] : host[0]) ?? "custom"
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Register a URL-derived custom provider in the GLOBAL config via the engine's
 * JSONC-merging PATCH /global/config. Deep-merge means only this provider key
 * is touched; the engine disposes instances on change so the provider is live
 * immediately — no restart, no hand-editing arcana.json.
 */
async function registerCustomProvider(input: {
  sdk: ReturnType<typeof useSDK>["client"]
  providerID: string
  baseURL: string
  apiKey: string
}): Promise<{ ok: boolean; models: number }> {
  const modelIDs = await discoverModelIDs(input.baseURL, input.apiKey)
  try {
    const { error } = await input.sdk.global.config.update({
      config: {
        provider: {
          [input.providerID]: customProviderConfigBlock(input.baseURL, modelIDs),
        },
      },
    })
    if (error) return { ok: false, models: 0 }
  } catch {
    // Never propagate: callers report failure through toasts, not crashes.
    return { ok: false, models: 0 }
  }
  return { ok: true, models: modelIDs.length }
}
export { registerCustomProvider }
function ApiMethod(props: ApiMethodProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const { theme } = useTheme()
  const [busy, setBusy] = createSignal(false)
  const [phase, setPhase] = createSignal("Working…")
  const description = ({
    arcana: (
      <box gap={1}>
        <text fg={theme.textMuted}>
          Arcana Proxy gives you access to multiple LLM providers through a single API key — no per-provider setup required.
        </text>
        <text fg={theme.textMuted}>
          Already have an Arcana key? Paste it here. Or pick <span style={{ fg: theme.primary }}>Sign in with arcana</span>{" "}
          above to log in with a free account.
        </text>
      </box>
    ),
    "opencode-go": (
      <box gap={1}>
        <text fg={theme.textMuted}>
          {BRAND_TIERS.go.longDescription}
        </text>
        <text fg={theme.text}>
          Go to <span style={{ fg: theme.primary }}>{BRAND_TIERS.go.url}</span> and enable {BRAND_TIERS.go.name}
        </text>
      </box>
    ),
  } as any)[props.providerID] ?? undefined

  return (
    <DialogPrompt
      title={props.title}
      placeholder="API key"
      description={description as any}
      busy={busy()}
      busyText={phase()}
      onConfirm={async (value) => {
        if (!value || busy()) return
        setBusy(true)
        try {
          // URL-derived custom provider: save the key and probe the model
          // catalog in parallel (discovery needs only the typed key), then
          // register into global config.
          if (props.custom && props.baseURL) {
            setPhase("Saving key…")
            const known = sync.data.provider_next.all.some((provider) => provider.id === props.providerID)
            if (!known) {
              setPhase("Discovering models…")
              const [, registered] = await Promise.all([
                sdk.client.auth.set({
                  providerID: props.providerID,
                  auth: { type: "api", key: value },
                }),
                registerCustomProvider({
                  sdk: sdk.client,
                  providerID: props.providerID,
                  baseURL: props.baseURL,
                  apiKey: value,
                }),
              ])
              if (!registered.ok) {
                toast.show({
                  variant: "error",
                  message: `Saved the key, but couldn't register ${props.providerID} — add it to arcana.json manually.`,
                })
                dialog.clear()
                return
              }
              // The config endpoint disposes instances ASYNC — a single
              // immediate bootstrap can race the rebuild and reconcile a stale
              // list without the new provider. Poll until the fresh instance
              // reports it (bounded), so the picker and providers list agree.
              setPhase("Registering…")
              for (let attempt = 0; attempt < 10; attempt++) {
                await Bun.sleep(300)
                await sync.bootstrap()
                if (sync.data.provider_next.all.some((provider) => provider.id === props.providerID)) break
              }
              if (registered.models > 0) {
                dialog.replace(() => <DialogModel providerID={props.providerID} />)
                return
              }
              toast.show({
                variant: "info",
                message: `${props.providerID} registered at ${props.baseURL}, but no models were discovered — add them in arcana.json.`,
              })
              dialog.clear()
              return
            }
          }

          setPhase("Saving key…")
          const { error } = await sdk.client.auth.set({
            providerID: props.providerID,
            auth: {
              type: "api",
              key: value,
              ...(props.metadata ? { metadata: props.metadata } : {}),
            },
          })
          if (error) {
            toast.show({ variant: "error", message: `Failed to save key: ${errorMessage(error)}` })
            return
          }

          const known = sync.data.provider_next.all.some((provider) => provider.id === props.providerID)

          await sdk.client.instance.dispose()
          await sync.bootstrap()

          if (props.custom && !known) {
            toast.show({
              variant: "info",
              message: `Saved credential for ${props.providerID}. Configure it in arcana.json to use it.`,
            })
            dialog.clear()
            return
          }
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
        } catch (err) {
          // Never let a failure die silently — every path must surface here.
          toast.show({
            variant: "error",
            message: `Provider setup failed: ${err instanceof Error ? err.message : String(err)}`,
          })
        } finally {
          setBusy(false)
        }
      }}
    />
  )
}

interface PromptsMethodProps {
  dialog: ReturnType<typeof useDialog>
  prompts: NonNullable<ProviderAuthMethod["prompts"]>[number][]
}
async function PromptsMethod(props: PromptsMethodProps) {
  const inputs: Record<string, string> = {}
  for (const prompt of props.prompts) {
    if (prompt.when) {
      const value = inputs[prompt.when.key]
      if (value === undefined) continue
      const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value
      if (!matches) continue
    }

    if (prompt.type === "select") {
      const value = await new Promise<string | null>((resolve) => {
        props.dialog.replace(
          () => (
            <DialogSelect
              title={prompt.message}
              options={prompt.options.map((x) => ({
                title: x.label,
                value: x.value,
                description: x.hint,
              }))}
              onSelect={(option) => resolve(option.value)}
            />
          ),
          () => resolve(null),
        )
      })
      if (value === null) return null
      inputs[prompt.key] = value
      continue
    }

    const value = await new Promise<string | null>((resolve) => {
      props.dialog.replace(
        () => (
          <DialogPrompt title={prompt.message} placeholder={prompt.placeholder} onConfirm={(value) => resolve(value)} />
        ),
        () => resolve(null),
      )
    })
    if (value === null) return null
    inputs[prompt.key] = value
  }
  return inputs
}
