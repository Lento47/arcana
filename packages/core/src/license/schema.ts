import { Schema } from "effect"

export const LicenseTier = Schema.Union([
  Schema.Literal("free"),
  Schema.Literal("pro"),
  Schema.Literal("team"),
  Schema.Literal("enterprise"),
])
export type LicenseTier = typeof LicenseTier.Type

export const LicenseFeatures = Schema.Array(Schema.String)

export class ValidateRequest extends Schema.Class<ValidateRequest>("ValidateRequest")({
  licenseKey: Schema.String,
  machineId: Schema.String,
  version: Schema.optional(Schema.String),
}) {}

export class ValidateResponse extends Schema.Class<ValidateResponse>("ValidateResponse")({
  valid: Schema.Boolean,
  tier: Schema.optional(LicenseTier),
  features: Schema.optional(LicenseFeatures),
  expiresAt: Schema.optional(Schema.Number),
  machinesActivated: Schema.optional(Schema.Number),
  seatsUsed: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
}) {}

export class ActivateRequest extends Schema.Class<ActivateRequest>("ActivateRequest")({
  licenseKey: Schema.String,
  machineId: Schema.String,
}) {}

export class ActivateResponse extends Schema.Class<ActivateResponse>("ActivateResponse")({
  valid: Schema.Boolean,
  tier: Schema.optional(LicenseTier),
  features: Schema.optional(LicenseFeatures),
  machinesActivated: Schema.Number,
  maxMachines: Schema.Number,
  error: Schema.optional(Schema.String),
}) {}

export class LicenseInfo extends Schema.Class<LicenseInfo>("LicenseInfo")({
  key: Schema.String,
  tier: LicenseTier,
  features: LicenseFeatures,
  activatedAt: Schema.Number,
  lastValidatedAt: Schema.Number,
}) {}
