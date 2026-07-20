/**
 * Map raw upstream / proxy / HTTP failures into ArcanaErrorBody.
 * Pure functions — safe to unit test without network.
 */
import {
  type ArcanaErrorBody,
  type ArcanaErrorCode,
  type ArcanaErrorInternal,
  buildArcanaError,
} from "./arcana-error"

export type UpstreamMapInput = {
  status?: number
  bodyText?: string
  provider?: string
  providersAttempted?: string[]
  model?: string
  /** When the failure is known to be Arcana proxy (not bare OpenAI) */
  source?: "arcana-proxy" | "provider" | "client" | "unknown"
}

function parseJson(text?: string): any | undefined {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function extractUpstreamMessage(body: any, fallback: string): string {
  if (!body) return fallback
  if (typeof body.message === "string") return body.message
  if (typeof body.error === "string") return body.error
  if (typeof body.error?.message === "string") return body.error.message
  if (typeof body.error?.code === "string" && !body.error?.message) return body.error.code
  return fallback
}

function extractTid(text: string): string | undefined {
  const m = text.match(/tid:\s*(\d{10,})/i)
  return m?.[1]
}

function classify(status: number | undefined, text: string, body: any): ArcanaErrorCode {
  const msg = `${text} ${extractUpstreamMessage(body, "")}`.toLowerCase()
  const code = String(body?.error?.code ?? body?.code ?? body?.error ?? "").toLowerCase()

  // Explicit Arcana proxy codes already on the wire
  if (code === "insufficient_balance" || msg.includes("insufficient_balance")) return "ARC_CREDITS_EXHAUSTED"
  if (code === "daily_limit_reached" || msg.includes("daily_limit_reached")) return "ARC_QUOTA_DAILY"
  if (code === "unauthorized" || status === 401) {
    if (msg.includes("expired") || msg.includes("invalid")) return "ARC_AUTH_INVALID"
    return "ARC_AUTH_REQUIRED"
  }
  if (status === 402 || msg.includes("no credits") || (msg.includes("insufficient") && msg.includes("credit"))) {
    return "ARC_CREDITS_EXHAUSTED"
  }
  // Upstream vendor balance (aihubmix/azure) — not the user's Arcana credit ledger
  if (
    msg.includes("recharge your account")
    || msg.includes("account balance is insufficient")
    || (msg.includes("insufficient") && msg.includes("balance") && !msg.includes("credit"))
  ) {
    return "ARC_PROVIDER_BALANCE"
  }
  if (status === 429 || code === "rate_limited" || msg.includes("rate limit") || msg.includes("rate_limited")) {
    if (msg.includes("daily")) return "ARC_QUOTA_DAILY"
    return "ARC_RATE_LIMITED"
  }
  if (
    msg.includes("unsupported")
    || msg.includes("operation is not")
    || msg.includes("not supported")
    || msg.includes("requested operation")
  ) {
    return "ARC_MODEL_UNSUPPORTED"
  }
  if (
    msg.includes("no endpoints found")
    || msg.includes("not a valid model")
    || msg.includes("model_not_found")
    || msg.includes("does not exist")
    || code === "model_not_found"
  ) {
    return "ARC_MODEL_NOT_FOUND"
  }
  if (
    msg.includes("no_available_channel")
    || msg.includes("cannot be routed")
    || msg.includes("no channel")
  ) {
    return "ARC_PROVIDER_UNAVAILABLE"
  }
  if (
    msg.includes("context") && (msg.includes("exceed") || msg.includes("too long") || msg.includes("maximum"))
  ) {
    return "ARC_CONTEXT_OVERFLOW"
  }
  if (msg.includes("image_generation") || msg.includes("empty_image")) return "ARC_IMAGE_FAILED"
  if (code === "arc_free_exhausted" || (msg.includes("free") && (msg.includes("exhaust") || msg.includes("weekly session")))) {
    return "ARC_FREE_EXHAUSTED"
  }
  if (code === "arc_free_model_only" || msg.includes("free models only") || msg.includes("community free")) {
    return "ARC_FREE_MODEL_ONLY"
  }
  if (msg.includes("all_providers_failed") || code === "all_providers_failed") return "ARC_ALL_PROVIDERS_FAILED"
  if (status === 408 || status === 502 || status === 503 || status === 504) return "ARC_PROVIDER_UNAVAILABLE"
  if (status !== undefined && status >= 500) return "ARC_PROVIDER_UNAVAILABLE"
  if (status === 400 || status === 422) return "ARC_REQUEST_INVALID"
  if (msg.includes("network") || msg.includes("fetch failed") || msg.includes("econnreset")) return "ARC_NETWORK"
  return "ARC_INTERNAL"
}

/**
 * Map an upstream failure into a full Arcana error body.
 */
export function mapUpstreamToArcanaError(input: UpstreamMapInput): ArcanaErrorBody {
  const bodyText = input.bodyText ?? ""
  const body = parseJson(bodyText)
  // Prefer already-mapped Arcana envelope
  if (body?.error?.code && String(body.error.code).startsWith("ARC_")) {
    const code = body.error.code as ArcanaErrorCode
    return buildArcanaError(code, {
      message: typeof body.error.message === "string" ? body.error.message : undefined,
      recovery: Array.isArray(body.error.recovery) ? body.error.recovery.map(String) : undefined,
      retryable: typeof body.error.retryable === "boolean" ? body.error.retryable : undefined,
      internal: body.internal ?? {
        provider: input.provider ?? body.provider,
        model: input.model ?? body.model,
        upstreamMessage: bodyText.slice(0, 500),
      },
    })
  }

  // Legacy proxy shape: { error: "upstream_error", message, provider }
  const legacyMsg =
    typeof body?.message === "string"
      ? body.message
      : typeof body?.error === "string"
        ? body.error
        : bodyText

  const code = classify(input.status, legacyMsg + " " + bodyText, body)
  const upstreamMessage = extractUpstreamMessage(body, legacyMsg).slice(0, 500)
  const tid = extractTid(upstreamMessage) ?? extractTid(bodyText)

  const internal: ArcanaErrorInternal = {
    provider: input.provider ?? (typeof body?.provider === "string" ? body.provider : undefined),
    providersAttempted: input.providersAttempted
      ?? (Array.isArray(body?.providers) ? body.providers.map(String) : undefined),
    upstreamStatus: input.status,
    upstreamCode:
      typeof body?.error?.code === "string"
        ? body.error.code
        : typeof body?.error === "string"
          ? body.error
          : undefined,
    upstreamMessage,
    model: input.model ?? (typeof body?.model === "string" ? body.model : undefined),
    tid,
    raw: bodyText.slice(0, 800),
  }

  // Enrich a few codes with dynamic user detail (still Arcana voice)
  if (code === "ARC_CREDITS_EXHAUSTED") {
    const bal = body?.balance
    const req = body?.required
    const detail =
      typeof bal === "number" && typeof req === "number" ? ` (have ${bal}, need ${req})` : ""
    return buildArcanaError(code, {
      message: `No Arcana credits remaining${detail}.`,
      internal,
    })
  }

  return buildArcanaError(code, { internal })
}

/** Extract a short support ref from internal (tid or code). */
export function supportRef(err: ArcanaErrorBody): string {
  if (err.internal?.tid) return `tid:${err.internal.tid}`
  return err.code
}
