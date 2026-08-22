import { createMemo, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { useTuiConfig } from "../config"
import { Lexicon } from "../branding"
import { createVoiceOrchestrator, type VoiceLexicon, type VoiceOrchestrator } from "../voice/orchestrator"
import { createVoiceHoldListener } from "../voice/hold"
import { usePromptRef } from "./prompt"
import { useToast } from "../ui/toast"
import { useKV } from "./kv"
import { createSimpleContext } from "./helper"
import { ARCANA_BASE_MODE, useBindings } from "../keymap"

export type VoiceAPI = VoiceOrchestrator

const VoiceContext = createSimpleContext({
  name: "Voice",
  init: () => {
    const renderer = useRenderer()
    const config = useTuiConfig()
    const promptRef = usePromptRef()
    const toast = useToast()
    const kv = useKV()
    const voiceConfig = createMemo(() => {
      const kvEnabled = kv.get("voice_enabled")
      return {
        ...config.voice,
        enabled: kvEnabled !== undefined ? (kvEnabled as boolean) : config.voice.enabled,
      }
    })
    const lexicon = createMemo<VoiceLexicon>(() => ({
      listen: Lexicon.Voice.listen,
      transcribe: Lexicon.Voice.transcribe,
      normalize: Lexicon.Voice.normalize,
      send: Lexicon.Voice.send,
      disabled: Lexicon.Voice.disabled,
      error: Lexicon.Voice.error,
    }))

    const orchestrator = createVoiceOrchestrator({
      config: voiceConfig,
      toast,
      lexicon,
      onStatusChange: (next) => {
        kv.set("voice_recording", next === "recording")
        kv.set("voice_status", next)
      },
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

    onCleanup(
      createVoiceHoldListener({
        renderer,
        config: voiceConfig,
        orchestrator,
        onDisabledHint: () => {
          toast.show({
            message: `${lexicon().disabled} Run /voice to unseal.`,
            variant: "info",
            duration: 5000,
          })
        },
      }),
    )

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
        {
          name: "voice.enable",
          title: "Enable voice input",
          category: "Input",
          namespace: "palette",
          slashName: "voice",
          slashAliases: ["enable-voice", "voice-on"],
          hidden: voiceConfig().enabled,
          run() {
            kv.set("voice_enabled", true)
            toast.show({ message: "Voice input enabled", variant: "info" })
          },
        },
        {
          name: "voice.disable",
          title: "Disable voice input",
          category: "Input",
          namespace: "palette",
          slashName: "disable-voice",
          slashAliases: ["voice-off"],
          hidden: !voiceConfig().enabled,
          run() {
            kv.set("voice_enabled", false)
            orchestrator.cancel()
            toast.show({ message: "Voice input disabled", variant: "info" })
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
