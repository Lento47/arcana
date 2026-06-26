type CommandLike = {
  name?: unknown
  title?: unknown
  desc?: unknown
  slashName?: unknown
  category?: unknown
}

export const ARCANA_COMMAND_COPY = {
  contract: {
    title: "Inspect active execution contract",
    description: "Inspect active execution contract",
    category: "Arcana",
  },
  mission: {
    title: "Show mission state",
    description: "Show Arcana mission and active run state",
    category: "Arcana",
  },
  actions: {
    title: "Show action timeline",
    description: "Show execution action timeline",
    category: "Arcana",
  },
  risk: {
    title: "Show risk state",
    description: "Show risk evaluation and approval state",
    category: "Arcana",
  },
  diffgate: {
    title: "Show diff gate state",
    description: "Show verification gate state",
    category: "Arcana",
  },
  verify: {
    title: "Show verifier board",
    description: "Show verifier board and completion gates",
    category: "Arcana",
  },
  proof: {
    title: "Show RunProof evidence",
    description: "Show RunProof evidence and audit trail",
    category: "Arcana",
  },
  tokens: {
    title: "Show token usage",
    description: "Show token usage and context budget",
    category: "Arcana",
  },
  rollback: {
    title: "Show rollback checkpoints",
    description: "Show rollback checkpoints",
    category: "Arcana",
  },
  sovereignty: {
    title: "Show AI sovereignty state",
    description: "Show provider route and AI sovereignty state",
    category: "Arcana",
  },
  compat: {
    title: "Show compatibility health",
    description: "Show compatibility shim health",
    category: "Arcana",
  },
} as const

export type ArcanaCommandName = keyof typeof ARCANA_COMMAND_COPY

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function registryName(command: CommandLike): string | undefined {
  const slash = stringValue(command.slashName)
  if (slash) return slash

  const name = stringValue(command.name)
  const dot = name?.lastIndexOf(".") ?? -1
  return dot === -1 ? name : name?.slice(dot + 1)
}

export function arcanaCommandName(command: CommandLike): ArcanaCommandName | undefined {
  const name = registryName(command)
  if (name && name in ARCANA_COMMAND_COPY) return name as ArcanaCommandName
  return undefined
}

export function normalizeCommandTitle(command: CommandLike) {
  const name = arcanaCommandName(command)
  if (name) return ARCANA_COMMAND_COPY[name].title

  return stringValue(command.title) ?? stringValue(command.name) ?? ""
}

export function normalizeCommandDescription(command: CommandLike) {
  const name = arcanaCommandName(command)
  if (name) return ARCANA_COMMAND_COPY[name].description

  return stringValue(command.desc) ?? stringValue(command.title)
}

export function normalizeCommandCategory(command: CommandLike) {
  const name = arcanaCommandName(command)
  if (name) return ARCANA_COMMAND_COPY[name].category

  return stringValue(command.category)
}
