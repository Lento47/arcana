import { Schema } from "effect"
import { HttpApi } from "effect/unstable/httpapi"
import { EventV2 } from "@arcana/core/event"
import { InstanceDisposed } from "@/server/event"
import { Question } from "@/question"
import { ApprovalApi } from "./groups/approval"
import { ConfigApi } from "./groups/config"
import { ControlApi } from "./groups/control"
import { ControlPlaneApi } from "./groups/control-plane"
import { EnrollmentApi } from "./groups/enrollment"
import { EnterpriseApi } from "./groups/enterprise"
import { EventApi } from "./groups/event"
import { ExecutionApi } from "./groups/executions"
import { ExperimentalApi } from "./groups/experimental"
import { FileApi } from "./groups/file"
import { InstanceApi } from "./groups/instance"
import { ManagerApi } from "./groups/manager"
import { McpApi } from "./groups/mcp"
import { PermissionApi } from "./groups/permission"
import { PolicyApi } from "./groups/policy"
import { ProofApi } from "./groups/proof"
import { ProjectApi } from "./groups/project"
import { ProjectCopyApi } from "./groups/project-copy"
import { ProviderApi } from "./groups/provider"
import { PtyApi, PtyConnectApi } from "./groups/pty"
import { QuestionApi } from "./groups/question"
import { RevocationApi } from "./groups/revocations"
import { RuntimeApi } from "./groups/runtime"
import { SessionApi } from "./groups/session"
import { SyncApi } from "./groups/sync"
import { SyncNodeApi } from "./groups/sync-node"
import { TuiApi } from "./groups/tui"
import { WorkspaceApi } from "./groups/workspace"
import { Api } from "@arcana/server/api"
// GlobalEventSchema snapshots the registry after event-producing groups register their variants.
import { GlobalApi } from "./groups/global"
import { Authorization } from "./middleware/authorization"
import { SchemaErrorMiddleware } from "./middleware/schema-error"
import "@/session/epistemic/governance-event"

const EventSchema = Schema.Union([
  ...EventV2.registry
    .values()
    .map((definition) =>
      Schema.Struct({
        id: EventV2.ID,
        type: Schema.Literal(definition.type),
        properties: definition.data,
      }).annotate({ identifier: `Event.${definition.type}` }),
    )
    .toArray(),
  InstanceDisposed,
]).annotate({ identifier: "Event" })

export const RootHttpApi = HttpApi.make("arcana-root")
  .addHttpApi(ControlApi)
  .addHttpApi(ControlPlaneApi)
  .addHttpApi(GlobalApi)
  .middleware(SchemaErrorMiddleware)
  .middleware(Authorization)

export const InstanceHttpApi = HttpApi.make("arcana-instance")
  .addHttpApi(ApprovalApi)
  .addHttpApi(ConfigApi)
  .addHttpApi(EnrollmentApi)
  .addHttpApi(EnterpriseApi)
  .addHttpApi(ExecutionApi)
  .addHttpApi(ExperimentalApi)
  .addHttpApi(FileApi)
  .addHttpApi(InstanceApi)
  .addHttpApi(ManagerApi)
  .addHttpApi(McpApi)
  .addHttpApi(ProjectApi)
  .addHttpApi(ProofApi)
  .addHttpApi(PolicyApi)
  .addHttpApi(SyncNodeApi)
  .addHttpApi(ProjectCopyApi)
  .addHttpApi(PtyApi)
  .addHttpApi(QuestionApi)
  .addHttpApi(RevocationApi)
  .addHttpApi(RuntimeApi)
  .addHttpApi(PermissionApi)
  .addHttpApi(ProviderApi)
  .addHttpApi(SessionApi)
  .addHttpApi(SyncApi)
  .addHttpApi(TuiApi)
  .addHttpApi(WorkspaceApi)
  .middleware(SchemaErrorMiddleware)

export const ArcanaHttpApi = HttpApi.make("arcana")
  .addHttpApi(RootHttpApi)
  .addHttpApi(EventApi)
  .addHttpApi(InstanceHttpApi)
  .addHttpApi(Api)
  .addHttpApi(PtyConnectApi)
  .annotate(HttpApi.AdditionalSchemas, [EventSchema, Question.Replied, Question.Rejected])

export type RootHttpApiType = typeof RootHttpApi
export type InstanceHttpApiType = typeof InstanceHttpApi
