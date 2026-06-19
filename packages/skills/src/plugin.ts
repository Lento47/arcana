import type { SkillRegistry } from "./registry.js"
import type { Skill } from "./types.js"

type SkillPluginState = {
  activeSkill: Skill | null
  activatedAt: number | null
}

/**
 * Creates an opencode-compatible plugin that bridges arcana skills.
 *
 * When a skill is activated (via /skillname), its SKILL.md body is injected
 * into the system prompt for that session via experimental.chat.system.transform.
 *
 * Skills can be activated/deactivated per-session via the `skill` tool.
 */
export function createSkillPlugin(registry: SkillRegistry) {
  const state: SkillPluginState = { activeSkill: null, activatedAt: null }

  return {
    state,
    registry,

    activate(skillId: string): boolean {
      const skill = registry.get(skillId)
      if (!skill) return false
      state.activeSkill = skill
      state.activatedAt = Date.now()
      return true
    },

    deactivate(): void {
      state.activeSkill = null
      state.activatedAt = null
    },

    getSystemInjection(): string | null {
      if (!state.activeSkill) return null
      return [
        `<arcana-skill name="${state.activeSkill.meta.name}">`,
        state.activeSkill.body,
        `</arcana-skill>`,
      ].join("\n")
    },

    formatForOpencode() {
      const plugin = this
      return async function arcanaSkillsPlugin(_input: unknown, _opts?: unknown) {
        return {
          async "experimental.chat.system.transform"(
            _input: unknown,
            output: { system: string[] },
          ): Promise<void> {
            const injection = plugin.getSystemInjection()
            if (injection) output.system.push(injection)
          },

          tool: {
            skill: {
              description: "Activate or deactivate an arcana skill for this session",
              parameters: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["activate", "deactivate", "list", "info"],
                    description: "Action to perform",
                  },
                  skill_id: {
                    type: "string",
                    description: "Skill ID to activate/deactivate/get info about",
                  },
                  query: {
                    type: "string",
                    description: "Search query for listing skills",
                  },
                },
                required: ["action"],
              },
              async execute(args: {
                action: "activate" | "deactivate" | "list" | "info"
                skill_id?: string
                query?: string
              }) {
                await registry.load()

                if (args.action === "list") {
                  const skills = registry.search(args.query ?? "")
                  const grouped = registry.byCategory()
                  const lines: string[] = []
                  for (const [cat, catSkills] of grouped) {
                    const matches = catSkills.filter((s) => skills.includes(s))
                    if (!matches.length) continue
                    lines.push(`## ${cat}`)
                    for (const s of matches) {
                      const active = s.id === plugin.state.activeSkill?.id ? " [active]" : ""
                      lines.push(`- **${s.id}**${active}: ${s.meta.description}`)
                    }
                  }
                  return { output: lines.join("\n") || "No skills found." }
                }

                if (args.action === "deactivate") {
                  const was = plugin.state.activeSkill?.meta.name
                  plugin.deactivate()
                  return { output: was ? `Deactivated skill: ${was}` : "No active skill." }
                }

                if (!args.skill_id) return { output: "skill_id required for activate/info" }

                if (args.action === "info") {
                  const skill = registry.get(args.skill_id)
                  if (!skill) return { output: `Skill not found: ${args.skill_id}` }
                  return {
                    output: [
                      `**${skill.meta.name}** v${skill.meta.version}`,
                      skill.meta.description,
                      skill.meta.author ? `Author: ${skill.meta.author}` : "",
                      `Category: ${skill.category}`,
                      `Tags: ${[...(skill.meta.metadata?.arcana?.tags ?? []), ...(skill.meta.metadata?.hermes?.tags ?? [])].join(", ") || "none"}`,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  }
                }

                if (args.action === "activate") {
                  const ok = plugin.activate(args.skill_id)
                  if (!ok) return { output: `Skill not found: ${args.skill_id}` }
                  return {
                    output: `Activated skill: ${plugin.state.activeSkill!.meta.name}\n${plugin.state.activeSkill!.meta.description}`,
                  }
                }

                return { output: "Unknown action" }
              },
            },
          },
        }
      }
    },
  }
}
