# Plan: Arcana Voice Input

## Goal

Add a local, push-to-talk voice input path to the Arcana TUI:

1. Microphone → external recorder
2. Local Whisper / whisper.cpp ASR
3. Raw transcript → **s1-mini via Ollama** for cleanup/normalization
4. The normalized text is **automatically written into the prompt input and submitted**

No engine/daemon changes; audio and inference stay on the user's machine.

## Background

- The TUI's audio subsystem (`packages/tui/src/audio.ts`, `@opentui/core` `Audio`) is **playback-only** — it can play MP3 attention sounds but cannot capture the microphone.
- The TUI already detects local Ollama (`packages/core/src/providers/ollama.ts`) and has a provider/model picker.
- The prompt component (`packages/tui/src/component/prompt/index.tsx`) exposes a `PromptRef` with `set()` and `submit()` that lets external code populate the composer and send.
- Commands, slash commands, and keybinds are centralized in `packages/tui/src/keymap.tsx` and `packages/tui/src/config/keybind.ts`.
- "No hardcoding — user selects" means model/binary paths and backends must be configurable, not baked in.

## Options Considered

### ASR backend

| Option | Pros | Cons |
|--------|------|------|
| **whisper.cpp CLI (recommended)** | Single portable binary, no Python, fast on CPU/GPU | User must obtain binary + model |
| faster-whisper (Python) | Good accuracy, Python ecosystem | Requires Python env, heavier install |
| Engine endpoint | Centralized, could share models | Requires daemon changes, audio leaves TUI |

**Recommendation:** whisper.cpp CLI as the default supported backend, with the binary path and model path user-configurable.

### Microphone capture

| Option | Pros | Cons |
|--------|------|------|
| **External recorder (recommended)** | Works today on all platforms | Requires ffmpeg/sox/arecord/rec |
| Native OS APIs via FFI/Node | No external binary | Large per-platform code, fragile in TUI |

**Recommendation:** Shell out to a configurable external recorder. Default detection order: `ffmpeg` → `sox` → `arecord` → `rec`, with platform-specific default device args.

### Pipeline location

| Option | Pros | Cons |
|--------|------|------|
| **TUI-local (recommended)** | No network, no daemon changes, fastest loop | Must manage async subprocesses in TUI |
| Engine endpoint | Could reuse Ollama/provider abstraction | Much larger scope, audio transport |

**Recommendation:** TUI-local. The flow is entirely client-side: record to temp WAV → whisper.cpp → Ollama normalizer → prompt submit.

### UX: composer dialog vs. auto-send

The requested behavior is **auto-send**: s1-mini writes the prompt and it is sent automatically. We will implement that, with a config escape hatch (`voice.auto_submit`) so users who later want a review step can toggle it without a code change.

While recording, a non-blocking toast/overlay shows the listening state. Errors surface as toasts with actionable next steps ("recorder not found", "whisper.cpp binary not set", "Ollama model missing").

## Recommended Design

### User flow

1. Press `voice_toggle` keybind (default `<leader>v`) — toast shows "listening…" / arcane equivalent.
2. Speak. Terminal cannot reliably detect "key held", so the recording is **toggle-based**: press the same keybind again (or Enter/Esc) to stop.
3. TUI runs the recorder output through whisper.cpp.
4. Raw transcript is sent to the configured Ollama model (default `superwhisper/s1-mini`) with a cleanup prompt.
5. Normalized text is inserted into the active prompt input and `submit()` is invoked.
6. If `voice.auto_submit` is false, the text is inserted but the user presses Enter manually.

### Configuration schema (TUI config)

