# Arcana marketing video — recording plan

Goal: marketing video showing real **arcana CLI** + **arcana TUI**. Apple/OpenAI/Claude
style = clean, minimal, one product, dark, restrained motion, narration over footage.

## Tooling (installed)

- OBS Studio 32.1.2 — screen capture (TUI + terminal window)
- ttyd 1.7.7 — pty backend for vhs
- vhs v0.11.0 (`C:\Users\lejze\go\bin\vhs.exe`) — scripted CLI recordings
- ffmpeg 8.1.1 — remux/trim
- bun 1.3.14 — run arcana from source

## Two capture tracks

### Track A — CLI shots (vhs, reproducible)

Clean scripted keystrokes, deterministic output, no fluff. Best for the
`doctor / models / session list / stats` commands.

```
cd L:\PROJECTS\arcana\marketing
$env:Path = "$env:Path;C:\Users\lejze\go\bin"
vhs cli.tape        # -> arcana-cli.mp4
```

Tune `Sleep` values in `cli.tape` — first-run bun JIT is slow.

### Track B — TUI shots (OBS, interactive)

TUI is interactive opentui/solid — can't script reliably. Capture real terminal.

OBS setup:
1. Open OBS.
2. Sources -> add -> **Window Capture** -> pick Windows Terminal running `arcana`.
3. Settings -> Output:
   - Output Mode: Advanced
   - Recording Format: **MKV** (remux to mp4 after: File -> Remux)
   - Rate Control: **CQP**, CQ 18, Keyframe 2s
4. Settings -> Video: 1920x1080, 60 fps, scale Lanczos.
5. Hotkeys: set Rec Start/Stop to a key.

Record flow (one take or per-shot):
```
arcana                       # TUI opens
  type: "build a hello world http server in bun"
  watch: agent reasoning + tool calls + file edits
  /skills                    # slash surface
  /memory                    # memory surface
  /cron                      # cron surface
  Esc / quit
```

Do 2-3 takes. Pick cleanest.

## Edit (DaVinci Resolve / CapCut)

1. Assemble: CLI shots (Track A) -> TUI shots (Track B) -> outro.
2. Trim dead air, keep ~0.8s pauses.
3. Titles: brand wordmark `arcana` + tagline "self-improving AI agent".
4. Narration: record mic OR TTS (OpenAI tts / ElevenLabs). One line per shot.
5. Music: low, royalty-free, under narration (-18 dB).
6. Color: dark, neutral, no oversaturation. Apple-style = restraint.
7. Outro: wordmark + arcana.otnelhq.com.

## Style refs (Apple / OpenAI / Claude)

- Apple: black bg, white text, product centered, slow push-in, sparse type.
- OpenAI: warm off-black, clean sans, one feature per beat.
- Claude: cream/dark, serif accents, calm pacing.

Pick ONE. Stay consistent across all shots. Do not mix.

## Deliverable

Final mp4, 1080p (or 4K master down to 1080), 30-60s. H.264, AAC.