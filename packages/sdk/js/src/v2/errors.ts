/**
 * SDK 1.0 stable error model (E3).
 *
 * Typed errors with stable machine codes. Consumers may rely on `code` for
 * automation; `message` is human-readable and may change.
 */

export type ArcanaErrorCode =
  | "AUTHORIZATION_DENIED"
  | "APPROVAL_REQUIRED"
  | "VERIFICATION_FAILED"
  | "TRANSPORT_ERROR"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL"

export class ArcanaError extends Error {
  readonly code: ArcanaErrorCode
  readonly status?: number
  readonly details?: unknown

  constructor(input: { code: ArcanaErrorCode; message: string; status?: number; details?: unknown }) {
    super(input.message)
    this.name = "ArcanaError"
    this.code = input.code
    this.status = input.status
    this.details = input.details
  }
}

export class AuthorizationDeniedError extends ArcanaError {
  constructor(message: string, details?: unknown) {
    super({ code: "AUTHORIZATION_DENIED", message, status: 403, details })
    this.name = "AuthorizationDeniedError"
  }
}

export class ApprovalRequiredError extends ArcanaError {
  constructor(message: string, details?: unknown) {
    super({ code: "APPROVAL_REQUIRED", message, status: 402, details })
    this.name = "ApprovalRequiredError"
  }
}

export class VerificationFailedError extends ArcanaError {
  constructor(message: string, details?: unknown) {
    super({ code: "VERIFICATION_FAILED", message, status: 400, details })
    this.name = "VerificationFailedError"
  }
}

export class TransportError extends ArcanaError {
  constructor(message: string, details?: unknown) {
    super({ code: "TRANSPORT_ERROR", message, details })
    this.name = "TransportError"
  }
}

export class InvalidRequestError extends ArcanaError {
  constructor(message: string, details?: unknown) {
    super({ code: "INVALID_REQUEST", message, status: 400, details })
    this.name = "InvalidRequestError"
  }
}

export class NotFoundError extends ArcanaError {
  constructor(message: string, details?: unknown) {
    super({ code: "NOT_FOUND", message, status: 404, details })
    this.name = "NotFoundError"
  }
}

/**
 * Map an HTTP error body onto the stable taxonomy. Non-JSON responses map to
 * TRANSPORT_ERROR; known status codes map to their semantic classes.
 */
export function toArcanaError(
  status: number,
  body: unknown,
): ArcanaError {
  const details = typeof body === "string" ? { message: body } : body
  const message = typeof body === "string" ? body : JSON.stringify(body)
  switch (status) {
    case 400:
      return new InvalidRequestError(message, details)
    case 401:
    case 403:
      return new AuthorizationDeniedError(message, details)
    case 402:
      return new ApprovalRequiredError(message, details)
    case 404:
      return new NotFoundError(message, details)
    default:
      return new TransportError(`HTTP ${status}: ${message}`, details)
  }
}
