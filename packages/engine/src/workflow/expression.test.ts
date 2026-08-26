// packages/engine/src/workflow/expression.test.ts
//
// Safe condition evaluator — grammar conformance plus adversarial escapes.
// Every adversarial case must fail closed (false) with NO observable side
// effect: the evaluator never compiles or executes model-supplied code.

import { describe, expect, it } from "bun:test"
import { evalCondition } from "./expression"

const outputs = {
  a: "hello world",
  b: "42",
  c: "",
  n: "7",
}

describe("workflow condition expressions — positive", () => {
  it("compares strings and numbers", () => {
    expect(evalCondition('a == "hello world"', outputs)).toBe(true)
    expect(evalCondition("a != c", outputs)).toBe(true)
    expect(evalCondition("n > 5", outputs)).toBe(true)
    expect(evalCondition("n <= 7", outputs)).toBe(true)
    expect(evalCondition('b < "9"', outputs)).toBe(true) // both strings → lexicographic
  })

  it("combines with logic operators and respects precedence", () => {
    expect(evalCondition("n > 5 && a.includes(\"world\")", outputs)).toBe(true)
    expect(evalCondition("n > 100 || !c", outputs)).toBe(true)
    // && binds tighter than ||
    expect(evalCondition("c || n > 1 && a.startsWith(\"hell\")", outputs)).toBe(true)
    expect(evalCondition("(c || n > 1) && false", outputs)).toBe(false)
  })

  it("supports the string method allowlist and .length", () => {
    expect(evalCondition('a.includes("lo wo")', outputs)).toBe(true)
    expect(evalCondition('a.startsWith("hello")', outputs)).toBe(true)
    expect(evalCondition('a.endsWith("rld")', outputs)).toBe(true)
    expect(evalCondition("a.length > 5", outputs)).toBe(true)
    expect(evalCondition("c.length == 0", outputs)).toBe(true)
  })

  it("does arithmetic with numeric coercion", () => {
    expect(evalCondition("n * 6 == 42", outputs)).toBe(true)
    expect(evalCondition("n - 7 == 0", outputs)).toBe(true)
  })

  it("empty or missing expression fails closed", () => {
    expect(evalCondition(undefined, outputs)).toBe(false)
    expect(evalCondition("", outputs)).toBe(false)
  })
})

describe("workflow condition expressions — adversarial (all fail closed)", () => {
  const cases: Array<[string, string]> = [
    ["iife statements", '(()=>{ require("node:fs") })()'],
    ["dynamic import", '(async()=>{ await import("node:child_process") })() || true'],
    ["process global", "process.env.HOME"],
    ["globalThis reach", "globalThis.process.exit(0)"],
    ["constructor escape", 'this.constructor.constructor("return 1")()'],
    ["prototype pollution", "a.constructor.prototype"],
    ["assignment injection", "a = require('fs')"],
    ["function constructor", "Function('return 1')()"],
    ["import call", 'import("node:fs").then(x => x)'],
    ["template literal", "`${require('fs')}`"],
    ["statement sequence", 'a; require("fs")'],
    ["object literal access", '({}).constructor'],
    ["arrow expression", "x => x"],
    ["unknown identifier", "totally_unknown_step"],
    ["member on unknown id", "unknown.length"],
    ["disallowed method", 'a.replace("l", "L")'],
    ["bracket access", "outputs['a']"],
    ["regex literal", "/.*/.test(a)"],
  ]

  for (const [name, expr] of cases) {
    it(`rejects: ${name}`, () => {
      expect(evalCondition(expr, outputs)).toBe(false)
    })
  }

  it("never throws on pathological input", () => {
    expect(evalCondition("(".repeat(300), outputs)).toBe(false)
    expect(evalCondition("'" + "x".repeat(1000), outputs)).toBe(false)
    expect(evalCondition("a.".repeat(200) + "length", outputs)).toBe(false)
  })
})
