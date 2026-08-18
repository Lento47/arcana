import { describe, expect, test } from "bun:test"
import { copy, handleSelectionKey, selectionActions } from "../src/util/selection"
import { selectionHintChrome } from "../src/shell/command-spine/spine-chrome"

function rendererFixture(text: string | null) {
  let cleared = 0
  const target = {
    hasSelection: () => Boolean(text),
  }
  const selection = text
    ? { getSelectedText: () => text, selectedRenderables: [target] }
    : null
  return {
    getSelection: () => selection,
    clearSelection: () => {
      cleared += 1
    },
    currentFocusedRenderable: target,
    cleared: () => cleared,
  }
}

describe("selectionActions + copy / Escape", () => {
  test("copy writes selected text and clears", async () => {
    const renderer = rendererFixture("selected spine text")
    let written = ""
    const clipboard = {
      write: async (value: string) => {
        written = value
      },
    }
    const toasts: string[] = []
    const toast = {
      show: (input: { message: string; variant: string }) => {
        toasts.push(input.message)
      },
      error: () => {},
    }

    expect(copy(renderer, toast as never, clipboard as never)).toBe(true)
    await Promise.resolve()
    expect(written).toBe("selected spine text")
    expect(renderer.cleared()).toBe(1)
    expect(toasts.length).toBe(1)
  })

  test("Escape clears; ctrl+c uses shipped action keys", () => {
    const actions = selectionActions()
    expect(actions.copy.key).toBe("c")
    expect(actions.copy.clears).toBe(true)
    expect(actions.clear.key).toBe("escape")
    const hint = selectionHintChrome()
    expect(hint.hint).toContain(`${actions.copy.modifiers[0]}+${actions.copy.key}`)
    expect(hint.hint).toContain(actions.clear.key)

    const renderer = rendererFixture("keep")
    let prevented = 0
    const event = {
      ctrl: false,
      name: actions.clear.key,
      preventDefault: () => {
        prevented += 1
      },
      stopPropagation: () => {},
    }
    handleSelectionKey(renderer, { show: () => {}, error: () => {} } as never, event, {
      write: async () => {},
    } as never)
    expect(renderer.cleared()).toBe(1)
    expect(prevented).toBe(1)
  })
})
