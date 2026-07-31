# Cron (scheduled jobs)

Arcana can run agent tasks on a schedule. Each job sends a prompt to the agent at the configured interval, with optional skill activation and timezone support.

```sh
arcana cron list
```

## Quick start

```sh
# Every 4 hours: run code review
arcana cron add --name "review PRs" --schedule "0 */4 * * *" --prompt "review open PRs for bugs"

# Daily summary at 9 AM
arcana cron add --name "daily digest" --schedule "0 9 * * *" --prompt "summarize today's changes"

# Run the daemon (blocks, evaluates jobs every 60s)
arcana cron start
```

## Commands

| Command | Description |
|---|---|
| `arcana cron add` | Create a new scheduled job |
| `arcana cron list` | List all jobs with status and last run |
| `arcana cron remove --id <id>` | Delete a job |
| `arcana cron pause --id <id>` | Disable a job without deleting it |
| `arcana cron resume --id <id>` | Re-enable a paused job |
| `arcana cron run --id <id>` | Run a job immediately (manual trigger) |
| `arcana cron start` | Start the scheduler daemon |

## Adding a job

```sh
arcana cron add \
  --name "daily review" \
  --schedule "0 9 * * *" \
  --prompt "review today's git commits and summarize changes" \
  --skill "git" \
  --tz "America/New_York"
```

### Options

| Flag | Required | Description |
|---|---|---|
| `--schedule`, `-s` | Yes | Cron expression or alias (see below) |
| `--prompt`, `-p` | Yes | The prompt sent to the agent |
| `--name`, `-n` | No | Human-readable job name |
| `--skill` | No | Activate a specific skill for this job |
| `--timezone`, `--tz` | No | Timezone for the schedule (default: `UTC`) |

## Schedule syntax

Standard 5-field cron expressions are supported:

```
┌───────────── minute (0–59)
│ ┌───────────── hour (0–23)
│ │ ┌───────────── day of month (1–31)
│ │ │ ┌───────────── month (1–12)
│ │ │ │ ┌───────────── day of week (0–7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

### Examples

| Schedule | Meaning |
|---|---|
| `0 9 * * *` | Every day at 9:00 AM |
| `0 */4 * * *` | Every 4 hours |
| `30 8 * * 1-5` | Weekdays at 8:30 AM |
| `0 0 1 * *` | First of every month |
| `*/15 * * * *` | Every 15 minutes |

### Aliases

| Alias | Expands to |
|---|---|
| `@hourly` | `0 * * * *` |
| `@daily` | `0 0 * * *` |
| `@weekly` | `0 0 * * 0` |
| `@monthly` | `0 0 1 * *` |
| `@yearly` | `0 0 1 1 *` |

## Listing jobs

```sh
arcana cron list
```

Output:

```
ID         NAME/PROMPT                       SCHEDULE          STATUS   RUNS   LAST RUN
────────────────────────────────────────────────────────────────────────────────────────
a1b2c3d4…  daily review                      0 9 * * *         enabled  12     2026-07-20 09:00
e5f6g7h8…  review PRs                        0 */4 * * *       paused   48     2026-07-20 08:00
```

## Running a job manually

```sh
arcana cron run --id a1b2c3d4
```

This runs the job immediately and prints the agent's output.

## Starting the daemon

```sh
arcana cron start
```

The scheduler evaluates all enabled jobs every 60 seconds (configurable). Press `Ctrl+C` to stop.

```sh
# Output
Cron scheduler running (interval: 60s). Ctrl+C to stop.
[2026-07-20T09:00:00.000Z] Running job: daily review
[output] Today's changes include 3 commits to packages/engine...
```

## Configuration

Cron settings live in `~/.arcana/config.json`:

```json
{
  "cron": {
    "enabled": true,
    "intervalSeconds": 60
  }
}
```

| Key | Default | Description |
|---|---|---|
| `cron.enabled` | `true` | Enable or disable the cron system |
| `cron.intervalSeconds` | `60` | How often the scheduler checks for due jobs |

## How it works

- Jobs are stored in `~/.arcana/data/cron-jobs.json`.
- Each job gets its own agent session with conversation history and memory integration.
- Destructive shell commands are blocked by default (safe mode) unless the job prompt explicitly requires them.
- Jobs integrate with the memory system — the agent can read and write facts across runs.
- If a job specifies a `--skill`, that skill's instructions are injected into the agent's system prompt.

## License requirement

Cron jobs require a valid API key (`ARCANA_API_KEY` or provider-specific keys). The agent runs unattended with your configured provider and model.
