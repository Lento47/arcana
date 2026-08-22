export * as TuiConfig from "."

import { createBindingLookup } from "@opentui/keymap/extras"
import { Schema } from "effect"
import { createContext, type JSX, useContext } from "solid-js"
import { TuiKeybind } from "./keybind"

export const AttentionSoundName = Schema.Literals([
  "default",
  "question",
  "permission",
  "error",
  "done",
  "subagent_done",
])
export type AttentionSoundName = Schema.Schema.Type<typeof AttentionSoundName>

export const PluginOptions = Schema.Record(Schema.String, Schema.Unknown)
export const PluginSpec = Schema.Union([Schema.String, Schema.mutable(Schema.Tuple([Schema.String, PluginOptions]))])

export const LeaderTimeoutDefault = 2000
export const LeaderTimeout = Schema.Int.check(Schema.isGreaterThan(0)).annotate({
  description: "Leader key timeout in milliseconds",
})

export const ScrollSpeed = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0.001))
export const ScrollAcceleration = Schema.Struct({
  enabled: Schema.Boolean.annotate({ description: "Enable scroll acceleration" }),
}).annotate({ description: "Scroll acceleration settings" })
export const DiffStyle = Schema.Literals(["auto", "stacked"]).annotate({
  description: "Control diff rendering style: 'auto' adapts to terminal width, 'stacked' always shows single column",
})

export const AttentionSounds = Schema.Record(AttentionSoundName, Schema.optionalKey(Schema.String))
export type AttentionSoundPaths = Schema.Schema.Type<typeof AttentionSounds>
export const Attention = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  notifications: Schema.optional(Schema.Boolean),
  sound: Schema.optional(Schema.Boolean),
  volume: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1))),
  sound_pack: Schema.optional(Schema.String),
  sounds: Schema.optional(AttentionSounds),
}).annotate({ description: "Attention notification and sound settings" })

const PromptSize = Schema.Int.check(Schema.isGreaterThan(0))
export const Prompt = Schema.Struct({
  max_height: Schema.optional(PromptSize).annotate({ description: "Prompt textarea max height" }),
  max_width: Schema.optional(Schema.Union([PromptSize, Schema.Literal("auto")])).annotate({
    description: "Home prompt max width: a positive integer for a fixed cap, or 'auto' to scale with terminal width",
  }),
  metrics_bar: Schema.optional(Schema.Boolean).annotate({
    description: "Show the session metrics bar below the input prompt (elapsed, tokens, cost, context pressure). Default: true",
  }),
  ai_suggestion: Schema.optional(Schema.Boolean).annotate({
    description:
      "Show inline ghost-text suggestions for skills, agents, and plugins as you type. Press Tab to accept. Default: false",
  }),
}).annotate({ description: "Prompt size settings" })

export const Background = Schema.Struct({
  image: Schema.optional(Schema.String).annotate({
    description: "Path to a background image (PNG/JPEG); its dominant color is painted once via OSC-11 on truecolor terminals — a later theme switch replaces the terminal background",
  }),
  enabled: Schema.optional(Schema.Boolean).annotate({ description: "Enable the background image" }),
  opacity: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1)),
  ).annotate({ description: "Image brightness 0-1 so foreground text stays readable (default 0.5)" }),
  fit: Schema.optional(Schema.Literals(["cover", "contain"])).annotate({
    description: "Accepted for backward compatibility; inert since the truecolor-gated OSC-11 background paints a flat dominant color (audit C1/D6)",
  }),
})
export type Background = Schema.Schema.Type<typeof Background>

export const VoiceRecorder = Schema.Struct({
  binary: Schema.optional(Schema.String).annotate({
    description: "External recorder command (ffmpeg, sox, arecord, rec) or absolute path",
  }),
  args: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Recorder args; {output} is replaced with the temp WAV path",
  }),
}).annotate({ description: "External microphone recorder settings" })

export const VoiceAsr = Schema.Struct({
  backend: Schema.optional(Schema.Literal("whisper.cpp")).annotate({ description: "Local ASR backend" }),
  binary: Schema.optional(Schema.String).annotate({
    description: "whisper.cpp CLI binary name or absolute path",
  }),
  model: Schema.optional(Schema.String).annotate({ description: "Path to the whisper.cpp model (ggml/gguf)" }),
  language: Schema.optional(Schema.String).annotate({ description: "Language code, e.g. 'en'" }),
}).annotate({ description: "Automatic speech recognition settings" })

