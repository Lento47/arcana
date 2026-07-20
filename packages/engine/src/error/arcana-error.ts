/**
 * Arcana error taxonomy — stable internal codes with dual-facing messages.
 *
 * - `code` / `type` / `internal` → operators, logs, support, wiki
 * - `message` / `recovery` → end users (never raw provider/tid noise)
 *
 * See docs/architecture/arcana-error-taxonomy.md
 */

export const ARCANA_ERROR_CODES = [
  "ARC_AUTH_REQUIRED",
  "ARC_AUTH_INVALID",
  "ARC_CREDITS_EXHAUSTED",
  "ARC_QUOTA_DAILY",
  "ARC_RATE_LIMITED",
  "ARC_MODEL_UNSUPPORTED",
  "ARC_MODEL_NOT_FOUND",
  "ARC_PROVIDER_UNAVAILABLE",
  "ARC_PROVIDER_BALANCE",
  "ARC_CONTEXT_OVERFLOW",
  "ARC_NETWORK",
  "ARC_REQUEST_INVALID",
  "ARC_ALL_PROVIDERS_FAILED",
  "ARC_IMAGE_FAILED",
  "ARC_FREE_MODEL_ONLY",
  "ARC_FREE_EXHAUSTED",
  "ARC_INTERNAL",
] as const

export type ArcanaErrorCode = (typeof ARCANA_ERROR_CODES)[number]

export type ArcanaErrorType =
  | "auth"
  | "quota"
  | "rate_limit"
  | "model"
  | "provider"
  | "network"
  | "request"
  | "internal"

/** Internal diagnostic payload — never show wholesale in TUI/chat. */
export type ArcanaErrorInternal = {
  provider?: string
  providersAttempted?: string[]
  upstreamStatus?: number
  upstreamCode?: string
  upstreamMessage?: string
  model?: string
  tid?: string
  proxyBuild?: string
  raw?: string
}

export type ArcanaErrorBody = {
  /** Stable machine code for logs / support / wiki lookup */
  code: ArcanaErrorCode
  /** Coarse category for UI grouping */
  type: ArcanaErrorType
  /** User-facing message — Arcana voice, no vendor noise */
  message: string
  /** Optional recovery hints for the user */
  recovery?: string[]
  /** Whether SessionRetry / client may retry */
  retryable: boolean
  /** HTTP status to surface on the wire */
  httpStatus: number
  /** Operator-only diagnostics */
  internal?: ArcanaErrorInternal
}

/** Wire envelope returned by Arcana Proxy (and preferred by clients). */
export type ArcanaErrorResponse = {
  error: {
    code: ArcanaErrorCode
    type: ArcanaErrorType
    message: string
    recovery?: string[]
    retryable: boolean
  }
  /** Present on proxy responses; strip before user paste in support tickets if needed */
  internal?: ArcanaErrorInternal
  /** Legacy field kept for older clients during transition */
  message?: string
  provider?: string
  model?: string
}

export function codeToType(code: ArcanaErrorCode): ArcanaErrorType {
  switch (code) {
    case "ARC_AUTH_REQUIRED":
    case "ARC_AUTH_INVALID":
      return "auth"
    case "ARC_CREDITS_EXHAUSTED":
    case "ARC_QUOTA_DAILY":
    case "ARC_PROVIDER_BALANCE":
      return "quota"
    case "ARC_RATE_LIMITED":
      return "rate_limit"
    case "ARC_MODEL_UNSUPPORTED":
    case "ARC_MODEL_NOT_FOUND":
      return "model"
    case "ARC_PROVIDER_UNAVAILABLE":
    case "ARC_ALL_PROVIDERS_FAILED":
      return "provider"
    case "ARC_NETWORK":
      return "network"
    case "ARC_REQUEST_INVALID":
      return "request"
    case "ARC_CONTEXT_OVERFLOW":
      return "request"
    case "ARC_IMAGE_FAILED":
      return "provider"
    case "ARC_FREE_MODEL_ONLY":
      return "model"
    case "ARC_FREE_EXHAUSTED":
      return "quota"
    case "ARC_INTERNAL":
    default:
      return "internal"
  }
}

/** Default user copy + recovery for each code (wiki may expand). */
export const ARCANA_ERROR_CATALOG: Record<
  ArcanaErrorCode,
  { message: string; recovery: string[]; retryable: boolean; httpStatus: number }
