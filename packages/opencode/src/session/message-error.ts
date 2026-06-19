import { Schema } from "effect"
import { NamedError } from "@arcana/core/util/error"

export class OutputLengthError extends Schema.TaggedErrorClass<OutputLengthError>()("MessageOutputLengthError", {}) {}

export class AuthError extends Schema.TaggedErrorClass<AuthError>()("ProviderAuthError", {
  providerID: Schema.String,
  message: Schema.String,
}) {}

// Schema.TaggedErrorClass IS a Schema (extends Schema.Class), so the class itself
// serves as the error schema for union construction.
export const Shared = [AuthError, NamedError.Unknown.EffectSchema, OutputLengthError] as const
export const SharedSchema = Schema.Union(Shared)

export * as MessageError from "./message-error"
