import { Effect, Schema } from "effect"
import { Skill } from "@/skill"
import { skillIdFromName, upsertSkill } from "@/skill/upsert"
import * as Tool from "./tool"

const Params = Schema.Struct({
  name: Schema.String.annotate({ description: "Skill name (e.g. 'Rust Debugging')" }),
  description: Schema.String.annotate({ description: "One-line description of what this skill enables" }),
  body: Schema.String.annotate({ description: "Full skill instructions (markdown). Include workflow, tips, examples." }),
  tags: Schema.optional(Schema.Array(Schema.String).annotate({ description: "Optional tags" })),
})

export const SkillUpsertTool = Tool.define(
  "skill_upsert",
  Effect.gen(function* () {
    const skills = yield* Skill.Service
    return {
      description:
        "Create or update a persistent skill. Same name updates in place — never creates a duplicate. The skill is stored in ~/.arcana/skills and loaded automatically.",
      parameters: Params,
      execute: (params: Schema.Schema.Type<typeof Params>) =>
        Effect.gen(function* () {
          const listed = yield* skills.all()
          const catalog = listed.map((item) => ({
            id: skillIdFromName(item.name),
            name: item.name,
            description: item.description,
            location: item.location,
          }))
          const result = upsertSkill({
            name: params.name,
            description: params.description,
            body: params.body,
            tags: params.tags ? [...params.tags] : undefined,
            catalog,
          })
          const verb = result.created ? "created" : "updated"
          return {
            title: `skill ${verb}`,
            output: [
              `Skill ${verb}: ${params.name} (${result.id})`,
              `Stored at ${result.path}`,
              result.matchedExistingId ? `Matched existing skill id ${result.matchedExistingId}; did not create a second copy.` : "",
              "Available next session. Content for this session:",
              "",
              params.body.trim(),
            ]
              .filter(Boolean)
              .join("\n"),
            metadata: { id: result.id, created: result.created },
          }
        }),
    }
  }),
)
