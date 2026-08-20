import { createMemo } from "solid-js"
import { useTuiConfig } from "../config"
import { Lexicon } from "../branding"
import { createVoiceOrchestrator, type VoiceLexicon, type VoiceOrchestrator } from "../voice/orchestrator"
import { usePromptRef } from "./prompt"
import { useToast } from "../ui/toast"
import { createSimpleContext } from "./helper"
import { ARCANA_BASE_MODE, useBindings } from "../keymap"

export type VoiceAPI = VoiceOrchestrator

const VoiceContext = createSimpleContext({
  name: "Voice",
  init: () => {
    const config = useTuiConfig()
    const promptRef = usePromptRef()
    const toast = useToast()
    const voiceConfig = createMemo(() => config.voice)
    const lexicon = createMemo<VoiceLexicon>(() => ({
      listen: Lexicon.Voice.listen,
      transcribe: Lexicon.Voice.transcribe,
      normalize: Lexicon.Voice.normalize,
      send: Lexicon.Voice.send,
      error: Lexicon.Voice.error,
    }))

    const orchestrator = createVoiceOrchestrator({
      config: voiceConfig,
      toast,
      lexicon,
      onResult: (text, autoSubmit) => {
        const current = promptRef.current
        if (!current) {
          toast.show({
            message: `${lexicon().error}: No prompt is available to receive voice input`,
            variant: "error",
          })
          return
        }
        current.set({ input: text, parts: [] })
        if (autoSubmit) {
          current.submit()
        } else {
          current.focus()
        }
      },
    })

    useBindings(() => ({
      mode: ARCANA_BASE_MODE,
      commands: [
        {
          name: "voice.toggle",
          title: orchestrator.status() === "recording" ? "Stop voice input" : "Start voice input",
          category: "Input",
          namespace: "palette",
          run() {
            const currentStatus = orchestrator.status()
            if (currentStatus === "recording") {
              void orchestrator.stop()
            } else if (currentStatus === "idle" || currentStatus === "error") {
              void orchestrator.start()
            }
          },
        },
      ],
    }))

    useBindings(() => ({
      mode: ARCANA_BASE_MODE,
      bindings: config.keybinds.gather("voice_toggle", ["voice.toggle"]),
    }))

    return orchestrator
  },
})

export const VoiceProvider = VoiceContext.provider
export const useVoice = VoiceContext.use
