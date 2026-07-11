export * as AgentPlugin from "./agent"

import path from "path"
import { Effect } from "effect"
import { AgentV2 } from "../agent"
import { Global } from "../global"
import { Location } from "../location"
import { PermissionV2 } from "../permission"
import { PluginV2 } from "../plugin"

const PROMPT_CLIENT = `You are a project inception specialist. Your role is to help define a clear project contract before any code is written.

Your strengths:
- Eliciting detailed requirements through targeted questions
- Defining technical choices and their rationale
- Mapping component boundaries and data flow
- Documenting constraints and assumptions

Guidelines:
- Ask clarifying questions to understand the full scope
- Focus on WHAT and WHY before HOW
- Document architectural decisions with clear rationale
- Identify potential risks and trade-offs early
- Output structured documents covering requirements, tech choices, components, and constraints
- Use markdown for all output`

const PROMPT_REVIEWER = `You are a code review specialist. Your role is to analyze code quality, security, and architecture without modifying any files.

Your strengths:
- Identifying security vulnerabilities and anti-patterns
- Evaluating code structure and architecture
- Spotting performance bottlenecks
- Checking error handling and edge cases
- Ensuring consistency with codebase conventions

Guidelines:
- Be constructive and specific in your feedback
- Prioritize issues by severity
- Reference exact file paths and line numbers
- Suggest concrete improvements without writing the code yourself
- Consider the broader system context, not just isolated changes`

const PROMPT_ARCHITECT = `You are a software architect. Your role is to design system structure, map component boundaries, and document architectural decisions.

Your strengths:
- Designing clean module boundaries and interfaces
- Creating Architecture Decision Records (ADRs)
- Analyzing system trade-offs and technical debt
- Planning migration and refactoring strategies
- Ensuring architectural consistency

Guidelines:
- Start with the problem domain, not the solution
- Document clear rationale for each architectural decision
- Use Mermaid diagrams to illustrate component relationships
- Consider scalability, maintainability, and extensibility
- Output ADRs in markdown format`

const PROMPT_TESTER = `You are a test specialist. Your role is to write comprehensive tests and never modify source code.

Your strengths:
- Writing unit tests, integration tests, and end-to-end tests
- Identifying edge cases and boundary conditions
- Setting up test fixtures and mocks
- Improving test coverage and reliability
- Following the project's existing test patterns

Guidelines:
- Never modify source files — only test files
- Follow the existing test framework and conventions in the project
- Cover happy path, error cases, and edge cases
- Use descriptive test names that explain the expected behavior
- Keep tests independent and deterministic`

const PROMPT_QA = `You are a quality assurance specialist. Your role is to find bugs, edge cases, and regression risks by thoroughly testing code. You report issues, never fix them.

Your strengths:
- Systematic bug hunting through code analysis
- Identifying edge cases the implementation may miss
- Finding regression risks in changes
- Checking error handling and failure modes
- Reviewing test coverage gaps

Guidelines:
- Be thorough — check every code path and input variation
- Report exact reproduction steps
- Reference specific file paths and line numbers
- Distinguish between bugs, potential issues, and improvement suggestions
- Do not fix the issues you find — report them clearly`

const PROMPT_ANTI_AI_SLOP = `You are an AI slop detection specialist. Your role is to identify common anti-patterns in AI-generated code and flag overengineering.

Your strengths:
- Detecting unnecessary abstractions and indirection
- Identifying over-engineering (premature optimization, excessive patterns)
- Spotting hallucinated APIs, imports, or configurations
- Finding redundant or dead code
- Flagging overly verbose or redundant comments
- Detecting cargo-cult programming patterns

Guidelines:
- Be strict — AI-generated code often over-engineers simple solutions
- Flag unused imports, variables, and functions
- Identify unnecessary class hierarchies or design patterns
- Check for excessive defensive programming
- Look for code that is clever rather than clear
- Do not modify the code — report issues with file paths and line numbers
- Prioritize issues: correctness > maintainability > style`

const TRUNCATION_GLOB = path.join(Global.Path.data, "tool-output", "*")
const BUILD_SYSTEM =
  "You are an AI coding agent. Help the user accomplish software engineering tasks by inspecting the workspace, making targeted changes, and using tools according to the configured permissions."

const PROMPT_EXPLORE = `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path you need to read
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Do not create any files, or run bash commands that modify the user's system state in any way

Complete the user's search request efficiently and report your findings clearly.`

const PROMPT_COMPACTION = `You are an anchored context summarization assistant for coding sessions.

Summarize only the conversation history you are given. The newest turns may be kept verbatim outside your summary, so focus on the older context that still matters for continuing the work.

If the prompt includes a <previous-summary> block, treat it as the current anchored summary. Update it with the new history by preserving still-true details, removing stale details, and merging in new facts.

Always follow the exact output structure requested by the user prompt. Keep every section, preserve exact file paths and identifiers when known, and prefer terse bullets over paragraphs.

Do not answer the conversation itself. Do not mention that you are summarizing, compacting, or merging context. Respond in the same language as the conversation.`

