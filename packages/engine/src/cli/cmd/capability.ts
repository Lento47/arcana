import type { Argv } from "yargs"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { Session } from "@/session/session"
import { SessionID } from "../../session/schema"
import { UI } from "../ui"
import { Database } from "@arcana/core/database/database"
import { EventStore } from "@/session/epistemic/event-store"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { revokeWithCascade, type RuntimeGrantStore } from "@arcana/core/capability/runtime-delegation"
import { CapabilityRevocation } from "@/session/capability-revocation"
import { NotFoundError } from "@/storage/storage"
import { outputJson, isJsonMode, jsonOption } from "../json-output"

export const CapabilityCommand = cmd({
  command: "capability",
  describe: "manage session capabilities",
  builder: (yargs: Argv) => yargs.command(CapabilityRevokeCommand).demandCommand(),
  async handler() {},
})

export const CapabilityRevokeCommand = effectCmd({
  command: "revoke <sessionID> <capabilityID>",
  describe: "revoke an active capability grant and all descendant grants",
  builder: (yargs) =>
    yargs
      .positional("sessionID", {
        describe: "session ID that owns the grant",
        type: "string",
        demandOption: true,
      })
      .positional("capabilityID", {
        describe: "capability grant ID to revoke",
        type: "string",
        demandOption: true,
      })
      .option("reason", {
        describe: "revocation reason recorded in governance evidence",
        type: "string",
      })
      .option("json", {
        describe: "output machine-readable JSON to stdout",
        type: "boolean",
        default: false,
      }),
  handler: Effect.fn("Cli.capability.revoke")(function* (args) {
    const sessions = yield* Session.Service
    const database = yield* Database.Service
    const eventStore = yield* EventStore.Service
    const sessionID = SessionID.make(args.sessionID)
    yield* sessions
      .get(sessionID)
      .pipe(Effect.catchIf(NotFoundError.isInstance, () => fail(`Session not found: ${args.sessionID}`)))

    const grantStore = new SqliteGrantStore(database)
    const reason = args.reason ?? "OPERATOR_REVOKE"
    const result = yield* CapabilityRevocation.revokeCapabilityWithCascade(
      {
        loadGrant: (capabilityId) =>
          grantStore
            .getGrantById(capabilityId)
            .pipe(Effect.catch(() => Effect.succeed(null))),
        revokeCascade: (grantId, revokedEventId) =>
          revokeWithCascade(grantId, grantStore as unknown as RuntimeGrantStore, revokedEventId).pipe(
            Effect.catch(() => Effect.succeed({ revokedIds: [] as string[] })),
          ),
        emitRevoked: ({ capabilityId, reason: revokedReason }) =>
          eventStore
            .append({
              sessionId: args.sessionID,
              actor: { kind: "policy", id: "capability-revocation" },
              type: "capability.revoked",
              payload: {
                capabilityId,
                reason: revokedReason,
                sessionId: args.sessionID,
              },
            })
            .pipe(Effect.asVoid, Effect.catch(() => Effect.void)),
      },
      { sessionId: args.sessionID, capabilityId: args.capabilityID },
    )

    if (result.revokedIds.length === 0) {
      return yield* fail(
        `Capability ${args.capabilityID} is not an active grant of session ${args.sessionID}`,
      )
    }

    if (isJsonMode(args)) {
      outputJson({
        revoked: result.revokedIds.length,
        sessionID: args.sessionID,
        capabilityID: args.capabilityID,
        reason,
        revokedIds: result.revokedIds,
      })
      return
    }

    UI.println(
      UI.Style.TEXT_SUCCESS_BOLD +
        `Revoked ${result.revokedIds.length} grant(s) for session ${args.sessionID}` +
        UI.Style.TEXT_NORMAL,
    )
    for (const revokedId of result.revokedIds) {
      UI.println(`  - ${revokedId}`)
    }
  }),
})

export * as Capability from "./capability"
