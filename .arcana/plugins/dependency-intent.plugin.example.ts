// Example Arcana plugin skeleton.
// Documentation only: runtime plugin loading is not implemented in this branch.

export default {
  name: "dependency-intent",
  version: "0.1.0",

  onDependencyChanged(change: DependencyChange, ctx: PluginContext): PluginDecision {
    const questions = [
      "Why this dependency?",
      "Why not existing code or an existing dependency?",
      "What license does it use?",
      "What maintenance or transitive risk does it add?",
      "What runtime or bundle impact does it create?",
    ]

    return {
      kind: "risk",
      risk: "medium",
      message: "Dependency change detected. Intent should be recorded before this is considered proven work.",
      evidence: {
        files: change.files,
        packages: change.packages,
      },
      questions,
      modeBehavior: {
        observe: "record",
        advise: "warn",
        ask: "confirm",
        enforce: "block_unless_contract_allows",
        locked: "block_unless_allowlisted",
      },
    }
  },
}

type DependencyChange = {
  files: string[]
  packages: string[]
}

type PluginContext = {
  mode: "observe" | "advise" | "ask" | "enforce" | "locked"
  contract?: unknown
  runId?: string
}

type PluginDecision = {
  kind: "risk" | "recommendation" | "verification" | "annotation"
  risk?: "low" | "medium" | "high"
  message: string
  evidence?: Record<string, unknown>
  questions?: string[]
  modeBehavior: Record<string, string>
}
