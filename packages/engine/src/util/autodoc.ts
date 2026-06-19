import { Effect } from "effect"
import { Todo } from "../session/todo"

function allDone(todos: Todo.Info[]): boolean {
  return todos.length > 0 && todos.every((t) => t.status === "completed")
}

function makeSlug(todos: Todo.Info[]): string {
  const first = todos[0]?.content ?? "auto"
  return "auto-" + first
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

function buildTags(todos: Todo.Info[]): string[] {
  const tags = new Set<string>(["auto-generated"])
  for (const t of todos) {
    if (t.priority) tags.add(t.priority)
  }
  return [...tags]
}

function generateDoc(todos: Todo.Info[], slug: string): string {
  const date = new Date().toISOString().split("T")[0]
  const title = todos[0]?.content ?? "Auto-generated"
  const tags = buildTags(todos)
  const details = todos.map((t) => `- ${t.content} — ${t.status}`).join("\n")

  return [
    "---",
    `aliases: [${slug}]`,
    `tags: [${tags.join(", ")}]`,
    `date: ${date}`,
    "---",
    "",
    `# ${title}`,
    "",
    `> Auto-generated wiki from completed tasks.`,
    "",
    "## Done",
    "",
    details,
    "",
    "## Related",
    "",
    "[[README]]",
    "",
  ].join("\n")
}

export function tryGenerateAfterUpdate(todos: Todo.Info[], projectRoot: string): Effect.Effect<void> {
  return Effect.gen(function* () {
    if (!allDone(todos)) return

    const vaultDir = `${projectRoot}/.vault`
    const vaultExists = yield* Effect.sync(() => {
      try { return require("node:fs").existsSync(vaultDir) } catch { return false }
    })
    if (!vaultExists) return

    const slug = makeSlug(todos)
    const content = generateDoc(todos, slug)
    const filepath = `${vaultDir}/${slug}.md`

    yield* Effect.sync(() => {
      require("node:fs").writeFileSync(filepath, content, "utf8")
    })

    const readmePath = `${vaultDir}/README.md`
    const readmeExists = yield* Effect.sync(() => {
      try { return require("node:fs").existsSync(readmePath) } catch { return false }
    })
    if (!readmeExists) return

    yield* Effect.sync(() => {
      const fs = require("node:fs")
      let readme = fs.readFileSync(readmePath, "utf8")
      const entry = `- [[${slug}]] — ${todos[0]?.content ?? "auto-generated wiki"}. ✅ ${new Date().toISOString().split("T")[0]}`
      const lines = readme.split("\n")
      const phaseIdx = lines.findLastIndex((l: string) => l.startsWith("### Phases"))
      if (phaseIdx >= 0) {
        let endIdx = lines.length
        for (let i = phaseIdx + 1; i < lines.length; i++) {
          if (lines[i]!.startsWith("### ")) { endIdx = i; break }
        }
        lines.splice(endIdx, 0, entry)
        readme = lines.join("\n")
        fs.writeFileSync(readmePath, readme, "utf8")
      }
    })
  })
}
