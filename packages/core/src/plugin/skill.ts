/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { Effect } from "effect"
import { PluginV2 } from "../plugin"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeArcanaContent from "./skill/customize-arcana.md" with { type: "text" }

export const CustomizeArcanaContent = customizeArcanaContent

export const Plugin = PluginV2.define({
  id: PluginV2.ID.make("skill"),
  effect: Effect.gen(function* () {
    const skill = yield* SkillV2.Service
    const transform = yield* skill.transform()

    yield* transform((editor) => {
      editor.source(
        new SkillV2.EmbeddedSource({
          type: "embedded",
          skill: new SkillV2.Info({
            name: "customize-arcana",
            description:
              "Use ONLY when the user is editing or creating arcana's own configuration: arcana.json, arcana.jsonc, files under .arcana/, or files under ~/.config/arcana/. Also use when creating or fixing arcana agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring arcana itself.",
            location: AbsolutePath.make("/builtin/customize-arcana.md"),
            content: CustomizeArcanaContent,
          }),
        }),
      )
    })
  }),
})
