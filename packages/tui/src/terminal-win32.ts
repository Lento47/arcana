import { dlopen, ptr } from "bun:ffi"
import type { ReadStream } from "node:tty"

const STD_INPUT_HANDLE = -10
const STD_OUTPUT_HANDLE = -11
const ENABLE_PROCESSED_INPUT = 0x0001
const UTF8_CODEPAGE = 65001
const VK_MENU = 0x12
const VK_LMENU = 0xa4
const VK_RMENU = 0xa5

const kernel = () =>
  dlopen("kernel32.dll", {
    GetStdHandle: { args: ["i32"], returns: "ptr" },
    GetConsoleMode: { args: ["ptr", "ptr"], returns: "i32" },
    SetConsoleMode: { args: ["ptr", "u32"], returns: "i32" },
    FlushConsoleInputBuffer: { args: ["ptr"], returns: "i32" },
    GetConsoleOutputCP: { args: [], returns: "u32" },
    SetConsoleOutputCP: { args: ["u32"], returns: "i32" },
    GetConsoleCP: { args: [], returns: "u32" },
    SetConsoleCP: { args: ["u32"], returns: "i32" },
  })

const user = () =>
  dlopen("user32.dll", {
    GetAsyncKeyState: { args: ["i32"], returns: "i32" },
  })

let k32: ReturnType<typeof kernel> | undefined
let u32: ReturnType<typeof user> | undefined

function load() {
  if (process.platform !== "win32") return false
  try {
    k32 ??= kernel()
    return true
  } catch {
    return false
  }
}

function loadUser() {
  if (process.platform !== "win32") return false
  try {
    u32 ??= user()
    return true
  } catch {
    return false
  }
}

function keyDown(vk: number): boolean {
  const fn = u32?.symbols.GetAsyncKeyState
  if (typeof fn !== "function") return false
  return (fn(vk) & 0x8000) !== 0
}

/** True while either Alt key is physically down (Windows). Terminals often omit Alt. */
export function win32AltKeyDown(): boolean {  if (process.platform !== "win32") return false
  if (!loadUser()) return false
  try {
    return keyDown(VK_MENU) || keyDown(VK_LMENU) || keyDown(VK_RMENU)
  } catch {
    return false
  }
}

/**
 * Clear ENABLE_PROCESSED_INPUT on the console stdin handle.
 */
export function win32DisableProcessedInput() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)
  if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return

  const mode = buf[0]!
  if ((mode & ENABLE_PROCESSED_INPUT) === 0) return
  k32!.symbols.SetConsoleMode(handle, mode & ~ENABLE_PROCESSED_INPUT)
}

/**
 * Discard any queued console input (mouse events, key presses, etc.).
 */
export function win32FlushInputBuffer() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  k32!.symbols.FlushConsoleInputBuffer(handle)
}

/**
 * Force UTF-8 code pages on the console output/input handles (Windows).
 *
 * Without this, Unicode glyphs used across the TUI (◆ ▸ ⎇ · box rails) are
 * decoded through the legacy OEM code page and render as CJK/mojibake garbage
 * — which users reasonably read as "the app is writing Chinese".
 * Idempotent; leaves the console in UTF-8 after exit (harmless, standard).
 */
export function win32EnableUtf8Console() {
  if (process.platform !== "win32") return
  if (!load()) return
  const k = k32!
  if (k.symbols.GetConsoleOutputCP() === UTF8_CODEPAGE && k.symbols.GetConsoleCP() === UTF8_CODEPAGE) return
  k.symbols.SetConsoleOutputCP(UTF8_CODEPAGE)
  k.symbols.SetConsoleCP(UTF8_CODEPAGE)
}

let unhook: (() => void) | undefined

/**
 * Keep ENABLE_PROCESSED_INPUT disabled.
 *
 * On Windows, Ctrl+C becomes a CTRL_C_EVENT (instead of stdin input) when
 * ENABLE_PROCESSED_INPUT is set. Various runtimes can re-apply console modes
 * (sometimes on a later tick), and the flag is console-global, not per-process.
 *
 * We combine:
 * - A `setRawMode(...)` hook to re-clear after known raw-mode toggles.
 * - A low-frequency poll as a backstop for native/external mode changes.
 */
export function win32InstallCtrlCGuard() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return
  if (unhook) return unhook

  const stdin = process.stdin as ReadStream
  const original = stdin.setRawMode

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)

  if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
  const initial = buf[0]!

  const enforce = () => {
    if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
    const mode = buf[0]!
    if ((mode & ENABLE_PROCESSED_INPUT) === 0) return
    k32!.symbols.SetConsoleMode(handle, mode & ~ENABLE_PROCESSED_INPUT)
  }

  // Some runtimes can re-apply console modes on the next tick; enforce twice.
  const later = () => {
    enforce()
    setImmediate(enforce)
  }

  let wrapped: ReadStream["setRawMode"] | undefined

  if (typeof original === "function") {
    wrapped = (mode: boolean) => {
      const result = original.call(stdin, mode)
      later()
      return result
    }

    stdin.setRawMode = wrapped
  }

  // Ensure it's cleared immediately too (covers any earlier mode changes).
  later()

  const interval = setInterval(enforce, 100)
  interval.unref()

  let done = false
  unhook = () => {
    if (done) return
    done = true

    clearInterval(interval)
    if (wrapped && stdin.setRawMode === wrapped) {
      stdin.setRawMode = original
    }

    k32!.symbols.SetConsoleMode(handle, initial)
    unhook = undefined
  }

  return unhook
}
