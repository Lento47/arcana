# Skills

Skills give the agent domain-specific expertise. Each skill is a `SKILL.md` file that teaches the agent how to perform a specific task — from writing Python tests to deploying to Kubernetes to generating memes.

```sh
arcana skills list
```

## Quick start

```sh
# List all available skills
arcana skills list

# Search for a skill by name or description
arcana skills list --query "python testing"

# Get detailed info on a skill
arcana skills info --skill "python-testing"

# Activate a skill in a session (in the TUI)
/skills
```

## Commands

| Command | Description |
|---|---|
| `arcana skills list` | List all skills grouped by category |
| `arcana skills list --query <q>` | Search skills by name or description |
| `arcana skills info --skill <id>` | Show full skill details and body |
| `arcana skills ranked` | Show skills ranked by recent usage |

### Options

| Flag | Description |
|---|---|
| `--query`, `-q` | Filter skills by name or description |
| `--skill`, `-s` | Skill ID or name (for `info`) |
| `--category`, `-c` | Filter by category (for `list`) |

## Categories

Skills are organized into categories based on their folder structure:

```
skills/
  software-development/
    python-testing/
      SKILL.md
    code-review/
      SKILL.md
  devops/
    docker/
      SKILL.md
  security/
    web-pentest/
      SKILL.md
```

The category name is derived from the first subdirectory under the skill folder. Current categories include software-development, devops, security, data-science, blockchain, web-development, creative, productivity, and more — but new categories can be added by simply creating a new folder.

## Using skills

### In a session

When you start a session, the agent automatically loads relevant skills based on your prompt. You can also explicitly activate a skill:

```sh
# In the TUI, type:
/skills

# Or use a slash command:
/skill python-testing
```

### With cron jobs

```sh
arcana cron add \
  --name "daily review" \
  --schedule "0 9 * * *" \
  --prompt "review today's commits" \
  --skill "git"
```

### Skill usage tracking

The memory system tracks which skills you use most often:

```sh
arcana skills ranked

# Output
12 ranked skills (by recent usage):

  python-testing               8 recent  Write and run Python tests
  code-review                  5 recent  Review code for bugs and style
  docker                       3 recent  Build and deploy Docker containers
```

## Custom skills

### Creating a skill

Skills live in `skills/` (in-repo) or `~/.arcana/skills/` (user-local). Each skill is a folder containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: My Custom Skill
description: Does something specific for my project
---

# My Custom Skill

## Purpose

This skill helps with [specific task].

## Instructions

1. Step one
2. Step two
3. Step three

## Rules

- Always do X before Y
- Never do Z
```

### Skill folder structure

```
~/.arcana/skills/
  my-skill/
    SKILL.md           # Required — skill definition
    references/        # Optional — additional docs loaded by the agent
      guide.md
      examples.md
    scripts/           # Optional — helper scripts
      setup.sh
```

### Frontmatter fields

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Human-readable skill name (used to generate the skill ID) |
| `description` | No | Brief description shown in skill lists |

The skill ID is generated automatically from the name: lowercase, special characters replaced with hyphens (e.g., "Python Testing" becomes `python-testing`). The category is derived from the parent folder.

### Loading custom skills

Arcana automatically discovers skills from:

1. **In-repo:** `skills/` directory in the project root
2. **User-local:** `~/.arcana/skills/` directory
3. **Environment override:** `ARCANA_SKILLS_DIRS` env var (separated by `;`)

```sh
# Override skill directories
export ARCANA_SKILLS_DIRS="/path/to/skills;/another/path"
```

### Skill caching

Skills are cached in `~/.cache/arcana/skills-cache.json` for fast startup. The cache rebuilds automatically when skill directories change.

## How skills work

- When you start a session, the agent loads all available skills into its system prompt.
- The agent selects relevant skills based on your prompt content.
- Skills can include instructions, rules, examples, and references.
- Skills integrate with the memory system — the agent learns which skills are most useful over time.
- Skills are safe by default — they cannot execute destructive commands unless explicitly allowed.