> = {
  ARC_AUTH_REQUIRED: {
    message: "Arcana needs you to sign in before this request can continue.",
    recovery: ["Run `arcana console login`", "Or set ARCANA_PROXY_KEY / ~/.arcana/proxy_key"],
    retryable: false,
    httpStatus: 401,
  },
  ARC_AUTH_INVALID: {
    message: "Your Arcana session or license key was rejected.",
    recovery: ["Sign out and run `arcana console login` again", "Check that the key is not truncated"],
    retryable: false,
    httpStatus: 401,
  },
  ARC_CREDITS_EXHAUSTED: {
    message: "No Arcana credits remaining for this account.",
    recovery: ["Top up with `arcana proxy buy` or the workspace billing page", "Retry after credits land"],
    retryable: false,
    httpStatus: 402,
  },
  ARC_QUOTA_DAILY: {
    message: "Daily request limit reached for your plan.",
    recovery: ["Wait until the daily reset (UTC)", "Upgrade plan for higher daily capacity"],
    retryable: false,
    httpStatus: 429,
  },
  ARC_RATE_LIMITED: {
    message: "Too many requests — Arcana is slowing this account briefly.",
    recovery: ["Wait a few seconds and retry", "Reduce parallel tool/LLM bursts"],
    retryable: true,
    httpStatus: 429,
  },
  ARC_MODEL_UNSUPPORTED: {
    message: "This model cannot run that operation through Arcana right now.",
    recovery: [
      "Switch to a standard chat model (e.g. openai/gpt-4o-mini)",
      "For images use the image_generate tool, not chat",
      "Prefix with or/ to force OpenRouter when available",
    ],
    retryable: false,
    httpStatus: 400,
  },
  ARC_MODEL_NOT_FOUND: {
    message: "That model id is not available on any configured route.",
    recovery: ["Run model list / pick a catalog id", "Try openai/gpt-4o-mini or another known chat model"],
    retryable: false,
    httpStatus: 404,
  },
  ARC_PROVIDER_UNAVAILABLE: {
    message: "A backend route is temporarily unavailable. Arcana could not complete the call.",
    recovery: ["Retry in a moment", "Try another model", "Check status if the problem persists"],
    retryable: true,
    httpStatus: 502,
  },
  ARC_PROVIDER_BALANCE: {
    message: "An upstream route is out of capacity. Arcana tried alternate routes when possible.",
    recovery: ["Retry — failover may succeed", "Use an or/ OpenRouter model explicitly", "Contact support if all routes fail"],
    retryable: true,
    httpStatus: 502,
  },
  ARC_CONTEXT_OVERFLOW: {
    message: "This conversation is too large for the selected model.",
    recovery: ["Compact or start a new session", "Switch to a larger-context model"],
    retryable: false,
    httpStatus: 400,
  },
  ARC_NETWORK: {
    message: "Network error talking to Arcana services.",
    recovery: ["Check connectivity", "Retry", "If on the web, hard-refresh after site deploys"],
    retryable: true,
    httpStatus: 502,
  },
  ARC_REQUEST_INVALID: {
    message: "The request was invalid and could not be processed.",
    recovery: ["Check model, prompt, and tool parameters", "Retry with a simpler request"],
    retryable: false,
    httpStatus: 400,
  },
  ARC_ALL_PROVIDERS_FAILED: {
    message: "All available model routes failed for this request.",
    recovery: ["Retry shortly", "Change model", "Check account credits and proxy health"],
    retryable: true,
    httpStatus: 502,
  },
  ARC_IMAGE_FAILED: {
    message: "Image generation failed.",
    recovery: ["Retry with a shorter prompt", "Check credits", "Try another image model"],
    retryable: true,
    httpStatus: 502,
  },
  ARC_FREE_MODEL_ONLY: {
    message: "Free accounts use community free models only (or image gen is Pro/credits).",
    recovery: [
      "Use openrouter/free or any model id ending in :free",
      "Upgrade to Pro for the full catalog and image generation",
    ],
    retryable: false,
    httpStatus: 400,
  },
  ARC_FREE_EXHAUSTED: {
    message: "Your free weekly session is used up (turns, time window, or token allowance).",
    recovery: ["Wait until free reset", "Upgrade to Pro for more capacity"],
    retryable: false,
    httpStatus: 429,
  },
  ARC_INTERNAL: {
    message: "Something went wrong inside Arcana.",
    recovery: ["Retry", "If it keeps happening, report with the error code ARC_INTERNAL"],
    retryable: true,
    httpStatus: 500,
  },
}

export function buildArcanaError(
  code: ArcanaErrorCode,
  overrides?: Partial<Pick<ArcanaErrorBody, "message" | "recovery" | "retryable" | "httpStatus" | "internal">>,
): ArcanaErrorBody {
  const base = ARCANA_ERROR_CATALOG[code]
  return {
    code,
    type: codeToType(code),
    message: overrides?.message ?? base.message,
    recovery: overrides?.recovery ?? base.recovery,
    retryable: overrides?.retryable ?? base.retryable,
    httpStatus: overrides?.httpStatus ?? base.httpStatus,
    internal: overrides?.internal,
  }
}

export function toWireResponse(err: ArcanaErrorBody): ArcanaErrorResponse {
  return {
    error: {
      code: err.code,
      type: err.type,
      message: err.message,
      recovery: err.recovery,
      retryable: err.retryable,
    },
    internal: err.internal,
    // legacy top-level fields for older clients
    message: err.message,
    provider: err.internal?.provider,
    model: err.internal?.model,
  }
}

/** Format for TUI / CLI: user message + recovery, never dumps internal. */
export function formatUserFacing(err: ArcanaErrorBody | ArcanaErrorResponse): string {
  const body =
    "code" in err && typeof (err as ArcanaErrorBody).code === "string"
      ? (err as ArcanaErrorBody)
      : (() => {
          const w = err as ArcanaErrorResponse
          return {
            code: w.error.code,
            type: w.error.type,
            message: w.error.message,
            recovery: w.error.recovery,
            retryable: w.error.retryable,
            httpStatus: 0,
            internal: w.internal,
          } satisfies ArcanaErrorBody
        })()

  const lines = [`${body.message}`, `Code: ${body.code}`]
  if (body.recovery?.length) {
    lines.push("Next steps:")
    for (const r of body.recovery) lines.push(`  • ${r}`)
  }
  return lines.join("\n")
}
