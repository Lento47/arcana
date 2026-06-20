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
    $engineDir = Join-Path $repoRoot "packages\engine"
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
            skills = @{ paths = $skillsPaths }
        }
        if ($provider.Count -gt 0) { $config.provider = $provider }

        $null = New-Item -ItemType Directory -Force (Split-Path $configPath)
        $config | ConvertTo-Json -Depth 5 | Set-Content $configPath
    }

    $env:ARCANA_CONFIG = $configPath
    # Preserve the user's real project dir for the app (it reads $env:PWD, not bun's
    # cwd, to resolve the project root — see resolveThreadDirectory in cli/cmd/tui.ts).
    $env:PWD = (Get-Location).Path

    # Auto-load proxy key from license activation
    $proxyKeyFile = Join-Path $arcanaHome "proxy_key"
    if (-not $env:ARCANA_PROXY_KEY -and (Test-Path $proxyKeyFile)) {
      $env:ARCANA_PROXY_KEY = (Get-Content $proxyKeyFile -Raw).Trim()
    }

    # Run bun with cwd=packages/engine so it resolves JSX transpile config from that
    # package's tsconfig ("jsxImportSource": "@opentui/solid") regardless of where the
    # user launched arcana from. Without this, bun walks up from an unrelated CWD, finds
    # a tsconfig lacking jsxImportSource, defaults to react, and crashes on the missing
    # 'react/jsx-dev-runtime'. $env:PWD above keeps the app pointed at the user's dir.
    bun run --cwd $engineDir --conditions=browser (Join-Path $engineDir "src\index.ts") @PassedArgs
    exit $LASTEXITCODE
}

# Subcommand mode — route through arcana wrapper
bun run (Join-Path $PSScriptRoot "packages\arcana\src\index.ts") @PassedArgs
