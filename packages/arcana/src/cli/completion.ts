// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { CommandModule } from "yargs"

const SUBCOMMANDS = [
  { name: "run", desc: "start an arcana agent session" },
  { name: "skills", desc: "manage and browse arcana skills" },
  { name: "cron", desc: "manage scheduled jobs" },
  { name: "memory", desc: "search, compile FACTS.md, and sync arcana memory" },
  { name: "gateway", desc: "start the messaging gateway" },
  { name: "config", desc: "manage arcana configuration" },
  { name: "learn", desc: "view and manage learned knowledge" },
  { name: "doctor", desc: "check arcana system health" },
  { name: "history", desc: "browse and resume past sessions" },
  { name: "theme", desc: "list and set arcana themes" },
  { name: "daemon", desc: "manage arcana daemon process" },
  { name: "feedback", desc: "send feedback about arcana, or review past feedback" },
  { name: "web", desc: "start the optional Arcana web app" },
  { name: "completion", desc: "generate shell completion script" },
]

export function bashCompletionScript(): string {
  return `###-begin-arcana-completions-###
#
# yargs command completion script
#
# Installation: arcana completion >> ~/.bashrc
#    or arcana completion >> ~/.bash_profile on OSX.
#
_arcana_yargs_completions()
{
    local cur_word args type_list

    cur_word="\${COMP_WORDS[COMP_CWORD]}"
    args=("\${COMP_WORDS[@]}")

    # ask yargs to generate completions.
    type_list=\$(arcana --get-yargs-completions "\${args[@]}")

    COMPREPLY=( \$(compgen -W "\${type_list}" -- \${cur_word}) )

    # if no match was found, fall back to filename completion
    if [ \${#COMPREPLY[@]} -eq 0 ]; then
      COMPREPLY=()
    fi

    return 0
}
complete -o bashdefault -o default -F _arcana_yargs_completions arcana
###-end-arcana-completions-###`
}

export function zshCompletionScript(): string {
  const commands = SUBCOMMANDS.map((c) => `    '${c.name}:${c.desc}'`).join("\n")

  return `#compdef arcana

_arcana() {
    local -a commands
    commands=(
${commands}
    )
    _arguments -C \
        '(-h --help)'{-h,--help}'[show help]' \
        '(-v --version)'{-v,--version}'[show version]' \
        '--log-level[log level]:log level:(DEBUG INFO WARN ERROR)' \
        '*::cmd:->command' && return 0

    case "$state" in
        command)
            _describe 'command' commands
        ;;
    esac
}

compdef _arcana arcana`
}

export function fishCompletionScript(): string {
  const completions = SUBCOMMANDS.map((c) => `complete -c arcana -f -n '__fish_use_subcommand' -a '${c.name}' -d '${c.desc}'`).join("\n")

  return `${completions}

complete -c arcana -f -l help -d 'show help'
complete -c arcana -f -l version -d 'show version'
complete -c arcana -f -l log-level -d 'log level' -x -a 'DEBUG INFO WARN ERROR'`
}

export function getCompletionScript(shell: string): string | undefined {
  switch (shell) {
    case "bash":
      return bashCompletionScript()
    case "zsh":
      return zshCompletionScript()
    case "fish":
      return fishCompletionScript()
    default:
      return undefined
  }
}

export const CompletionCommand: CommandModule = {
  command: "completion [shell]",
  describe: "generate shell completion script",
  builder: (yargs) =>
    yargs.positional("shell", {
      type: "string",
      describe: "shell type: bash, zsh, fish",
      choices: ["bash", "zsh", "fish"],
      default: "bash",
    }),
  handler: (argv) => {
    const shell = argv.shell as string
    const script = getCompletionScript(shell)
    if (!script) {
      process.stderr.write(`Unsupported shell: ${shell}. Supported: bash, zsh, fish\n`)
      process.exit(1)
    }
    process.stdout.write(script + "\n")
  },
}