```jsonc
{
  "voice": {
    "enabled": true,
    "auto_submit": true,
    "recorder": {
      "binary": "ffmpeg",          // or full path, or "sox", "arecord", "rec"
      "args": ["-y", "-f", "avfoundation", "-i", ":0", "-ar", "16000", "-ac", "1", "{output}"]
    },
    "asr": {
      "backend": "whisper.cpp",
      "binary": "whisper-cli",      // or full path to whisper.cpp main
      "model": "~/models/ggml-base.en.bin",
      "language": "en"
    },
    "normalizer": {
      "provider": "ollama",
      "host": "http://localhost:11434",
      "model": "superwhisper/s1-mini",
      "prompt": "Clean up this voice transcript. Remove filler words (um, uh, like), fix punctuation and casing, and return ONLY the concise prompt text. Do not add commentary.\n\nTranscript:\n{text}"
    }
  }
}
```

- Recorder args may contain `{output}` which the TUI replaces with the temp WAV path.
- When `recorder.binary` is omitted, the TUI tries the common tools in order.
- When `asr.binary` is omitted, the TUI tries `whisper-cli`, `whisper.cpp`, `main` in PATH.
- `normalizer.model` defaults to `superwhisper/s1-mini`; user can override.

### Architecture

New modules under `packages/tui/src/voice/`:

- `recorder.ts` — detect recorder, build command, record to temp WAV, return path.
- `whisper.ts` — run whisper.cpp CLI, parse stdout into raw transcript.
- `normalizer.ts` — call Ollama chat/completions API to clean the transcript.
- `orchestrator.ts` — state machine: idle → recording → transcribing → normalizing → sending; exposes `start()`, `stop()`, `cancel()`, and reactive status.
- `keybind.ts` (or inline in `keymap.tsx`) — register `voice_toggle` and `/voice` palette command.

Integration points:
- `SpineComposer` / `CommandSpineShell` registers the voice command/keybind and passes the current `PromptRef` to the orchestrator.
- `Prompt` component gets an optional `onVoiceSubmit` prop or the orchestrator calls `promptRef.set()` + `promptRef.submit()` directly.

### State machine

```
idle ──voice_toggle──> recording ──stop/cancel──> transcribing ──success──> normalizing ──success──> sending ──> idle
                                                          │                      │                  │
                                                          └──── error ─────────> idle (toast)         │
                                                                                 └──── error ────> idle (toast)
```

Recording is aborted by pressing `voice_toggle` again, Escape, or Enter. If the prompt area is currently disabled (permission/question gate open), voice input is disabled with a toast.

### Error handling

| Failure | User-facing message |
|---------|---------------------|
| No recorder found | "No voice recorder found. Install ffmpeg/sox or set `voice.recorder.binary`." |
| Recorder exits non-zero | "Voice recording failed. Check `voice.recorder.args`." |
| No whisper.cpp binary | "ASR binary not found. Set `voice.asr.binary` to whisper.cpp." |
| Whisper produces no text | "Nothing heard — try again." |
| Ollama unreachable | "Ollama not running. Start it or set a different `voice.normalizer.host`." |
| Model missing in Ollama | "Model `superwhisper/s1-mini` not found in Ollama. Pull it first." |
| Normalizer returns empty | "Voice prompt was empty after cleanup — try again." |

### Voice copy / lexicon

Add arcane/plain labels in `packages/tui/src/branding.ts`:

- `Lexicon.Voice.listen` = "attending" / "listening"
- `Lexicon.Voice.transcribe` = "transcribing" / "transcribing"
- `Lexicon.Voice.normalize` = "refining" / "refining"
- `Lexicon.Voice.send` = "casting" / "sending"

Toast messages pick the active voice.

## Implementation Steps

### 1. Configuration plumbing

- `packages/tui/src/config/index.tsx`
  - Add `Voice` schema with recorder/asr/normalizer sub-schemas.
  - Merge defaults in `resolve()`.
- `packages/tui/src/config/keybind.ts`
  - Add `voice_toggle` definition, default `<leader>v`, mapped to command `voice.toggle`.

### 2. Voice core modules

- `packages/tui/src/voice/recorder.ts`
  - `detectRecorder(): { binary, args }`
  - `record(options, signal): Promise<string>` returning temp WAV path.
  - Platform hints for ffmpeg device selection (avfoundation/macOS, dshow/Windows, alsa/Pulse default/Linux).
