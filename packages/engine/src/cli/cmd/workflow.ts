import { cmd } from "./cmd"
import { saveWorkflow, loadWorkflow, listWorkflows, deleteWorkflow, workflowExists } from "../../workflow/store"
import type { CommandModule } from "yargs"

const saveCmd: CommandModule = {
  command: "save <name>",
  describe: "Save a workflow JSON from stdin with a name",
  handler: async (argv: any) => {
    const name = argv.name as string
    // Prevent hanging on TTY with no pipe
    if ((process.stdin as any).isTTY) {
      process.stderr.write(`No piped input. Usage:\n  echo '{"title":"...","description":"...","steps":[...]}' | arcana workflow save ${name}\n`)
      process.exit(1)
    }
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      if (chunk) chunks.push(Buffer.from(chunk))
    }
    const raw = Buffer.concat(chunks).toString("utf-8").trim()
    if (!raw) {
      process.stderr.write("No input received. Pipe a workflow JSON to stdin.\n")
      process.exit(1)
    }
    try {
      const plan = JSON.parse(raw)
      if (!plan.title || !plan.description) {
        process.stderr.write('Workflow JSON must have "title" and "description" fields\n')
        process.exit(1)
      }
      saveWorkflow(name, plan)
      process.stdout.write(`Workflow "${name}" saved — "${plan.title}" (${plan.steps?.length ?? 0} steps)\n`)
    } catch (e) {
      process.stderr.write(`Invalid input: ${e instanceof Error ? e.message : String(e)}\n`)
      process.exit(1)
    }
  },
}

const showCmd: CommandModule = {
  command: "show <name>",
  describe: "Display a saved workflow JSON (feed to agent's workflow() tool)",
  handler: (argv: any) => {
    const name = argv.name as string
    if (!workflowExists(name)) {
      process.stderr.write(`Workflow "${name}" not found. Use "arcana workflow list".\n`)
      process.exit(1)
    }
    try {
      const plan = loadWorkflow(name)
      process.stdout.write(JSON.stringify(plan, null, 2) + "\n")
    } catch (e) {
      process.stderr.write(`Failed to load "${name}": ${e instanceof Error ? e.message : String(e)}\n`)
      process.exit(1)
    }
  },
}

const listCmd: CommandModule = {
  command: "list",
  describe: "List all saved workflows",
  handler: () => {
    const names = listWorkflows()
    if (names.length === 0) {
      process.stdout.write("No saved workflows. Pipe one in:\n  echo '{\"title\":\"...\",\"description\":\"...\",\"steps\":[...]}' | arcana workflow save <name>\n")
      return
    }
    process.stdout.write("Saved workflows:\n")
    for (const name of names) {
      try {
        const plan = loadWorkflow(name)
        process.stdout.write(`  ${name}  →  "${plan.title}"  (${plan.steps?.length ?? 0} steps)\n`)
      } catch {
        process.stdout.write(`  ${name}  →  (corrupted — delete and re-save)\n`)
      }
    }
  },
}

const deleteCmd: CommandModule = {
  command: "delete <name>",
  describe: "Delete a saved workflow",
  handler: (argv: any) => {
    const name = argv.name as string
    if (!workflowExists(name)) {
      process.stderr.write(`Workflow "${name}" not found.\n`)
      process.exit(1)
    }
    deleteWorkflow(name)
    process.stdout.write(`Workflow "${name}" deleted.\n`)
  },
}

export const WorkflowCommand = cmd({
  command: "workflow",
  describe: "Manage saved workflows",
  builder: (yargs) =>
    yargs
      .command(saveCmd)
      .command(showCmd)
      .command(listCmd)
      .command(deleteCmd)
      .demandCommand(1, "Usage: arcana workflow <save|show|list|delete>"),
  handler: () => {},
})
