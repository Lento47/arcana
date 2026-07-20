export const normalizeServerUrl = (input: string): string => {
  const url = new URL(input)
  url.search = ""
  url.hash = ""

  const pathname = url.pathname.replace(/\/+$/, "")
  return pathname.length === 0 ? url.origin : `${url.origin}${pathname}`
}

/**
 * Build the browser URL for device-flow verification.
 * Servers may return either:
 *   - absolute: "https://host/auth/device?code=ABCD"
 *   - relative: "/device?user_code=ABCD" (OpenCode-style)
 * Always joining with the server origin breaks absolute URIs
 * (e.g. https://hosthttps://host/...).
 */
export const resolveVerificationUrl = (server: string, verificationUriComplete: string): string => {
  let uri = verificationUriComplete.trim()
  if (!uri) return normalizeServerUrl(server)

  // Repair accidental double-prefix: https://hosthttps://host/path
  // (older CLI joined origin + absolute verification_uri_complete)
  uri = uri.replace(/^(https?:\/\/[^/\s]+)(https?:\/\/)/i, "$2")

  // Absolute URL (http/https) — use as-is
  if (/^https?:\/\//i.test(uri)) {
    try {
      return new URL(uri).toString()
    } catch {
      return uri
    }
  }

  // Protocol-relative //host/path
  if (uri.startsWith("//")) {
    try {
      return new URL(`https:${uri}`).toString()
    } catch {
      return `https:${uri}`
    }
  }

  // Relative path
  const base = normalizeServerUrl(server)
  const path = uri.startsWith("/") ? uri : `/${uri}`
  return `${base}${path}`
}