- `packages/tui/src/voice/whisper.ts`
  - `transcribe(wavPath, options, signal): Promise<string>`
  - Build whisper.cpp CLI args (`-m model`, `-f wav`, `-l lang`, `--output-txt`, etc.) and parse the generated `.txt` file.
- `packages/tui/src/voice/normalizer.ts`
  - `normalize(text, options, signal): Promise<string>`
  - POST to Ollama `/api/generate` or `/api/chat` with the configured model and prompt template.
  - Reuse `detectLocalOllama` for reachability/model check.
- `packages/tui/src/voice/orchestrator.ts`
  - Solid signals for `status: 'idle' | 'recording' | 'transcribing' | 'normalizing' | 'sending'` and `error`.
  - `start()` / `stop()` / `cancel()`.
  - On success, call injected `onResult(text)` callback.

### 3. UI integration

- `packages/tui/src/shell/command-spine/command-spine-shell.tsx`
  - Register palette command `voice.toggle` and `/voice` slash command.
  - Bind `voice_toggle` keybind to the orchestrator.
  - Pass `promptRef` into the orchestrator so it can `set()` + `submit()`.
- `packages/tui/src/component/prompt/index.tsx`
  - Ensure `PromptRef.submit()` works when called from a dialog/toast-driven flow (it already does).
  - Optionally expose a stable `onVoiceResult` callback; not required if orchestrator uses the ref.
- `packages/tui/src/branding.ts`
  - Add voice lexicon entries and a voice-specific placeholder line.

### 4. Tests

- `packages/tui/test/voice/recorder.test.ts`
  - Command construction with `{output}` placeholder.
  - Detection order / fallback.
- `packages/tui/test/voice/whisper.test.ts`
  - CLI arg construction.
  - Parsing of a sample `.txt` output file.
- `packages/tui/test/voice/normalizer.test.ts`
  - Ollama request body shape.
  - Prompt template substitution.
- `packages/tui/test/voice/orchestrator.test.ts`
  - State transitions with mocked recorder/whisper/normalizer.
  - Cancel at recording stage.
- `packages/tui/test/keymap.test.tsx`
  - `voice_toggle` keybind resolves to `voice.toggle` command.

### 5. Documentation

- Add `voice` section to `docs/customizing-arcana.md`.
- Example setup for ffmpeg + whisper.cpp + Ollama s1-mini.

## Files to Change

- `packages/tui/src/config/index.tsx` — Voice config schema + defaults.
- `packages/tui/src/config/keybind.ts` — `voice_toggle` definition.
- `packages/tui/src/voice/recorder.ts` — new.
- `packages/tui/src/voice/whisper.ts` — new.
- `packages/tui/src/voice/normalizer.ts` — new.
- `packages/tui/src/voice/orchestrator.ts` — new.
- `packages/tui/src/shell/command-spine/command-spine-shell.tsx` — command/keybind registration.
- `packages/tui/src/component/prompt/index.tsx` — minor: ensure ref submit is safe when driven externally.
- `packages/tui/src/branding.ts` — voice lexicon.
- `packages/tui/test/voice/*.test.ts` — new tests.
- `docs/customizing-arcana.md` — config examples.

## Open Questions

1. **Toggle vs. hold-to-talk:** Terminals can't reliably detect held keys, so the plan uses a toggle. Is that acceptable, or do you want us to explore whisper.cpp's real-time `stream` mode for true push-to-talk?
2. **Auto-send safety:** Should there be a very short preview delay (e.g., 300 ms) so a user can see what is about to be sent, or is immediate submission exactly what you want?
3. **Model pull helper:** Should the TUI offer to run `ollama pull <model>` when the configured normalizer model is missing, or just toast and let the user pull manually?

## Migration / Compatibility

- Fully opt-in; `voice.enabled` defaults to `false` until the user configures a recorder + ASR binary.
- No engine, SDK, or API changes.
- Existing keybinds are unchanged; `voice_toggle` can be remapped or disabled via config.
