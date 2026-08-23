/**
 * Application-level command palette definitions.
 *
 * Extracted from app.tsx to separate command registration from the
 * App component's rendering and lifecycle concerns. Each command is
 * a declarative object with a name, title, category, and run handler.
 */
import { Show } from "solid-js"
import { Flag } from "@arcana/core/flag/flag"
import { APP_NAME, APP_ABBR, DOCS_URL, COPY } from "./branding"
import { CommandPaletteDialog } from "./component/command-palette"
import { COMMAND_PALETTE_COMMAND } from "./keymap"
import { DialogAgent } from "./component/dialog-agent"
import { DialogAgentPrompt } from "./component/dialog-agent-prompt"
import { DialogMcp } from "./component/dialog-mcp"
import { DialogModel } from "./component/dialog-model"
import { DialogPermissions } from "./component/dialog-permissions"
import { DialogProvider as DialogProviderList } from "./component/dialog-provider"
import { DialogSessionList } from "./component/dialog-session-list"
import { DialogStatus } from "./component/dialog-status"
import { DialogSoul } from "./component/dialog-soul"
import { DialogTools } from "./component/dialog-tools"
import { DialogVariant } from "./component/dialog-variant"
import { DialogWorkspaceList } from "./component/dialog-workspace-list"
import { DialogConsoleOrg } from "./component/dialog-console-org"
import { DialogThemeList } from "./component/dialog-theme-list"
import { DialogHelp } from "./ui/dialog-help"
import { DialogRunProofContract, DialogRunProofActions, DialogRunProofDiffGate, DialogRunProofVerify, DialogRunProofSovereignty, DialogRunProofMissing } from "./proof-view/run-proof-dialogs"
import { loadActiveRunProof, stageActiveRunProofRollbackRestore, approveActiveRunProofRollbackRestore } from "./proof-io"
import { displaySessionTitle } from "./util/session"
import { isSpinnerStyle, nextSpinnerStyle, spinnerStyleName } from "./util/spinner-style"
import { densityName, isDensity, nextDensity } from "./shell/command-spine/spine-types"
import type { TuiPluginHost } from "./plugin/runtime"
import type { CliRenderer } from "@opentui/core"

// ─── RunProof surface helper ────────────────────────────────────────

async function showRunProofSurface(
  kind: "contract" | "actions" | "diffgate" | "verify" | "sovereignty",
  deps: { dialog: any; toast: any; clipboard: any },
) {
  const result = await loadActiveRunProof()
  if (result.status !== "ready") {
    deps.dialog.replace(() => <DialogRunProofMissing result={result} />)
    return
  }
  const copyRollbackRestore = async (command: string) => {
    if (!command) return
    await deps.clipboard
      .write?.(command)
      .then(() => deps.toast.show({ message: "Copied rollback restore command", variant: "info" }))
      .catch(deps.toast.error)
  }
  const stageRollbackRestore = async () => {
    const staged = await stageActiveRunProofRollbackRestore()
    if (staged.status !== "ready") {
      deps.dialog.replace(() => <DialogRunProofMissing result={staged} />)
      return
    }
    deps.toast.show({ message: "Rollback restore staged for approval", variant: "warning" })
    await showRunProofSurface(kind, deps)
  }
  const approveRollbackRestore = async () => {
    const approved = await approveActiveRunProofRollbackRestore()
    if (approved.status !== "ready") {
      deps.dialog.replace(() => <DialogRunProofMissing result={approved} />)
      return
    }
    deps.toast.show({ message: "Rollback restore approved; not executed", variant: "warning" })
    await showRunProofSurface(kind, deps)
  }
  deps.dialog.replace(() => {
    if (kind === "contract") {
      return (
        <DialogRunProofContract
          proof={result.proof}
          path={result.path}
          onCopyRollbackRestore={copyRollbackRestore}
          onStageRollbackRestore={() => void stageRollbackRestore().catch(deps.toast.error)}
          onApproveRollbackRestore={() => void approveRollbackRestore().catch(deps.toast.error)}
        />
      )
    }
    if (kind === "diffgate") {
      return (
        <DialogRunProofDiffGate
          proof={result.proof}
          path={result.path}
          onCopyRollbackRestore={copyRollbackRestore}
          onStageRollbackRestore={() => void stageRollbackRestore().catch(deps.toast.error)}
          onApproveRollbackRestore={() => void approveRollbackRestore().catch(deps.toast.error)}
        />
      )
    }
    if (kind === "verify") return <DialogRunProofVerify proof={result.proof} path={result.path} />
    if (kind === "sovereignty") return <DialogRunProofSovereignty proof={result.proof} path={result.path} />
    return (
      <DialogRunProofActions
        proof={result.proof}
        path={result.path}
        onCopyRollbackRestore={copyRollbackRestore}
        onStageRollbackRestore={() => void stageRollbackRestore().catch(deps.toast.error)}
        onApproveRollbackRestore={() => void approveRollbackRestore().catch(deps.toast.error)}
      />
    )
  })
  deps.dialog.setSize("xlarge")
}

