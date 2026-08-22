/**
 * /goal and /loop slash-command handlers, extracted from component/prompt.
 *
 * Return contract mirrors the original if/else-if branches: `true` stops the
 * submit chain; falling off the end (implicit undefined) lets the caller
 * continue exactly as before — e.g. /goal's success path intentionally does
 * NOT stop the chain.
 *
 * `loadGoalModule` is injectable so tests can stub @arcana/core/session/goal
 * without touching real state; production uses the dynamic import.
 */
import { errorMessage } from "../../util/error"
import { Locale } from "../../util/locale"

type ToastLike = {
  show: (t: any) => any
}

type GoalModule = typeof import("@arcana/core/session/goal")

export type SlashGoalDeps = {
  inputText: string
  targetSessionID: string
  agentName: string
  toast: ToastLike
  loadGoalModule?: () => Promise<GoalModule>
}

const rejectMultiSlash = (inputText: string, toast: ToastLike): boolean => {
  const firstNewline = inputText.indexOf("\n")
  const trailingText = firstNewline === -1 ? "" : inputText.slice(firstNewline + 1).trim()
  const otherSlashLines = trailingText.split("\n").filter(l => l.trimStart().startsWith("/"))
  if (otherSlashLines.length > 0) {
    toast.show({
      title: "Multiple commands",
      message: "Submit each /command separately, not in one message.",
      variant: "warning",
    })
    return true
  }
  return false
}

/** "/goal <description>" — standalone goal setter (does NOT require /loop). */
export function runGoalCommand(deps: SlashGoalDeps): true | undefined {
  const { inputText, toast } = deps
  const loadGoal = deps.loadGoalModule ?? (() => import("@arcana/core/session/goal"))
  if (rejectMultiSlash(inputText, toast)) return true
  const firstNewline = inputText.indexOf("\n")
  const slashLine = firstNewline === -1 ? inputText : inputText.slice(0, firstNewline)
  const args = slashLine.slice(6).trim()

  if (!args) {
    toast.show({
      title: "Goal",
      message: "Usage: /goal <description of what you want done>",
      variant: "info",
    })
    return true
  }
  void loadGoal()
    .then(({ setSessionGoal }) => {
      setSessionGoal(deps.targetSessionID, { goal: args, status: "in_progress" })
      toast.show({
        title: "Goal set",
        // T9: helper appends "…" only when it truncated.
        message: Locale.truncate(args, 120),
        variant: "success",
      })
    })
    .catch((error: unknown) => {
      toast.show({ title: "Goal command failed", message: errorMessage(error), variant: "error" })
    })
  return undefined
}

/** "/loop [set|status|done|blocked|stale|<text>]" — autonomous loop hub. */
export function runLoopCommand(deps: SlashGoalDeps): true | undefined {
  const { inputText, toast } = deps
  const loadGoal = deps.loadGoalModule ?? (() => import("@arcana/core/session/goal"))
  if (rejectMultiSlash(inputText, toast)) return true
  const firstNewline = inputText.indexOf("\n")
  const slashLine = firstNewline === -1 ? inputText : inputText.slice(0, firstNewline)
  const rest = slashLine.slice(5).trim()

  const firstSpace = rest.indexOf(" ")
  const subcommand = firstSpace === -1 ? rest : rest.slice(0, firstSpace)

  if (rest === "" || subcommand === "status") {
    // /loop — show goal + kanban status
    void loadGoal()
      .then(({ getSessionGoal, formatActiveGoalBlock }) => {
        const snap = getSessionGoal(deps.targetSessionID)
        if (snap.status === "unset") {
          toast.show({
            title: "No active goal",
            message: "Start one with /loop set <description> or just /loop <what to do>",
            variant: "warning",
          })
          return
        }
        toast.show({
          title: "Goal status",
          message: formatActiveGoalBlock({
            sessionID: deps.targetSessionID,
            sessionAgent: deps.agentName,
            actorAgent: deps.agentName,
          }).replace(/<\/?active-goal>/g, "").trim(),
          variant: "info",
          duration: 8000,
        })
      })
      .catch((error: unknown) => {
        toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
      })
  } else if (subcommand === "set") {
    // /loop set <description> — set goal + start loop
    const description = rest.slice(4).trim()
    if (!description) {
      toast.show({ title: "Loop", message: "Usage: /loop set <description>", variant: "warning" })
      return true
    }
    void loadGoal()
      .then(({ setSessionGoal }) => {
        setSessionGoal(deps.targetSessionID, { goal: description, status: "in_progress" })
        toast.show({ title: "Goal set", message: description, variant: "success" })
      })
      .catch((error: unknown) => {
        toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
      })
  } else if (subcommand === "done" || subcommand === "blocked" || subcommand === "stale") {
    // /loop done|blocked|stale — mark goal status
    void loadGoal()
      .then(({ getSessionGoal, setSessionGoal }) => {
        const snap = getSessionGoal(deps.targetSessionID)
        if (snap.status === "unset") {
          toast.show({
            title: "No active goal",
            message: `No goal to mark ${subcommand}. Set one with /loop set <description>.`,
            variant: "warning",
          })
          return
        }
        const mapped: "complete_unverified" | "blocked" | "stale" =
          subcommand === "done" ? "complete_unverified"
          : subcommand === "blocked" ? "blocked"
          : "stale"
        setSessionGoal(deps.targetSessionID, { goal: snap.goal, status: mapped })
        toast.show({ title: "Goal marked", message: mapped, variant: "success" })
      })
      .catch((error: unknown) => {
        toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
      })
  } else {
    // /loop <text> — auto-set goal from text, start loop
    if (!rest) {
      toast.show({ title: "Loop", message: "Usage: /loop <what to do>", variant: "warning" })
      return true
    }
    void loadGoal()
      .then(({ getSessionGoal, setSessionGoal }) => {
        const snap = getSessionGoal(deps.targetSessionID)
        if (snap.status === "unset") {
          const goal = rest.split(/[.,;]/)[0]?.trim() || rest.slice(0, 80)
          setSessionGoal(deps.targetSessionID, { goal, status: "in_progress" })
          toast.show({ title: "Goal auto-set", message: goal, variant: "success" })
        }
      })
      .catch((error: unknown) => {
        toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
      })
  }
}