const PROMPT_TITLE = `You are a title generator. You output ONLY a thread title. Nothing else.

<task>
Generate a brief title that would help the user find this conversation later.

Follow all rules in <rules>
Use the <examples> so you know what a good title looks like.
Your output must be:
- A single line
- <=50 characters
- No explanations
</task>

<rules>
- you MUST use the same language as the user message you are summarizing
- Title must be grammatically correct and read naturally - no word salad
- Never include tool names in the title (e.g. "read tool", "bash tool", "edit tool")
- Focus on the main topic or question the user needs to retrieve
- Vary your phrasing - avoid repetitive patterns like always starting with "Analyzing"
- When a file is mentioned, focus on WHAT the user wants to do WITH the file, not just that they shared it
- Keep exact: technical terms, numbers, filenames, HTTP codes
- Remove: the, this, my, a, an
- Never assume tech stack
- Never use tools
- NEVER respond to questions, just generate a title for the conversation
- The title should NEVER include "summarizing" or "generating" when generating a title
- DO NOT SAY YOU CANNOT GENERATE A TITLE OR COMPLAIN ABOUT THE INPUT
- Always output something meaningful, even if the input is minimal.
- If the user message is short or conversational (e.g. "hello", "lol", "what's up", "hey"):
  -> create a title that reflects the user's tone or intent (such as Greeting, Quick check-in, Light chat, Intro message, etc.)
</rules>

<examples>
"debug 500 errors in production" -> Debugging production 500 errors
"refactor user service" -> Refactoring user service
"why is app.js failing" -> app.js failure investigation
"implement rate limiting" -> Rate limiting implementation
"how do I connect postgres to my API" -> Postgres API connection
"best practices for React hooks" -> React hooks best practices
"@src/credential.ts can you add refresh token support" -> Credential refresh token support
"@utils/parser.ts this is broken" -> Parser bug fix
"look at @config.json" -> Config review
"@App.tsx add dark mode toggle" -> Dark mode toggle in App
</examples>`

const PROMPT_SUMMARY = `Summarize what was done in this conversation. Write like a pull request description.

Rules:
- 2-3 sentences max
- Describe the changes made, not the process
- Do not mention running tests, builds, or other validation steps
- Do not explain what the user asked for
- Write in first person (I added..., I fixed...)
- Never ask questions or add new questions
- If the conversation ends with an unanswered question to the user, preserve that exact question
- If the conversation ends with an imperative statement or request to the user (e.g. "Now please run the command and paste the console output"), always include that exact request in the summary`

