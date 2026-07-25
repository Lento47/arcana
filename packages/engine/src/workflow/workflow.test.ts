import { describe, it, expect, afterEach } from "bun:test"
import { Schema } from "effect"
import { WorkflowStep } from "./schema"
import { saveWorkflow, loadWorkflow, listWorkflows, deleteWorkflow, workflowExists } from "./store"
import { validateStepOutput } from "./validate"

const TEST_NAME = `test-wf-${Date.now()}`

describe("WorkflowStep schema", () => {
  it("decodes step without output_schema", () => {
    const step = { id: "s1", type: "subagent" as const, description: "test" }
    const result = Schema.decodeUnknownSync(WorkflowStep)(step)
    expect(result.output_schema).toBeUndefined()
  })

  it("decodes step with output_schema", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } }
    const result = Schema.decodeUnknownSync(WorkflowStep)({
      id: "s1", type: "subagent" as const, description: "test", output_schema: schema,
    })
    expect(result.output_schema).toEqual(schema)
  })

  it("propagates annotate description to JSON Schema", () => {
    const doc = Schema.toJsonSchemaDocument(WorkflowStep, { additionalProperties: true })
    const props = (doc.schema as any).properties
    expect(props.output_schema.description).toBeDefined()
    expect(props.output_schema.description).toContain("JSON Schema")
  })
})

describe("workflow store", () => {
  afterEach(() => { try { deleteWorkflow(TEST_NAME) } catch {} })

  it("save → exists → load → delete → gone", () => {
    const plan = { title: "test", description: "desc", steps: [] }
    saveWorkflow(TEST_NAME, plan)
    expect(workflowExists(TEST_NAME)).toBe(true)
    expect(loadWorkflow(TEST_NAME).title).toBe("test")
    deleteWorkflow(TEST_NAME)
    expect(workflowExists(TEST_NAME)).toBe(false)
  })

  it("load throws for missing workflow", () => {
    expect(() => loadWorkflow("nonexistent-xyz")).toThrow()
  })

  it("rejects path traversal names", () => {
    expect(() => saveWorkflow("../../../etc/passwd", {} as any)).toThrow("Invalid workflow name")
    expect(() => saveWorkflow("a/b", {} as any)).toThrow("Invalid workflow name")
  })

  it("rejects names with special characters", () => {
    expect(() => saveWorkflow("hello world", {} as any)).toThrow("Invalid workflow name")
    expect(() => saveWorkflow("", {} as any)).toThrow("Invalid workflow name")
  })

  it("list returns sorted, excludes hidden files", () => {
    saveWorkflow("zzz-test", { title: "z", description: "", steps: [] })
    saveWorkflow("aaa-test", { title: "a", description: "", steps: [] })
    const list = listWorkflows()
    expect(list.indexOf("aaa-test")).toBeLessThan(list.indexOf("zzz-test"))
    deleteWorkflow("zzz-test")
    deleteWorkflow("aaa-test")
  })
})

describe("validateStepOutput", () => {
  it("passes through when no output_schema", () => {
    expect(validateStepOutput("hello", undefined, "s1")).toBe("hello")
  })

  it("validates JSON against schema successfully", () => {
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
    expect(validateStepOutput('{"ok":true}', schema, "s1")).toBe('{"ok":true}')
  })

  it("reports schema violation", () => {
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
    const result = validateStepOutput('{"ok":"yes"}', schema, "s1")
    expect(result).toContain("[SCHEMA ERROR]")
    expect(result).toContain("must be boolean")
  })

  it("reports non-JSON output with schema set", () => {
    const result = validateStepOutput("plain text", { type: "object" }, "s1")
    expect(result).toContain("[SCHEMA ERROR]")
    expect(result).toContain("not valid JSON")
  })

  it("warns on invalid schema, doesn't error", () => {
    const result = validateStepOutput("{}", { type: "not-a-real-type" }, "s1")
    expect(result).toContain("[SCHEMA WARNING]")
  })
})
