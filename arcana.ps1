#!/usr/bin/env pwsh
# Arcana launcher — skips the arcana wrapper for TUI mode to avoid double bun JIT.
# Subcommands (run, skills, cron, memory, gateway, completion) still route through
# the arcana wrapper for CLI handling.
param([string[]]$PassedArgs)

$subcommands = @("run", "skills", "cron", "memory", "gateway", "completion", "--version", "-v", "--help", "-h")
$firstArg = if ($PassedArgs.Count -gt 0) { $PassedArgs[0] } else { "" }
$isSubcommand = $subcommands -contains $firstArg

if (-not $isSubcommand) {
    # TUI mode — spawn opencode directly, skipping the arcana wrapper bun JIT.
    # Bridge config is generated lazily by opencode if ARCANA_CONFIG is set.
    $repoRoot = $PSScriptRoot
    $opencodeDir = Join-Path $repoRoot "packages\opencode"
    $arcanaHome = if ($env:ARCANA_HOME) { $env:ARCANA_HOME } else { Join-Path $HOME ".arcana" }
    $configPath = Join-Path $arcanaHome "cache\opencode-config.json"

    # Generate bridge config if stale or missing (quick: 2 stat calls + 1 file read)
    $skillsDir = Join-Path $repoRoot "skills"
    $userSkillsDir = Join-Path $arcanaHome "skills"
    $providersPath = Join-Path $repoRoot "packages\arcana\providers.opencode.json"

    $needsRegen = $true
    if (Test-Path $configPath) {
        $configAge = (Get-Item $configPath).LastWriteTime
        $skillsAge = if (Test-Path $skillsDir) { (Get-Item $skillsDir).LastWriteTime } else { [DateTime]::MinValue }
        $needsRegen = $skillsAge -gt $configAge
    }

    if ($needsRegen) {
        $skillsPaths = @()
        if (Test-Path $skillsDir) { $skillsPaths += $skillsDir }
        if (Test-Path $userSkillsDir) { $skillsPaths += $userSkillsDir }

        $provider = @{}
        if (Test-Path $providersPath) {
            try {
                $raw = Get-Content $providersPath -Raw | ConvertFrom-Json
                if ($raw.provider) { $provider = $raw.provider }
            } catch {}
        }

        $config = @{
            '$schema' = "https://raw.githubusercontent.com/Lento47/arcana/master/schema/config.json"
            skills = @{ paths = $skillsPaths }
        }
        if ($provider.Count -gt 0) { $config.provider = $provider }

        $null = New-Item -ItemType Directory -Force (Split-Path $configPath)
        $config | ConvertTo-Json -Depth 5 | Set-Content $configPath
    }

    $env:ARCANA_CONFIG = $configPath
    $env:PWD = (Get-Location).Path

    bun run --conditions=browser (Join-Path $opencodeDir "src\index.ts") @PassedArgs
    exit $LASTEXITCODE
}

# Subcommand mode — route through arcana wrapper
bun run (Join-Path $PSScriptRoot "packages\arcana\src\index.ts") @PassedArgs