export const VoiceNormalizer = Schema.Struct({
  provider: Schema.optional(Schema.Literal("ollama")).annotate({ description: "Local LLM normalizer provider" }),
  host: Schema.optional(Schema.String).annotate({ description: "Ollama API host, default http://localhost:11434" }),
  model: Schema.optional(Schema.String).annotate({
    description: "Ollama model for transcript cleanup, default superwhisper/s1-mini",
  }),
  prompt: Schema.optional(Schema.String).annotate({
    description: "Prompt template; {text} is replaced with the raw transcript",
  }),
}).annotate({ description: "Transcript normalization settings" })

export const Voice = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({ description: "Enable voice input" }),
  auto_submit: Schema.optional(Schema.Boolean).annotate({
    description: "Insert normalized prompt and submit automatically (default true)",
  }),
  hold_key: Schema.optional(Schema.String).annotate({
    description: "Push-to-talk key to hold for voice input. Use 'alt' for either Alt key (default: alt)",
  }),
  hold_delay_ms: Schema.optional(Schema.Int.check(Schema.isGreaterThan(-1))).annotate({
    description:
      "How long the push-to-talk key must be held before the microphone activates (ms, default 3000)",
  }),
  recorder: Schema.optional(VoiceRecorder),
  asr: Schema.optional(VoiceAsr),
  normalizer: Schema.optional(VoiceNormalizer),
}).annotate({ description: "Voice input settings" })
export type Voice = Schema.Schema.Type<typeof Voice>

export const Shell = Schema.Literals(["opencode", "command-spine"]).annotate({
  description: "TUI shell layout: 'opencode' (legacy chat-style) or 'command-spine' (chronicle layout)",
})
export type Shell = Schema.Schema.Type<typeof Shell>

export const LexiconVoice = Schema.Literals(["arcane", "plain"]).annotate({
  description: "Interface voice: 'arcane' (default occult verbs and copy) or 'plain' (plain-language verbs and copy)",
})
export type LexiconVoice = Schema.Schema.Type<typeof LexiconVoice>

export const StatusSegmentKey = Schema.Literals(["branch", "model", "ctx", "state", "drive", "session", "path"])
export type StatusSegmentKey = Schema.Schema.Type<typeof StatusSegmentKey>

export const Info = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  shell: Schema.optional(Shell).annotate({ description: "TUI shell layout" }),
  theme: Schema.optional(Schema.String),
  lexicon: Schema.optional(LexiconVoice).annotate({ description: "Interface voice (arcane | plain)" }),
  keybinds: Schema.optional(TuiKeybind.KeybindOverrides),
  plugin: Schema.optional(Schema.Array(PluginSpec)),
  plugin_enabled: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  leader_timeout: Schema.optional(LeaderTimeout),
  attention: Schema.optional(Attention),
  prompt: Schema.optional(Prompt),
  scroll_speed: Schema.optional(ScrollSpeed).annotate({ description: "TUI scroll speed" }),
  scroll_acceleration: Schema.optional(ScrollAcceleration),
  diff_style: Schema.optional(DiffStyle),
  mouse: Schema.optional(Schema.Boolean).annotate({ description: "Enable or disable mouse capture (default: true)" }),
  background: Schema.optional(Background).annotate({ description: "Custom TUI background image" }),
  voice: Schema.optional(Voice).annotate({ description: "Voice input settings" }),
  status_segments: Schema.optional(Schema.Array(StatusSegmentKey)).annotate({
    description:
      "Header status segments to show, in order: branch, model, ctx, state, session, path. Unset = automatic (fits the terminal width).",
  }),
  status_separator: Schema.optional(Schema.String).annotate({
    description: "Separator between header status segments (default: ' | ')",
  }),
  self_governance: Schema.optional(Schema.Boolean).annotate({
    description:
      "Accept local self-governance when no external daemon is connected. When true, UNAVAILABLE trace health is treated as acceptable and authority actions are not blocked. Default: false",
  }),
})
export type Info = Schema.Schema.Type<typeof Info>