// ─── Command definitions ────────────────────────────────────────────

/**
 * Build the application command palette.
 *
 * @param deps - Context dependencies injected from the App component.
 *               Uses `any` types to avoid circular imports; the actual
 *               context types are enforced at the call site.
 */
export function buildAppCommands(deps: {
  dialog: any
  sync: any
  local: any
  kv: any
  route: any
  sdk: any
  toast: any
  renderer: CliRenderer
  exit: () => void
  clipboard: any
  pluginHost: TuiPluginHost
  currentWorktreeWorkspace: () => any
  connected: () => boolean
  mlRuntimeEnabled: () => boolean
  setMlRuntimeEnabled: (fn: (prev: boolean) => boolean) => void
  terminalTitleEnabled: () => boolean
  setTerminalTitleEnabled: (fn: (prev: boolean) => boolean) => void
  pasteSummaryEnabled: () => boolean
  setPasteSummaryEnabled: (fn: (prev: boolean) => boolean) => void
  mode: () => string
  setMode: (mode: "dark" | "light") => void
  locked: () => boolean
  lock: () => void
  unlock: () => void
  onSnapshot?: () => Promise<string[]>
}) {
  return [
    {
      name: COMMAND_PALETTE_COMMAND,
      title: "Show command palette",
      category: "System",
      hidden: true,
      run: () => {
        deps.dialog.replace(() => <CommandPaletteDialog />)
      },
    },
    {
      name: "session.list",
      title: "Switch session",
      category: "Session",
      suggested: deps.sync.data.session.length > 0,
      slashName: "sessions",
      slashAliases: ["resume", "continue"],
      run: () => {
        deps.dialog.replace(() => <DialogSessionList />)
      },
    },
    {
      name: "session.queued_prompts",
      title: "Retry queued prompts",
      category: "Session",
      hidden: true,
      run: () => {
        deps.toast.show({ message: "No queued prompts", variant: "info" })
      },
    },
    {
      name: "session.new",
      title: "New session",
      suggested: deps.route.data.type === "session",
      category: "Session",
      slashName: "new",
      slashAliases: ["clear"],
      run: () => {
        const agent = deps.local.agent.current()
        const model = deps.local.model.current()
        if (!agent || !model || !model.providerID || !model.modelID) {
          deps.dialog.clear()
          queueMicrotask(() => deps.route.navigate({ type: "home" }))
          return
        }

        const currentSession = deps.route.data.type === "session" ? deps.sync.session.get(deps.route.data.sessionID) : undefined
        const directory = currentSession?.directory ?? ""
        const workspaceID = currentSession?.workspaceID
        const variant = deps.local.model.variant.current()

        deps.dialog.clear()

        void deps.sdk.client.session
          .create({
            directory,
            workspace: workspaceID,
            agent: agent.name,
            model: {
              providerID: model.providerID,
              id: model.modelID,
              variant,
            },
          })
          .then((res: any) => {
            if (res.error) {
              console.error("session.new create returned error:", res.error)
              deps.route.navigate({ type: "home" })
              return
            }
            deps.route.navigate({
              type: "session",
              sessionID: res.data.id,
            })
          })
          .catch((error: unknown) => {
            console.error("session.new create threw:", error)
            deps.route.navigate({ type: "home" })
          })
      },
    },
    {
      name: "ml.toggle",
      title: deps.mlRuntimeEnabled() ? "Disable ML runtime" : "Enable ML runtime",
      suggested: deps.mlRuntimeEnabled(),
      category: "ML",
      slashName: "ml",
      slashAliases: ["quality"],
      run: () => {
        deps.setMlRuntimeEnabled((prev) => {
          const next = !prev
          deps.kv.set("ml_runtime_enabled", next)
          deps.toast.show({
            message: next ? "ML runtime on (quality gate + silent revision)" : "ML runtime off",
            variant: "info",
          })
          return next
        })
        deps.dialog.clear()
      },
    },
    {
      name: "arcana.contract",
      slashName: "contract",
      title: "Inspect active execution contract",
      desc: "Show the active execution contract for this session",
      category: "Arcana",
      run: () => void showRunProofSurface("contract", deps).catch(deps.toast.error),
    },
    {
      name: "arcana.actions",
      slashName: "actions",
      title: "Show action timeline",
      desc: "Show the execution action timeline",
      category: "Arcana",
      run: () => void showRunProofSurface("actions", deps).catch(deps.toast.error),
    },
    {
      name: "arcana.diffgate",
      slashName: "diffgate",
      title: "Show diff gate state",
      desc: "Show verification gate state",
      category: "Arcana",
      run: () => void showRunProofSurface("diffgate", deps).catch(deps.toast.error),
    },
    {
      name: "arcana.verify",
      slashName: "verify",
      title: "Show verifier board",
      desc: "Show verifier board and completion gates",
      category: "Arcana",
      run: () => void showRunProofSurface("verify", deps).catch(deps.toast.error),
    },
    {
      name: "arcana.sovereignty",
      slashName: "sovereignty",
      title: "Show provider route evidence",
      desc: "Show provider/model route evidence",
      category: "Arcana",
      run: () => void showRunProofSurface("sovereignty", deps).catch(deps.toast.error),
    },
    {
      name: "arcana.consensus",
      slashName: "consensus",
      title: "Prepare consensus evidence task",
      desc: "Use /consensus <prompt> to request proposals, critiques, votes, and recorded consensus evidence",
      category: "Arcana",
      run: () => {
        deps.toast.show({
          message: "Use /consensus <prompt> to submit a consensus evidence task",
          variant: "info",
        })
        deps.dialog.clear()
      },
    },
    {
      name: "workspace.copy_path",
      title: "Copy worktree path",
      category: "Workspace",
      enabled: () => deps.currentWorktreeWorkspace() !== undefined,
      run: async () => {
        const workspace = deps.currentWorktreeWorkspace() as { directory?: string } | undefined
        if (!workspace?.directory) return
        await deps.clipboard
          .write?.(workspace.directory)
          .then(() => deps.toast.show({ message: "Copied worktree path", variant: "info" }))
          .catch(deps.toast.error)
        deps.dialog.clear()
      },
    },
    {
      name: "workspace.list",
      title: "Manage workspaces",
      category: "Workspace",
      hidden: !Flag.ARCANA_EXPERIMENTAL_WORKSPACES,
      slashName: "workspaces",
      run: () => {
        deps.dialog.replace(() => <DialogWorkspaceList />)
      },
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      name: `session.quick_switch.${i + 1}`,
      title: `Switch to session in quick slot ${i + 1}`,
      category: "Session",
      hidden: true,
      run: () => {
        deps.local.session.quickSwitch(i + 1)
      },
    })),
    {
      name: "model.list",
      title: "Switch model",
      suggested: true,
      category: "Agent",
      slashName: "models",
      slashAliases: ["mo"],
      run: () => {
        deps.dialog.replace(() => <DialogModel />)
      },
    },
    {
      name: "model.cycle_recent",
      title: "Model cycle",
      category: "Agent",
      hidden: true,
      run: () => {
        deps.local.model.cycle(1)
      },
    },
    {
      name: "model.cycle_recent_reverse",
      title: "Model cycle reverse",
      category: "Agent",
      hidden: true,
      run: () => {
        deps.local.model.cycle(-1)
      },
    },
    {
      name: "model.cycle_favorite",
      title: "Favorite cycle",
      category: "Agent",
      hidden: true,
      run: () => {
        deps.local.model.cycleFavorite(1)
      },
    },
    {
      name: "model.cycle_favorite_reverse",
      title: "Favorite cycle reverse",
      category: "Agent",
      hidden: true,
      run: () => {
        deps.local.model.cycleFavorite(-1)
      },
    },
    {
      name: "agent.list",
      title: "Switch agent",
      category: "Agent",
      slashName: "agents",
      run: () => {
        deps.dialog.replace(() => <DialogAgent />)
      },
    },
    {
      name: "agent.prompt",
      title: "Edit agent system prompt",
      category: "Agent",
      slashName: "prompt",
      run: () => {
        deps.dialog.replace(() => <DialogAgentPrompt />)
      },
    },
    {
      name: "tools.list",
      title: "Toggle session tools",
      category: "Agent",
      slashName: "tools",
      run: () => {
        const sessionID = deps.route.data.type === "session" ? deps.route.data.sessionID : undefined
        if (!sessionID) {
          deps.toast.show({ message: "Open a session first", variant: "warning" })
          return
        }
        deps.dialog.replace(() => <DialogTools sessionID={sessionID} />)
      },
    },
    {
      name: "instructions.edit",
      title: "Edit personal instructions",
      category: "Agent",
      slashName: "soul",
      run: () => {
        deps.dialog.replace(() => <DialogSoul />)
      },
    },
    {
      name: "goal.set",
      title: "Set session goal",
      category: "Session",
      slashName: "goal",
      run: () => {
        const sessionID = deps.route.data.type === "session" ? deps.route.data.sessionID : undefined
        if (!sessionID) {
          deps.toast.show({ message: "Open a session first", variant: "warning" })
          return
        }
        deps.toast.show({
          title: "Set goal",
          message: "Type /goal <description> in the prompt to bind the session goal",
          variant: "info",
        })
        deps.dialog.clear()
      },
    },
    {
      name: "goal.loop",
      title: "Check goal progress",
      category: "Session",
      slashName: "loop",
      run: () => {
        const sessionID = deps.route.data.type === "session" ? deps.route.data.sessionID : undefined
        if (!sessionID) {
          deps.toast.show({ message: "Open a session first", variant: "warning" })
          return
        }
        void import("@arcana/core/session/goal")
          .then(({ getSessionGoal, formatActiveGoalBlock }) => {
            const snap = getSessionGoal(sessionID)
            if (snap.status === "unset") {
              deps.toast.show({ message: "No active goal — use /goal <description>", variant: "warning" })
              return
            }
            deps.toast.show({
              title: "Goal",
              message: formatActiveGoalBlock({
                sessionID,
                sessionAgent: deps.local.agent.current()?.name,
              })
                .replace(/<\/*active-goal>/g, "")
                .trim(),
              variant: "info",
              duration: 8000,
            })
          })
          .catch((error: unknown) => deps.toast.error(error))
        deps.dialog.clear()
      },
    },
    {
      name: "mcp.list",
      title: "Toggle MCPs",
      category: "Agent",
      slashName: "mcps",
      run: () => {
        deps.dialog.replace(() => <DialogMcp />)
      },
    },
    {
      name: "agent.cycle",
      title: "Open agent picker",
      category: "Agent",
      hidden: true,
      run: () => {
        deps.dialog.replace(() => <DialogAgent />)
      },
    },
    {
      name: "variant.cycle",
      title: "Variant cycle",
      category: "Agent",
      run: () => {
        deps.local.model.variant.cycle()
      },
    },
    {
      name: "variant.list",
      title: "Switch model variant",
      category: "Agent",
      hidden: deps.local.model.variant.list().length === 0,
      slashName: "variants",
      run: () => {
        if (deps.local.model.variant.list().length === 0) {
          return deps.toast.show({
            title: "No variants available",
            message: "The current model does not support any variants.",
            variant: "info",
          })
        }
        deps.dialog.replace(() => <DialogVariant />)
      },
    },
    {
      name: "agent.cycle.reverse",
      title: "Cycle agent",
      category: "Agent",
      hidden: true,
      run: () => {
        deps.local.agent.move(1)
        const agent = deps.local.agent.current()
        deps.toast.show({
          title: "Agent",
          message: agent ? agent.name : "No primary agent available",
          variant: agent ? "info" : "warning",
          duration: 1800,
        })
      },
    },
    {
      name: "provider.connect",
      title: "Connect provider",
      suggested: !deps.connected(),
      slashName: "connect",
      run: () => {
        deps.dialog.replace(() => <DialogProviderList />)
      },
      category: "Provider",
    },
    ...(deps.sync.data.console_state.switchableOrgCount > 1
      ? [
          {
            name: "console.org.switch",
            title: "Switch org",
            suggested: Boolean(deps.sync.data.console_state.activeOrgName),
            slashName: "org",
            slashAliases: ["orgs", "switch-org"],
            run: () => {
              deps.dialog.replace(() => <DialogConsoleOrg />)
            },
            category: "Provider",
          },
        ]
      : []),
    {
      name: "arcana.status",
      title: "View status",
      slashName: "status",
      run: () => {
        deps.dialog.replace(() => <DialogStatus />)
      },
      category: "System",
    },
    {
      name: "arcana.permissions",
      title: "Permissions status",
      slashName: "permissions",
      slashAliases: ["perms", "pending"],
      run: () => {
        deps.dialog.replace(() => <DialogPermissions />)
      },
      category: "System",
    },
    {
      name: "theme.switch",
      title: "Switch theme",
      slashName: "themes",
      run: () => {
        deps.dialog.replace(() => <DialogThemeList />)
      },
      category: "System",
    },
    {
      name: "theme.switch_mode",
      title: deps.mode() === "dark" ? "Switch to light mode" : "Switch to dark mode",
      run: () => {
        deps.setMode(deps.mode() === "dark" ? "light" : "dark")
        deps.dialog.clear()
      },
      category: "System",
    },
    {
      name: "theme.mode.lock",
      title: deps.locked() ? "Unlock theme mode" : "Lock theme mode",
      run: () => {
        if (deps.locked()) deps.unlock()
        else deps.lock()
        deps.dialog.clear()
      },
      category: "System",
    },
    {
      name: "help.show",
      title: "Help",
      slashName: "help",
      run: () => {
        deps.dialog.replace(() => <DialogHelp />)
      },
      category: "System",
    },
    {
      name: "docs.open",
      title: "Open docs",
      run: () => {
        import("open").then((m) => m.default(DOCS_URL)).catch(() => {})
        deps.dialog.clear()
      },
      category: "System",
    },
    {
      name: "app.exit",
      title: "Exit the app",
      slashName: "exit",
      slashAliases: ["quit", "q"],
      run: () => deps.exit(),
      category: "System",
    },
    {
      name: "app.debug",
      title: "Toggle debug panel",
      category: "System",
      run: () => {
        deps.renderer.toggleDebugOverlay()
        deps.dialog.clear()
      },
    },
    {
      name: "app.console",
      title: "Toggle console",
      category: "System",
      run: () => {
        deps.renderer.console.toggle()
        deps.dialog.clear()
      },
    },
    {
      name: "app.heap_snapshot",
      title: "Write heap snapshot",
      category: "System",
      run: async () => {
        const files = await deps.onSnapshot?.()
        deps.toast.show({
          variant: "info",
          message: `Heap snapshot written to ${files?.join(", ")}`,
          duration: 5000,
        })
        deps.dialog.clear()
      },
    },
    {
      name: "terminal.suspend",
      title: "Suspend terminal",
      category: "System",
      hidden: true,
      enabled: process.platform !== "win32",
      run: () => {
        deps.renderer.suspend()
        process.once("SIGCONT", () => deps.renderer.resume())
        process.kill(0, "SIGTSTP")
      },
    },
    {
      name: "terminal.title.toggle",
      title: deps.terminalTitleEnabled() ? "Disable terminal title" : "Enable terminal title",
      category: "System",
      run: () => {
        deps.setTerminalTitleEnabled((prev) => {
          const next = !prev
          deps.kv.set("terminal_title_enabled", next)
          if (!next) deps.renderer.setTerminalTitle("")
          return next
        })
        deps.dialog.clear()
      },
    },
    {
      name: "app.toggle.animations",
      title: deps.kv.get("animations_enabled", true) ? "Disable animations" : "Enable animations",
      category: "System",
      slashName: "animations",
      slashAliases: ["toggle-animations"],
      run: () => {
        deps.kv.set("animations_enabled", !deps.kv.get("animations_enabled", true))
        deps.dialog.clear()
      },
    },
    {
      name: "app.cycle.spinner",
      title: `Spinner: ${spinnerStyleName(deps.kv.get("spinner_style"))}`,
      category: "System",
      run: () => {
        const current = isSpinnerStyle(deps.kv.get("spinner_style")) ? deps.kv.get("spinner_style") : undefined
        deps.kv.set("spinner_style", nextSpinnerStyle(current ?? "braille"))
        deps.dialog.clear()
      },
    },
    {
      name: "app.cycle.density",
      title: `Density: ${densityName(deps.kv.get("density"))}`,
      category: "System",
      run: () => {
        const current = isDensity(deps.kv.get("density")) ? deps.kv.get("density") : undefined
        deps.kv.set("density", nextDensity(current ?? "cozy"))
        deps.dialog.clear()
      },
    },
    {
      name: "app.toggle.file_context",
      title: deps.kv.get("file_context_enabled", true) ? "Disable file context" : "Enable file context",
      category: "System",
      run: () => {
        deps.kv.set("file_context_enabled", !deps.kv.get("file_context_enabled", true))
        deps.dialog.clear()
      },
    },
    {
      name: "app.toggle.diffwrap",
      title: deps.kv.get("diff_wrap_mode", "word") === "word" ? "Disable diff wrapping" : "Enable diff wrapping",
      category: "System",
      run: () => {
        const current = deps.kv.get("diff_wrap_mode", "word")
        deps.kv.set("diff_wrap_mode", current === "word" ? "none" : "word")
        deps.dialog.clear()
      },
    },
    {
      name: "app.toggle.paste_summary",
      title: deps.pasteSummaryEnabled() ? "Disable paste summary" : "Enable paste summary",
      category: "System",
      run: () => {
        deps.setPasteSummaryEnabled((prev) => {
          const next = !prev
          deps.kv.set("paste_summary_enabled", next)
          return next
        })
        deps.dialog.clear()
      },
    },
    {
      name: "app.toggle.session_directory_filter",
      title: deps.kv.get("session_directory_filter_enabled", true)
        ? "Disable session directory filtering"
        : "Enable session directory filtering",
      category: "System",
      run: async () => {
        deps.kv.set("session_directory_filter_enabled", !deps.kv.get("session_directory_filter_enabled", true))
        await deps.sync.session.refresh()
        deps.dialog.clear()
      },
    },
  ].map((command) => ({
    namespace: "palette",
    ...command,
  }))
}
