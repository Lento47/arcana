import { Context, Effect, Layer } from "effect"
import { Credential } from "../credential"
import { IntegrationSchema } from "../integration/schema"
import { ValidateRequest, ValidateResponse, ActivateRequest, ActivateResponse, LicenseInfo } from "./schema"
import { getMachineId } from "./machine"

const LICENSE_SERVER = "https://api-arcana.otnelhq.com"
const LICENSE_INTEGRATION_ID = IntegrationSchema.ID.make("arcana_license")

export class LicenseError {
  static NotActivated = new Error("License not activated. Run: arcana license activate <key>")
  static Expired = new Error("License expired. Renew at https://arcana.otnelhq.com")
  static ServerUnreachable = new Error("License server unreachable. Check internet connection.")
}

export interface Interface {
  readonly validate: Effect.Effect<ValidateResponse, Error>
  readonly activate: (key: string) => Effect.Effect<ActivateResponse, Error>
  readonly deactivate: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<LicenseInfo | null>
  readonly hasFeature: (feature: string) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/License") {}

let cachedLicense: LicenseInfo | null = null

function post(path: string, body: unknown): Effect.Effect<Response, Error> {
  return Effect.tryPromise({
    try: () =>
      fetch(`${LICENSE_SERVER}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      }),
    catch: (e) => new Error(`License server unreachable: ${e instanceof Error ? e.message : String(e)}`),
  })
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const credential = yield* Credential.Service

    const getStoredKey = () =>
      Effect.gen(function* () {
        const stored = yield* credential.list(LICENSE_INTEGRATION_ID)
        if (stored.length === 0) return null
        const val = stored[0]!.value
        if (val.type !== "license") return null
        return val.key
      })

    const validate: Interface["validate"] = Effect.gen(function* () {
      const key = yield* getStoredKey()
      if (!key) return new ValidateResponse({ valid: false })
      const machineId = getMachineId()
      const body = new ValidateRequest({ licenseKey: key, machineId })
      const response = yield* post("/api/license/validate", body)
      const json = yield* Effect.tryPromise({
        try: () => response.json() as Promise<ValidateResponse>,
        catch: () => new Error("Invalid response from license server"),
      })
      if (response.status === 200 && json.valid) {
        cachedLicense = new LicenseInfo({
          key,
          tier: json.tier ?? "free",
          features: json.features ?? [],
          activatedAt: Date.now(),
          lastValidatedAt: Date.now(),
        })
      }
      return json as ValidateResponse
    })

    const activate: Interface["activate"] = (key: string) =>
      Effect.gen(function* () {
        const machineId = getMachineId()
        const body = new ActivateRequest({ licenseKey: key, machineId })
        const response = yield* post("/api/license/activate", body)
        const json = yield* Effect.tryPromise({
          try: () => response.json() as Promise<ActivateResponse>,
          catch: () => new Error("Invalid response from license server"),
        })
        if (json.valid) {
          yield* credential.create({
            integrationID: LICENSE_INTEGRATION_ID,
            label: "License Key",
            value: new Credential.License({
              type: "license",
              key,
              tier: json.tier ?? "free",
              activatedAt: Date.now(),
            }),
          })
          cachedLicense = new LicenseInfo({
            key,
            tier: json.tier ?? "free",
            features: json.features ?? [],
            activatedAt: Date.now(),
            lastValidatedAt: Date.now(),
          })
        }
        return json as ActivateResponse
      })

    const deactivate: Interface["deactivate"] = () =>
      Effect.gen(function* () {
        const stored = yield* credential.list(LICENSE_INTEGRATION_ID)
        for (const s of stored) {
          yield* credential.remove(s.id)
        }
        cachedLicense = null
      })

    const status: Interface["status"] = () => Effect.sync(() => cachedLicense)

    const hasFeature: Interface["hasFeature"] = (feature: string) =>
      Effect.sync(() => cachedLicense?.features.includes(feature) ?? false)

    return Service.of({ validate, activate, deactivate, status, hasFeature })
  }),
)

export { LICENSE_SERVER, LICENSE_INTEGRATION_ID }