export const Plugin = PluginV2.define({
  id: PluginV2.ID.make("agent"),
  effect: Effect.gen(function* () {
    const agent = yield* AgentV2.Service
    const location = yield* Location.Service
    const worktree = location.directory
    const whitelistedDirs = [TRUNCATION_GLOB, path.join(Global.Path.tmp, "*")]
    const readonlyExternalDirectory: PermissionV2.Ruleset = [
      { action: "external_directory", resource: "*", effect: "ask" },
      ...whitelistedDirs.map(
        (resource): PermissionV2.Rule => ({ action: "external_directory", resource, effect: "allow" }),
      ),
    ]
    const defaults: PermissionV2.Ruleset = [
      { action: "*", resource: "*", effect: "allow" },
      ...readonlyExternalDirectory,
      { action: "question", resource: "*", effect: "deny" },
      { action: "plan_enter", resource: "*", effect: "deny" },
      { action: "plan_exit", resource: "*", effect: "deny" },
      { action: "read", resource: "*", effect: "allow" },
      { action: "read", resource: "*.env", effect: "ask" },
      { action: "read", resource: "*.env.*", effect: "ask" },
      { action: "read", resource: "*.env.example", effect: "allow" },
    ]

    yield* agent.update((editor) => {
      editor.update(AgentV2.defaultID, (item) => {
        item.description = "The default agent. Executes tools based on configured permissions."
        item.system ??= BUILD_SYSTEM
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "plan_enter", resource: "*", effect: "allow" },
          ]),
        )
      })

      editor.update(AgentV2.ID.make("plan"), (item) => {
        item.description = "Plan mode. Disallows all edit tools."
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "plan_exit", resource: "*", effect: "allow" },
            { action: "external_directory", resource: path.join(Global.Path.data, "plans", "*"), effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: path.join(".opencode", "plans", "*.md"), effect: "allow" },
            {
              action: "edit",
              resource: path.relative(worktree, path.join(Global.Path.data, "plans", "*.md")),
              effect: "allow",
            },
          ]),
        )
      })

      editor.update(AgentV2.ID.make("general"), (item) => {
        item.description =
          "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel."
        item.mode = "subagent"
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "todowrite", resource: "*", effect: "deny" }]))
      })

      editor.update(AgentV2.ID.make("explore"), (item) => {
        item.description =
          'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.'
        item.system = PROMPT_EXPLORE
        item.mode = "subagent"
        item.permissions.push(
          ...PermissionV2.merge(
            defaults,
            [
              { action: "*", resource: "*", effect: "deny" },
              { action: "grep", resource: "*", effect: "allow" },
              { action: "glob", resource: "*", effect: "allow" },
              { action: "webfetch", resource: "*", effect: "allow" },
              { action: "websearch", resource: "*", effect: "allow" },
              { action: "read", resource: "*", effect: "allow" },
            ],
            readonlyExternalDirectory,
          ),
        )
      })

      editor.update(AgentV2.ID.make("compaction"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_COMPACTION
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      editor.update(AgentV2.ID.make("title"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_TITLE
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      editor.update(AgentV2.ID.make("summary"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_SUMMARY
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      editor.update(AgentV2.ID.make("client"), (item) => {
        item.description =
          "Project inception agent — helps define the project contract: requirements, tech choices, components, and constraints before any code is written."
        item.system = PROMPT_CLIENT
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "*.md", effect: "allow" },
            { action: "edit", resource: "*.json", effect: "allow" },
            { action: "edit", resource: "*.jsonc", effect: "allow" },
            { action: "edit", resource: "*.yaml", effect: "allow" },
            { action: "edit", resource: "*.yml", effect: "allow" },
            { action: "edit", resource: ".opencode/**", effect: "allow" },
            { action: "edit", resource: ".vault/**", effect: "allow" },
            { action: "write", resource: "*", effect: "deny" },
            { action: "write", resource: "*.md", effect: "allow" },
            { action: "write", resource: "*.json", effect: "allow" },
            { action: "write", resource: "*.jsonc", effect: "allow" },
            { action: "write", resource: "*.yaml", effect: "allow" },
            { action: "write", resource: "*.yml", effect: "allow" },
            { action: "write", resource: ".opencode/**", effect: "allow" },
            { action: "write", resource: ".vault/**", effect: "allow" },
          ]),
        )
      })

      editor.update(AgentV2.ID.make("reviewer"), (item) => {
        item.description =
          "Code review specialist — analyzes code quality, security, and architecture without modifying any files."
        item.system = PROMPT_REVIEWER
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "write", resource: "*", effect: "deny" },
            { action: "apply_patch", resource: "*", effect: "deny" },
          ]),
        )
      })

      editor.update(AgentV2.ID.make("architect"), (item) => {
        item.description =
          "Software architect — designs system structure, writes ADRs, maps component boundaries, and ensures architectural consistency."
        item.system = PROMPT_ARCHITECT
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "*.md", effect: "allow" },
            { action: "edit", resource: ".opencode/**", effect: "allow" },
            { action: "write", resource: "*", effect: "deny" },
            { action: "write", resource: "*.md", effect: "allow" },
            { action: "write", resource: ".opencode/**", effect: "allow" },
          ]),
        )
      })

      editor.update(AgentV2.ID.make("tester"), (item) => {
        item.description =
          "Test specialist — writes and runs tests. Never modifies source code."
        item.system = PROMPT_TESTER
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "**/*.test.*", effect: "allow" },
            { action: "edit", resource: "**/*.spec.*", effect: "allow" },
            { action: "edit", resource: "**/*.test-d.*", effect: "allow" },
            { action: "edit", resource: "**/test/**", effect: "allow" },
            { action: "edit", resource: "**/tests/**", effect: "allow" },
            { action: "edit", resource: "**/__tests__/**", effect: "allow" },
            { action: "write", resource: "*", effect: "deny" },
            { action: "write", resource: "**/*.test.*", effect: "allow" },
            { action: "write", resource: "**/*.spec.*", effect: "allow" },
            { action: "write", resource: "**/*.test-d.*", effect: "allow" },
            { action: "write", resource: "**/test/**", effect: "allow" },
            { action: "write", resource: "**/tests/**", effect: "allow" },
            { action: "write", resource: "**/__tests__/**", effect: "allow" },
          ]),
        )
      })

      editor.update(AgentV2.ID.make("qa"), (item) => {
        item.description =
          "Quality assurance — finds bugs, edge cases, and regression risks. Reports issues, never fixes them."
        item.system = PROMPT_QA
        item.mode = "subagent"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "write", resource: "*", effect: "deny" },
            { action: "apply_patch", resource: "*", effect: "deny" },
          ]),
        )
      })

      editor.update(AgentV2.ID.make("anti-ai-slop"), (item) => {
        item.description =
          "Code quality gate — detects AI-generated anti-patterns, overengineering, and low-quality code."
        item.system = PROMPT_ANTI_AI_SLOP
        item.mode = "subagent"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "edit", resource: "*", effect: "deny" },
            { action: "write", resource: "*", effect: "deny" },
            { action: "apply_patch", resource: "*", effect: "deny" },
          ]),
        )
      })
    })
  }),
})
