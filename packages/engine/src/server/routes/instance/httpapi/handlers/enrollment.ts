import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { decodeCanonicalBase64url } from "@arcana/core/crypto/canonical-serializer"
import {
  enrollNode,
  rotateNodeKey,
  setNodeStatus,
  type JoinToken,
} from "@arcana/core/crypto/node-enrollment"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { JoinTokenSchema } from "../groups/enrollment"
import { controlStateFor, issuerContext } from "./control-state"

function trustDomainFromEnv(): string {
  return process.env.ARCANA_CONTROL_TRUST_DOMAIN ?? "arcana.local"
}

function organizationIdFromEnv(): string {
  return process.env.ARCANA_CONTROL_ORGANIZATION_ID ?? "org-arcana"
}

export const enrollmentHandlers = HttpApiBuilder.group(InstanceHttpApi, "enrollment", (handlers) =>
  Effect.gen(function* () {
    const resolveDirectory = Effect.fn("EnrollmentHttpApi.resolveDirectory")(function* (
      queryDirectory?: string,
    ) {
      const routeDirectory = Option.getOrUndefined(
        (yield* Effect.serviceOption(WorkspaceRouteContext)).pipe(
          Option.map((ctx) => ctx.directory),
        ),
      )
      return routeDirectory || queryDirectory || process.cwd()
    })

    const enroll = Effect.fn("EnrollmentHttpApi.enroll")(function* (ctx: {
      payload: { joinToken: typeof JoinTokenSchema.Type; publicKey: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const issuer = issuerContext()
      if (!issuer.ok) {
        return { kind: "REJECTED" as const, detail: issuer.reason }
      }
      const publicKey = decodeCanonicalBase64url(ctx.payload.publicKey)
      if (!publicKey || publicKey.length !== 32) {
        return { kind: "REJECTED" as const, detail: "publicKey must be a base64url 32-byte Ed25519 key" }
      }
      if (ctx.payload.joinToken.trustDomain !== trustDomainFromEnv()) {
        return {
          kind: "REJECTED" as const,
          detail: `trustDomain ${ctx.payload.joinToken.trustDomain} != ${trustDomainFromEnv()}`,
        }
      }
      if (ctx.payload.joinToken.organizationId !== organizationIdFromEnv()) {
        return {
          kind: "REJECTED" as const,
          detail: `organizationId ${ctx.payload.joinToken.organizationId} != ${organizationIdFromEnv()}`,
        }
      }
      const result = enrollNode(
        ctx.payload.joinToken as unknown as JoinToken,
        publicKey,
        controlStateFor(directory).registry,
        issuer.context,
      )
      if (result.kind === "ENROLLED") {
        return { kind: "ENROLLED" as const, record: result.record }
      }
      return {
        kind: result.kind,
        detail: result.kind === "DUPLICATE_ENROLLMENT" ? result.detail : result.reason,
      }
    })

    const rotate = Effect.fn("EnrollmentHttpApi.rotate")(function* (ctx: {
      params: { nodeId: string }
      payload: { publicKey: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const issuer = issuerContext()
      if (!issuer.ok) {
        return { kind: "REJECTED" as const, detail: issuer.reason }
      }
      const publicKey = decodeCanonicalBase64url(ctx.payload.publicKey)
      if (!publicKey || publicKey.length !== 32) {
        return { kind: "REJECTED" as const, detail: "publicKey must be a base64url 32-byte Ed25519 key" }
      }
      const result = rotateNodeKey(
        ctx.params.nodeId,
        publicKey,
        controlStateFor(directory).registry,
        issuer.context,
      )
      if (result.kind === "ROTATED") {
        return { kind: "ROTATED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, detail: result.reason }
    })

    const status = Effect.fn("EnrollmentHttpApi.status")(function* (ctx: {
      params: { nodeId: string }
      payload: { status: "TRUSTED" | "SUSPENDED" | "REVOKED" }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const result = setNodeStatus(
        ctx.params.nodeId,
        ctx.payload.status,
        controlStateFor(directory).registry,
      )
      if (result.ok) {
        return { ok: true as const, record: result.record }
      }
      return { ok: false as const, reason: result.reason }
    })

    const get = Effect.fn("EnrollmentHttpApi.get")(function* (ctx: {
      params: { nodeId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const record = controlStateFor(directory).registry.get(ctx.params.nodeId)
      return record ?? `node ${ctx.params.nodeId} is not enrolled`
    })

    return handlers
      .handle("enroll", enroll)
      .handle("rotate", rotate)
      .handle("status", status)
      .handle("get", get)
  }),
)
