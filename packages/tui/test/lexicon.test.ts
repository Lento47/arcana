import { describe, expect, test } from "bun:test"
import {
  BOOT_PHRASES,
  BOOT_READY,
  COPY,
  IDLE_PHRASES,
  Lexicon,
  PLAIN_BOOT_PHRASES,
  PLAIN_BOOT_READY,
  PLAIN_COPY,
  PLAIN_IDLE_PHRASES,
  PLAIN_LEXICON,
  PLAIN_PLACEHOLDER,
  PLAIN_PROMPT_FRAME,
  PLAIN_VERB_POOL,
  PLAIN_WORDMARK_TAGLINE,
  PLACEHOLDER,
  PROMPT_FRAME,
  VerbPool,
  WORDMARK_TAGLINE,
  setLexiconVoice,
} from "../src/branding"
import { resolve } from "../src/config"

describe("lexicon voice", () => {
  test("defaults to the arcane voice", () => {
    expect(Lexicon.think).toBe("Divining")
    expect(Lexicon.read).toBe("scrying")
    expect(Lexicon.Token.label).toBe("glyphs")
    expect(Lexicon.Agent.subagent).toBe("Familiar")
    expect(VerbPool.pending.shell[0]).toBe("Invoking")
    expect(COPY.inscribedToClipboard).toBe("Inscribed to clipboard")
    expect(PROMPT_FRAME.shell).toBe("Inscribe a command…")
    expect(BOOT_READY).toBe("binding sigils…")
    expect(WORDMARK_TAGLINE).toContain("arcane")
    expect(PLACEHOLDER.normal.length).toBeGreaterThan(0)
    expect(IDLE_PHRASES.length).toBeGreaterThan(0)
    expect(BOOT_PHRASES.length).toBeGreaterThan(0)
  })

  test("setLexiconVoice('plain') swaps every bundle to plain language", () => {
    setLexiconVoice("plain")
    expect(Lexicon).toBe(PLAIN_LEXICON)
    expect(Lexicon.think).toBe("Thinking")
    expect(Lexicon.read).toBe("reading")
    expect(Lexicon.Token.label).toBe("tokens")
    expect(Lexicon.Agent.subagent).toBe("Subagent")
    expect(VerbPool).toBe(PLAIN_VERB_POOL)
    expect(VerbPool.pending.shell[0]).toBe("Running")
    expect(VerbPool.thinking[0]).toBe("Thinking")
    expect(PLACEHOLDER).toBe(PLAIN_PLACEHOLDER)
    expect(PLACEHOLDER.normal[0]).toBe("Ask anything…")
    expect(PROMPT_FRAME).toBe(PLAIN_PROMPT_FRAME)
    expect(PROMPT_FRAME.shell).toBe("Run a command…")
    expect(COPY).toBe(PLAIN_COPY)
    expect(COPY.inscribedToClipboard).toBe("Copied to clipboard")
    expect(IDLE_PHRASES).toBe(PLAIN_IDLE_PHRASES)
    expect(BOOT_PHRASES).toBe(PLAIN_BOOT_PHRASES)
    expect(BOOT_READY).toBe(PLAIN_BOOT_READY)
    expect(WORDMARK_TAGLINE).toBe(PLAIN_WORDMARK_TAGLINE)
  })

  test("setLexiconVoice('arcane') restores the default voice", () => {
    setLexiconVoice("arcane")
    expect(Lexicon.think).toBe("Divining")
    expect(VerbPool.pending.shell[0]).toBe("Invoking")
    expect(COPY.inscribedToClipboard).toBe("Inscribed to clipboard")
    expect(PROMPT_FRAME.shell).toBe("Inscribe a command…")
    expect(BOOT_READY).toBe("binding sigils…")
    expect(WORDMARK_TAGLINE).toContain("arcane")
  })

  test("TuiConfig resolves the voice and defaults to arcane", () => {
    const resolved = resolve({}, { terminalSuspend: true })
    expect(resolved.lexicon).toBe("arcane")
    const plain = resolve({ lexicon: "plain" }, { terminalSuspend: true })
    expect(plain.lexicon).toBe("plain")
  })
})
