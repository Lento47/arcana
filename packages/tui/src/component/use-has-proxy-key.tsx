import { createResource } from "solid-js"
import { useSDK } from "../context/sdk"

export type ProxyKeyState = {
  present: boolean
  loading: boolean
  error: Error | undefined
}

/**
 * Read whether a `proxy_key` is present on disk (or in `ARCANA_PROXY_KEY`).
 * The TUI uses this to decide whether to show the "Sign in with arcana" option
 * in `/connect`. A free-tier user has no proxy key; a licensed user does.
 *
 * Resource-backed so it reactively refetches on mount and never blocks the
 * dialog. Returns a tuple-compatible shape so consumers can use it as a memo.
 */
export function useHasProxyKey() {
  const sdk = useSDK()
  const [data, { refetch }] = createResource(async () => {
    const result = await sdk.client.experimental.console.proxyKeyPresent()
    if (result.error) {
      // Free-tier users without a license may not have permission to call this
      // endpoint; treat as "no key" so the OAuth option still surfaces.
      return { present: false }
    }
    return result.data ?? { present: false }
  })
  return {
    present: () => data()?.present === true,
    loading: () => data.loading,
    error: () => data.error as Error | undefined,
    refetch,
  }
}
