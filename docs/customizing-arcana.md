---
document_class: reference
authority: reference_guide
status: current
owner: maintainer
last_updated: 2026-08-17
---

# Customizing arcana: themes, voice, and config

This guide covers the three ways to make arcana yours: **themes**, the
**interface voice**, and **arcana.json** configuration. For the full config
reference, load the built-in **"customizing arcana"** skill (registered in
`packages/core/src/plugin/skill/customize-arcana.md`) or fetch the published
JSON schema at <https://github.com/Lento47/arcana>.

---

## Themes

### Built-in themes

11 ship with the TUI (`packages/tui/src/theme/assets/*.json`):

`arcana` (default), `bloodmoon`, `coven`, `crypt`, `dragon`, `grimoire`,
`jade`, `lich`, `oracle`, `sakura`, `wraith`.

Switch with `/theme` in the TUI, or on disk:

```bash
arcana theme set --name dragon     # writes ~/.config/arcana/tui.json
```

```jsonc
// ~/.config/arcana/tui.json
{ "theme": "dragon" }
```

There is also a `system` theme that is generated automatically from your
terminal's palette.

### Custom themes

Drop a theme JSON file into any of these directories (same schema as the
built-ins — copy one as a template):

| Scope | Path |
|---|---|
| Global | `~/.config/arcana/themes/<name>.json` (Windows: `%APPDATA%\arcana\themes\`; override with `ARCANA_CONFIG_DIR`) |
| Project | `.arcana/themes/<name>.json` or `.opencode/themes/<name>.json` in the project dir **or any parent directory** (walked up to the filesystem root) |

Precedence: built-in < plugin-provided < custom files, with later/deeper
paths winning — a project theme overrides a global theme of the same name.
Custom themes are picked up automatically (rescan + `SIGUSR2` reload), so
no restart is needed to add one.

A theme JSON has a `defs` block (named color references) and a `theme` block
mapping ~75 tokens (text, surfaces, diffs, markdown, syntax, and `spine*`
roles) to `{ "dark": ..., "light": ... }` variants. Missing tokens fall back
safely, and a contrast floor is applied automatically (body text ≥ 7:1,
muted ≥ 4.5:1), so themes stay readable by construction.

### Interface voice

The interface copy ships in two voices: `arcane` (the default — occult verbs
like *scrying*, *invoking*, *glyphs*) and `plain` (plain language — *reading*,
*running*, *tokens*). Switch with `arcana lexicon set --name plain` or in
`~/.config/arcana/tui.json`:

```jsonc
{ "theme": "dragon", "lexicon": "plain" }
```

Restart arcana to apply. The brand layer (sigils, theme names, wordmark) is
unchanged in either voice.

---

## Voice input

Press `ctrl+x v` (leader, then `v`) to toggle voice input. The pipeline is
fully local and TUI-side:

1. An external recorder captures your microphone to a 16 kHz mono WAV.
2. A local whisper.cpp CLI transcribes the WAV.
3. A local Ollama model (default `superwhisper/s1-mini`) cleans up the
   transcript.
4. The cleaned text replaces the prompt input and is submitted automatically
   (unless you set `voice.auto_submit` to `false`).

### Requirements

- A recorder: `ffmpeg` is preferred; `sox`/`rec` and Linux `arecord` also work.
- A whisper.cpp binary: `whisper-cli`, `whisper.cpp`, or `main`.
- A whisper.cpp model (ggml/gguf) downloaded locally.
- Ollama running with the configured model pulled (`ollama pull superwhisper/s1-mini`).

### Configuration

Add a `voice` block to `~/.config/arcana/tui.json` (project config does not
merge `voice`; it lives in TUI config only):

```jsonc
{
  "voice": {
    "enabled": true,
    "auto_submit": true,
    "recorder": {
      // Optional. If omitted, arcana tries ffmpeg/sox/rec/arecord.
      "binary": "ffmpeg",
      "args": ["-y", "-f", "avfoundation", "-i", ":0", "-ar", "16000", "-ac", "1", "{output}"]
    },
    "asr": {
      // Only whisper.cpp is supported today.
      "backend": "whisper.cpp",
      "binary": "whisper-cli",
      "model": "~/.local/share/whisper/models/base.bin",
      "language": "en"
    },
    "normalizer": {
      // Only Ollama is supported today.
      "provider": "ollama",
      "host": "http://localhost:11434",
      "model": "superwhisper/s1-mini",
      "prompt": "Clean up this voice transcript. Remove filler words, fix punctuation and casing, and return ONLY the concise prompt text.\n\nTranscript:\n{text}"
    }
  }
}
```

`{output}` in recorder args is replaced with the temp WAV path; `{text}` in the
normalizer prompt is replaced with the raw transcript. If no recorder or ASR
binary is found, the first voice toggle shows a setup toast.

---

## Configuring arcana (arcana.json)

### Where config lives

| Scope | Path |
|---|---|
| Project | `./arcana.json`, `./arcana.jsonc`, or `.arcana/arcana.json` (walked up from cwd to the worktree root) |
| Global | `~/.config/arcana/arcana.json` (not `~/.arcana/`) |

Project config deep-merges over global config. Unknown top-level keys are
rejected (`ConfigInvalidError`) — validate against the schema before writing,
and declare `"$schema": "https://github.com/Lento47/arcana"` so your editor
catches mistakes. Config is loaded once at startup and is **not**
hot-reloaded: quit and restart arcana after changing it.

### Quick tour

```jsonc
{
  "$schema": "https://github.com/Lento47/arcana",
  "model": "anthropic/claude-sonnet-4-6",
  "small_model": "anthropic/claude-haiku-4-5",
  "default_agent": "build",
  "instructions": ["AGENTS.md", "docs/style.md"],

  // Agents: inline here or as files in .arcana/agent/<name>.md
  "agent": {
    "my-reviewer": { "description": "...", "mode": "subagent", "permission": { "edit": "deny" } }
  },

  // Skills: scan extra paths / URLs
  "skills": { "paths": [".arcana/skills", "/abs/path/to/skills"] },

  // Permissions: "allow" | "ask" | "deny"; per-tool patterns, LAST match wins
  "permission": {
    "edit": "deny",
    "bash": { "git *": "allow", "rm *": "deny", "*": "ask" }
  },

  // MCP servers: local (command array) or remote (url + headers)
  "mcp": {
    "playwright": { "type": "local", "command": ["npx", "-y", "@playwright/mcp"], "enabled": true }
  },

  // Plugins: npm specs, local files, or [name, options] tuples
  "plugin": ["arcana-gemini-auth", "./local-plugin.ts"]
}
```

Highlights:

- **Agents** — define in `agent` or as `.arcana/agent/<name>.md` files
  (frontmatter: `description`, `mode`, `model`, `permission`, ...). Built-ins:
  `build`, `plan`, `general`, `explore`. Disable one with
  `agent: { build: { disable: true } }`.
- **Skills** — `SKILL.md` files in `.arcana/skills/<name>/` (global:
  `~/.config/arcana/skills/`); external ones auto-load from `~/.claude/skills/`
  and `~/.agents/skills/`.
- **Plugins** — any `*.ts`/`*.js` in `.arcana/plugin/` auto-registers. A plugin
  exports a function returning hooks (`config`, `tool.execute.before/after`,
  `chat.message`, `permission.ask`, `experimental.*`, ...).
- **References** — expose local dirs / Git repos to agents via `references`,
  keyed by the `@`-autocomplete alias.
- **Escape hatches** — broken config can't brick startup:
  `ARCANA_DISABLE_PROJECT_CONFIG=1` (start from globals only),
  `ARCANA_CONFIG=<path>`, `ARCANA_CONFIG_CONTENT='{...}'`,
  `ARCANA_PURE=1` (skip external plugins), `ARCANA_DISABLE_EXTERNAL_SKILLS=1`.

---

## Summary

| I want to... | Do this |
|---|---|
| Pick a theme | `/theme`, or `arcana theme set --name <name>` |
| Add my own theme | Drop a theme JSON in `.arcana/themes/` |
| Switch the interface voice | `arcana lexicon set --name plain` (or `arcane`) |
| Use voice input | Press `ctrl+x v`; configure `voice` in `~/.config/arcana/tui.json` |
| Change models, agents, skills, plugins, permissions | Edit `arcana.json` (project or `~/.config/arcana/arcana.json`) and restart |

For anything not covered here, load the built-in **"customizing arcana"**
skill or read the published JSON schema before writing config.
