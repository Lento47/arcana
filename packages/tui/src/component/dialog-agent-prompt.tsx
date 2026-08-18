import { createMemo, createSignal, Show } from "solid-js"
import { useLocal } from "../context/local"
import { useTuiPaths } from "../context/runtime"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"
import { Glyph } from "../branding"
import { readProjectConfig, setAgentPrompt } from "../util/config-edit"
import { writeJsonAtomic } from "../util/persistence"
import { join } from "node:path"

/**
 * Per-agent prompt customization. `agent.<name>.prompt` REPLACES the agent's
 * built-in system prompt for that agent; an empty value removes the override
 * and falls back to the built-in prompt. The engine re-reads opencode.json
 * within seconds (5s file-cache TTL), so no restart is needed.
 */
export function DialogAgentPrompt() {
  const local = useLocal()
  const paths = useTuiPaths()
  const dialog = useDialog()
  const toast = useToast()
  const [agent, setAgent] = createSignal<string | null>(null)
  const [saving, setSaving] = createSignal(false)

  const options = createMemo(() =>
    local.agent.list().map((item) => ({
      value: item.name,
      title: item.name,
      description: item.prompt ? "custom prompt set" : item.native ? "native" : item.description,
    })),
  )

  const configPath = () => join(paths.cwd, "opencode.json")

  const handleSave = async (value: string) => {
    const name = agent()
    if (!name) return
    setSaving(true)
    try {
      const config = await readProjectConfig(configPath())
      const { updated, changed } = setAgentPrompt(config, name, value)
      if (changed) {
        await writeJsonAtomic(configPath(), updated)
        toast.show({
          message: value.trim() ? `Prompt set for ${name}.` : `Prompt removed for ${name} — back to built-in.`,
          variant: "success",
        })
      } else {
        toast.show({ message: `No change for ${name}.`, variant: "info" })
      }
      dialog.clear()
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : "Failed to save prompt", variant: "error" })
      setSaving(false)
    }
  }

  return (
    <Show
      when={agent() === null}
      fallback={
        <DialogPrompt
          title={`${Glyph.sigil} Edit prompt: ${agent()}`}
          description="This replaces the agent's built-in system prompt. Leave empty to remove the override."
          value={local.agent.list().find((item) => item.name === agent())?.prompt ?? ""}
          height={6}
          busy={saving()}
          busyText="Saving..."
          onConfirm={handleSave}
          onCancel={() => dialog.clear()}
        />
      }
    >
      <DialogSelect
        title={`${Glyph.sigil} Edit agent prompt`}
        options={options()}
        onSelect={(option) => setAgent(option.value)}
      />
    </Show>
  )
}