export type Resolved = Omit<
  Info,
  "attention" | "keybinds" | "leader_timeout" | "mouse" | "self_governance" | "shell" | "status_separator" | "voice"
> & {
  shell: Shell
  lexicon: LexiconVoice
  self_governance: boolean
  attention: {
    enabled: boolean
    notifications: boolean
    sound: boolean
    volume: number
    sound_pack: string
    sounds: AttentionSoundPaths
  }
  keybinds: TuiKeybind.BindingLookupView
  leader_timeout: number
  mouse: boolean
  status_separator: string
  voice: {
    enabled: boolean
    auto_submit: boolean
    hold_key: string
    hold_delay_ms: number
    recorder: {
      binary?: string
      args?: string[]
    }
    asr: {
      backend: "whisper.cpp"
      binary?: string
      model?: string
      language?: string
    }
    normalizer: {
      provider: "ollama"
      host: string
      model: string
      prompt: string
    }
  }
}

export const ResolveOptions = Schema.Struct({
  terminalSuspend: Schema.Boolean,
})
export type ResolveOptions = Schema.Schema.Type<typeof ResolveOptions>

export function resolve(input: Info, options: ResolveOptions): Resolved {
  const keybinds: TuiKeybind.KeybindOverrides = { ...input.keybinds }
  if (!options.terminalSuspend) {
    keybinds.terminal_suspend = "none"
    if (keybinds.input_undo === undefined) {
      const inputUndo = TuiKeybind.defaultValue("input_undo")
      keybinds.input_undo = ["ctrl+z", ...(typeof inputUndo === "string" ? inputUndo.split(",") : [])]
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(",")
    }
  }

  return {
    ...input,
    attention: {
      enabled: input.attention?.enabled ?? false,
      notifications: input.attention?.notifications ?? true,
      sound: input.attention?.sound ?? true,
      volume: input.attention?.volume ?? 0.4,
      sound_pack: input.attention?.sound_pack ?? "arcana.default",
      sounds: input.attention?.sounds ?? {},
    },
    shell: input.shell ?? "command-spine",
    lexicon: input.lexicon ?? "arcane",
    keybinds: createBindingLookup(TuiKeybind.toBindingConfig(TuiKeybind.parse(keybinds)), {
      commandMap: TuiKeybind.CommandMap,
      bindingDefaults: TuiKeybind.bindingDefaults(),
    }),
    leader_timeout: input.leader_timeout ?? LeaderTimeoutDefault,
    mouse: input.mouse ?? true,
    self_governance: input.self_governance ?? false,
    status_separator: input.status_separator ?? " | ",
    prompt: {
      ...input.prompt,
      ai_suggestion: input.prompt?.ai_suggestion ?? false,
    },
    voice: {
      enabled: input.voice?.enabled ?? true,
      auto_submit: input.voice?.auto_submit ?? true,
      hold_key: input.voice?.hold_key ?? "alt",
      hold_delay_ms: input.voice?.hold_delay_ms ?? 3000,
      recorder: {
        binary: input.voice?.recorder?.binary,
        args: input.voice?.recorder?.args,
      },
      asr: {
        backend: input.voice?.asr?.backend ?? "whisper.cpp",
        binary: input.voice?.asr?.binary,
        model: input.voice?.asr?.model,
        language: input.voice?.asr?.language,
      },
      normalizer: {
        provider: input.voice?.normalizer?.provider ?? "ollama",
        host: input.voice?.normalizer?.host ?? "http://localhost:11434",
        model: input.voice?.normalizer?.model ?? "superwhisper/s1-mini",
        prompt:
          input.voice?.normalizer?.prompt ??
          "Clean up this voice transcript. Remove filler words (um, uh, like), fix punctuation and casing, and return ONLY the concise prompt text. Do not add commentary.\n\nTranscript:\n{text}",
      },
    },
  }
}

const ConfigContext = createContext<Resolved>()

export function TuiConfigProvider(props: { config: Resolved; children: JSX.Element }) {
  return <ConfigContext.Provider value={props.config}>{props.children}</ConfigContext.Provider>
}

export function useTuiConfig() {
  const value = useContext(ConfigContext)
  if (!value) throw new Error("TuiConfigProvider is missing")
  return value
}
