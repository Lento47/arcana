// packages/engine/src/workflow/expression.ts
//
// Safe condition-expression evaluator for workflow steps. Model-supplied
// expressions are parsed with a strict recursive-descent parser over a small
// grammar — no Function/eval, no dynamic import, no host globals. Anything
// outside the grammar is a parse error and the condition fails closed (false).
//
// Grammar:
//   or      := and ( "||" and )*
//   and     := cmp ( "&&" cmp )*
//   cmp     := add ( ("==" | "!=" | "<" | ">" | "<=" | ">=") add )?
//   add     := mul ( ("+" | "-") mul )*
//   mul     := unary ( ("*" | "/" | "%") unary )*
//   unary   := ("!" | "-") unary | postfix
//   postfix := primary ( "." (method | "length") ( "(" args ")" )? )*
//   primary := number | 'string' | "string" | true | false | identifier | "(" or ")"
//
// Values are string | number | boolean. Identifiers resolve to prior step
// outputs; an unknown identifier is an error. Method allowlist: includes,
// startsWith, endsWith (plus `.length`). Comparison of mixed string/number
// uses raw-value equality; ordering compares numerically unless both are
// strings (lexicographic).

type Value = string | number | boolean

const MAX_EXPR_LENGTH = 512
const MAX_ARGS = 8

interface Token {
  kind: "num" | "str" | "id" | "op"
  value: string
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++
      continue
    }
    if (/[0-9]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9._]/.test(src[j]!)) j++
      tokens.push({ kind: "num", value: src.slice(i, j).replace(/_/g, "") })
      i = j
      continue
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1)
      if (end === -1) throw new Error("unterminated string")
      // No escapes — step outputs are referenced by bare identifier, so a
      // literal only ever needs plain characters.
      tokens.push({ kind: "str", value: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]!)) j++
      tokens.push({ kind: "id", value: src.slice(i, j) })
      i = j
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === "&&" || two === "||" || two === "==" || two === "!=" || two === "<=" || two === ">=") {
      tokens.push({ kind: "op", value: two })
      i += 2
      continue
    }
    if ("!<>+-*/%().,".includes(c)) {
      tokens.push({ kind: "op", value: c })
      i++
      continue
    }
    throw new Error(`unexpected character ${JSON.stringify(c)}`)
  }
  return tokens
}

const METHODS: ReadonlySet<string> = new Set(["includes", "startsWith", "endsWith"])

class Parser {
  private pos = 0
  constructor(
    private readonly tokens: Token[],
    private readonly outputs: Record<string, string>,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token {
    const t = this.tokens[this.pos++]
    if (!t) throw new Error("unexpected end of expression")
    return t
  }

  private expectOp(value: string): void {
    const t = this.next()
    if (t.kind !== "op" || t.value !== value) throw new Error(`expected ${value}`)
  }

  private atOp(...values: string[]): boolean {
    const t = this.peek()
    return t?.kind === "op" && values.includes(t.value)
  }

  parse(): Value {
    const v = this.parseOr()
    if (this.pos !== this.tokens.length) throw new Error("unexpected trailing tokens")
    return v
  }

  private parseOr(): Value {
    let left = this.parseAnd()
    while (this.atOp("||")) {
      this.next()
      const right = this.parseAnd()
      left = truthy(left) ? true : Boolean(truthy(right))
    }
    return left
  }

  private parseAnd(): Value {
    let left = this.parseCmp()
    while (this.atOp("&&")) {
      this.next()
      const right = this.parseCmp()
      left = truthy(left) && truthy(right)
    }
    return left
  }

  private parseCmp(): Value {
    const left = this.parseAdd()
    if (this.atOp("==", "!=", "<", ">", "<=", ">=")) {
      const op = this.next().value
      const right = this.parseAdd()
      switch (op) {
        case "==":
          return left === right
        case "!=":
          return left !== right
        case "<":
        case ">":
        case "<=":
        case ">=": {
          if (typeof left === "string" && typeof right === "string") {
            if (op === "<") return left < right
            if (op === ">") return left > right
            if (op === "<=") return left <= right
            return left >= right
          }
          const a = Number(left)
          const b = Number(right)
          if (Number.isNaN(a) || Number.isNaN(b)) throw new Error("ordering requires comparable values")
          if (op === "<") return a < b
          if (op === ">") return a > b
          if (op === "<=") return a <= b
          return a >= b
        }
      }
    }
    return left
  }

  private parseAdd(): Value {
    let left = this.parseMul()
    while (this.atOp("+", "-")) {
      const op = this.next().value
      const right = this.parseMul()
      if (op === "+" && typeof left === "string" && typeof right === "string") {
        left = left + right
      } else {
        left = applyArithmetic(op, left, right)
      }
    }
    return left
  }

  private parseMul(): Value {
    let left = this.parseUnary()
    while (this.atOp("*", "/", "%")) {
      const op = this.next().value
      left = applyArithmetic(op, left, this.parseUnary())
    }
    return left
  }

  private parseUnary(): Value {
    if (this.atOp("!")) {
      this.next()
      return !truthy(this.parseUnary())
    }
    if (this.atOp("-")) {
      this.next()
      return -Number(this.parseUnary())
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Value {
    let value = this.parsePrimary()
    while (this.atOp(".")) {
      this.next()
      const member = this.next()
      if (member.kind !== "id") throw new Error("expected member name")
      if (member.value === "length") {
        if (typeof value !== "string") throw new Error(".length requires a string")
        value = value.length
        continue
      }
      if (!METHODS.has(member.value)) throw new Error(`member not allowed: ${member.value}`)
      this.expectOp("(")
      const args = [this.parseOr()]
      while (this.atOp(",")) {
        this.next()
        if (args.length >= MAX_ARGS) throw new Error("too many arguments")
        args.push(this.parseOr())
      }
      this.expectOp(")")
      if (typeof value !== "string") throw new Error(`${member.value} requires a string receiver`)
      const arg = args[0]!
      if (typeof arg !== "string") throw new Error(`${member.value} requires a string argument`)
      if (member.value === "includes") value = value.includes(arg)
      else if (member.value === "startsWith") value = value.startsWith(arg)
      else value = value.endsWith(arg)
    }
    return value
  }

  private parsePrimary(): Value {
    const t = this.next()
    if (t.kind === "num") {
      const n = Number(t.value)
      if (Number.isNaN(n)) throw new Error(`invalid number ${t.value}`)
      return n
    }
    if (t.kind === "str") return t.value
    if (t.kind === "id") {
      if (t.value === "true") return true
      if (t.value === "false") return false
      if (!(t.value in this.outputs)) throw new Error(`unknown identifier: ${t.value}`)
      return this.outputs[t.value]!
    }
    if (t.kind === "op" && t.value === "(") {
      const v = this.parseOr()
      this.expectOp(")")
      return v
    }
    throw new Error(`unexpected token ${JSON.stringify(t.value)}`)
  }
}

function truthy(v: Value): boolean {
  if (typeof v === "string") return v.length > 0
  return Boolean(v)
}

function applyArithmetic(op: string, a: Value, b: Value): number {
  const x = Number(a)
  const y = Number(b)
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error("arithmetic requires numbers")
  switch (op) {
    case "+":
      return x + y
    case "-":
      return x - y
    case "*":
      return x * y
    case "/":
      return x / y
    default:
      return x % y
  }
}

/**
 * Evaluate a model-supplied condition over prior step outputs. Any syntax or
 * evaluation error fails closed to false. Inputs are size-bounded; evaluation
 * is synchronous, effect-free, and terminates.
 */
export function evalCondition(expr: string | undefined, outputs: Record<string, string>): boolean {
  if (!expr || expr.length > MAX_EXPR_LENGTH) return false
  try {
    return Boolean(new Parser(tokenize(expr), outputs).parse())
  } catch {
    return false
  }
}

export * as Expression from "./expression"
