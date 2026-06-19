#!/usr/bin/env pwsh
<#
  arcana CLI startup performance — deep-dive benchmark
  Scenarios:
    1. Cold start    — clean bun cache each round, measure --help wall clock
    2. Warm start    — cached bun JIT, same --help command
    3. Module load   — dynamic import only, no yargs execution
    4. TUI ready     — ARCANA_SHOW_TTFD=1, poll stderr for TTFD signal, kill
  Usage: pwsh benchmarks/bench-startup.ps1 [-Rounds 5] [-WarmupRounds 1]
#>
param(
  [int]$Rounds = 5,
  [int]$WarmupRounds = 1
)
$ErrorActionPreference = "Continue"

# ── Paths ─────────────────────────────────────────────────────────────────
$bun = (Get-Command bun -ErrorAction Stop).Source
$repo = $PSScriptRoot | Split-Path -Parent
$engineEntry = Join-Path $repo "packages\engine\src\index.ts"
$engineEntryFwd = $engineEntry.Replace('\', '/')

$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$outDir = Join-Path $repo "benchmarks\results\$ts"
$null = New-Item -ItemType Directory -Force $outDir

$TD = [Diagnostics.Stopwatch]::StartNew()
$results = @{
  meta = @{
    timestamp    = $ts
    rounds       = $Rounds
    warmupRounds = $WarmupRounds
    bun          = $bun
    repo         = $repo
    entry        = $engineEntry
  }
  scenarios = @{}
}

Write-Host @"

╔══════════════════════════════════════════════════════════╗
║           ARCANA STARTUP BENCHMARK                     ║
║           $Rounds rounds, $WarmupRounds warmup                    ║
╚══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# ── Helpers ───────────────────────────────────────────────────────────────
function Format-Ms {
  param($Value)
  if ($null -eq $Value) { return "  N/A  " }
  if ($Value -ge 1000) { return "$([math]::Round($Value/1000,2))s" }
  return "$([math]::Round($Value,0))ms"
}

function Compute-Stats {
  param([object[]]$Raw)
  $valid = $Raw | Where-Object { $_ -ne $null }
  if ($valid.Count -eq 0) {
    return @{ avg = $null; min = $null; max = $null; p50 = $null; p95 = $null }
  }
  $sorted = $valid | Sort-Object
  return @{
    avg = [math]::Round(($valid | Measure-Object -Average).Average, 0)
    min = [math]::Round(($valid | Measure-Object -Minimum).Minimum, 0)
    max = [math]::Round(($valid | Measure-Object -Maximum).Maximum, 0)
    p50 = [math]::Round($sorted[[math]::Floor($valid.Count/2)], 0)
    p95 = if ($valid.Count -ge 2) { [math]::Round($sorted[[math]::Ceiling($valid.Count*0.95)-1], 0) } else { [math]::Round($sorted[-1], 0) }
  }
}

# ═══════════════════════════════════════════════════════════════════════════
# 1. COLD START — fresh bun cache per round
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "═══ SCENARIO 1: COLD START (clean bun cache each round) ═══" -ForegroundColor Yellow

$coldRaw = @()
for ($i = 0; $i -lt $Rounds; $i++) {
  Write-Host "  round $($i+1)/$Rounds..." -NoNewline
  $tmpCache = Join-Path $env:TEMP "bun-cache-bench-$([Guid]::NewGuid())"
  $null = New-Item -ItemType Directory -Force $tmpCache
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $p = Start-Process -FilePath $bun `
      -ArgumentList "run --conditions=browser `"$engineEntry`" -- --help" `
      -NoNewWindow -Wait -PassThru `
      -RedirectStandardOutput "NUL" -RedirectStandardError "NUL" `
      -Environment @{ BUN_GLOBAL_CACHE = $tmpCache }
    $sw.Stop()
    $ms = $sw.ElapsedMilliseconds
    $coldRaw += $ms
    Write-Host " $(Format-Ms $ms)" -ForegroundColor $(if ($ms -le 2000) { "Green" } else { "Yellow" })
  } catch {
    Write-Host " ERROR: $_" -ForegroundColor Red
    $coldRaw += $null
  } finally {
    Remove-Item -Path $tmpCache -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$coldStat = Compute-Stats $coldRaw
Write-Host "  => avg=$(Format-Ms $coldStat.avg) min=$(Format-Ms $coldStat.min) max=$(Format-Ms $coldStat.max) p50=$(Format-Ms $coldStat.p50) p95=$(Format-Ms $coldStat.p95)" -ForegroundColor DarkGray

$results.scenarios.cold = @{
  label  = "Cold start - clean bun cache each round"
  raw_ms = $coldRaw
  avg_ms = $coldStat.avg
  min_ms = $coldStat.min
  max_ms = $coldStat.max
  p50_ms = $coldStat.p50
  p95_ms = $coldStat.p95
}

# ═══════════════════════════════════════════════════════════════════════════
# 2. WARM START — after priming
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "`n═══ SCENARIO 2: WARM START (after warmup rounds) ═══" -ForegroundColor Yellow

if ($WarmupRounds -gt 0) {
  Write-Host "  warmup ($WarmupRounds rounds)..." -NoNewline
  for ($i = 0; $i -lt $WarmupRounds; $i++) {
    $null = Start-Process -FilePath $bun -ArgumentList "run --conditions=browser `"$engineEntry`" -- --help" -NoNewWindow -Wait -RedirectStandardOutput "NUL" -RedirectStandardError "NUL"
    Write-Host "." -NoNewline
  }
  Write-Host " done"
}

$warmRaw = @()
for ($i = 0; $i -lt $Rounds; $i++) {
  Write-Host "  round $($i+1)/$Rounds..." -NoNewline
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $p = Start-Process -FilePath $bun `
      -ArgumentList "run --conditions=browser `"$engineEntry`" -- --help" `
      -NoNewWindow -Wait -PassThru `
      -RedirectStandardOutput "NUL" -RedirectStandardError "NUL"
    $sw.Stop()
    $ms = $sw.ElapsedMilliseconds
    $warmRaw += $ms
    Write-Host " $(Format-Ms $ms)" -ForegroundColor $(if ($ms -le 1000) { "Green" } else { "Yellow" })
  } catch {
    Write-Host " ERROR: $_" -ForegroundColor Red
    $warmRaw += $null
  }
}

$warmStat = Compute-Stats $warmRaw
Write-Host "  => avg=$(Format-Ms $warmStat.avg) min=$(Format-Ms $warmStat.min) max=$(Format-Ms $warmStat.max) p50=$(Format-Ms $warmStat.p50) p95=$(Format-Ms $warmStat.p95)" -ForegroundColor DarkGray

$results.scenarios.warm = @{
  label  = "Warm start - cached bun JIT, plain --help"
  raw_ms = $warmRaw
  avg_ms = $warmStat.avg
  min_ms = $warmStat.min
  max_ms = $warmStat.max
  p50_ms = $warmStat.p50
  p95_ms = $warmStat.p95
}

# ═══════════════════════════════════════════════════════════════════════════
# 3. MODULE-LOAD-ONLY — dynamic import only, no yargs execution
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "`n═══ SCENARIO 3: MODULE LOAD ONLY (dynamic import, no yargs) ═══" -ForegroundColor Yellow

# Write a temp .mjs that measures just the module import time
$loadScript = Join-Path $outDir "_load-only-bench.mjs"
$loadCode = @"
const t = performance.now();
await import('$engineEntryFwd');
console.log(performance.now() - t);
"@
Set-Content -Path $loadScript -Value $loadCode -NoNewline

$loadRaw = @()
for ($i = 0; $i -lt $Rounds; $i++) {
  Write-Host "  round $($i+1)/$Rounds..." -NoNewline
  try {
    $output = & $bun run --conditions=browser $loadScript 2>&1 | Out-String
    # Find a line that is purely a number (could have trailing newline/whitespace)
    $msLine = ($output -split "`n" | Where-Object { $_ -match '^\s*[\d.]+\.?\s*$' } | Select-Object -Last 1)
    if ($msLine -match '([\d.]+)') {
      $msVal = [double]$Matches[1]
      if ($msVal -gt 0) {
        $loadRaw += $msVal
        Write-Host " $(Format-Ms $msVal)" -ForegroundColor $(if ($msVal -le 1000) { "Green" } else { "Yellow" })
      } else {
        Write-Host " PARSE_ZERO ($($output.Trim()))" -ForegroundColor Red
        $loadRaw += $null
      }
    } else {
      Write-Host " PARSE_FAIL ($($output.Trim()))" -ForegroundColor Red
      $loadRaw += $null
    }
  } catch {
    Write-Host " ERROR: $_" -ForegroundColor Red
    $loadRaw += $null
  }
}

Remove-Item -Path $loadScript -Force -ErrorAction SilentlyContinue

$loadStat = Compute-Stats $loadRaw
Write-Host "  => avg=$(Format-Ms $loadStat.avg) min=$(Format-Ms $loadStat.min) max=$(Format-Ms $loadStat.max) p50=$(Format-Ms $loadStat.p50) p95=$(Format-Ms $loadStat.p95)" -ForegroundColor DarkGray

$results.scenarios.load = @{
  label  = "Module load only - dynamic import, no yargs execution"
  raw_ms = $loadRaw
  avg_ms = $loadStat.avg
  min_ms = $loadStat.min
  max_ms = $loadStat.max
  p50_ms = $loadStat.p50
  p95_ms = $loadStat.p95
}

# ═══════════════════════════════════════════════════════════════════════════
# 4. TUI-READY (TTFD) — ARCANA_SHOW_TTFD=1, poll for signal, kill
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "`n═══ SCENARIO 4: TUI READY (TTFD via ARCANA_SHOW_TTFD=1) ═══" -ForegroundColor Yellow

$ttfdTimeoutMs = 30000
$ttfdRaw = @()

for ($i = 0; $i -lt $Rounds; $i++) {
  Write-Host "  round $($i+1)/$Rounds..." -NoNewline

  $stderrFile = Join-Path $env:TEMP "arcana-ttfd-$([Guid]::NewGuid()).stderr"

  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()

    # Launch TUI with ARCANA_SHOW_TTFD=1, redirecting stderr to a temp file
    $p = Start-Process -FilePath $bun `
      -ArgumentList "run --conditions=browser `"$engineEntry`"" `
      -PassThru -NoNewWindow `
      -RedirectStandardError $stderrFile -RedirectStandardOutput "NUL" `
      -Environment @{ ARCANA_SHOW_TTFD = "1" }

    $ttfdVal = $null
    $timedOut = $false

    # Poll stderr file for TTFD marker
    while ($sw.ElapsedMilliseconds -lt $ttfdTimeoutMs) {
      Start-Sleep -Milliseconds 100

      if ($p.HasExited) {
        # Process exited — check stderr one last time
        if (Test-Path $stderrFile) {
          $content = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
          if ($content -match 'TTFD[:=]\s*([\d.]+)') {
            $ttfdVal = [double]$Matches[1]
          }
        }
        break
      }

      if (Test-Path $stderrFile) {
        $content = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
        if ($content -match 'TTFD[:=]\s*([\d.]+)') {
          $ttfdVal = [double]$Matches[1]
          break
        }
      }
    }

    $sw.Stop()
    $measuredMs = $sw.ElapsedMilliseconds

    # Kill the TUI process
    if (-not $p.HasExited) {
      $p.Kill()
      $p.WaitForExit(5000)
    }
    $p.Dispose()

    if ($null -ne $ttfdVal) {
      $ttfdRaw += $measuredMs
      Write-Host " $(Format-Ms $measuredMs) (TTFD=$ttfdVal)" -ForegroundColor Green
    } elseif ($measuredMs -ge $ttfdTimeoutMs) {
      Write-Host " TIMEOUT (${ttfdTimeoutMs}ms)" -ForegroundColor Red
      $ttfdRaw += $null
    } else {
      Write-Host " NO_TTFD_SIGNAL (${measuredMs}ms)" -ForegroundColor Red
      $ttfdRaw += $null
    }
  } catch {
    Write-Host " ERROR: $_" -ForegroundColor Red
    $ttfdRaw += $null
  } finally {
    Remove-Item -Path $stderrFile -Force -ErrorAction SilentlyContinue
    # Cleanup any leftover bun processes from this round
    Get-Process -Name bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-1) } | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}

$ttfdStat = Compute-Stats $ttfdRaw
Write-Host "  => avg=$(Format-Ms $ttfdStat.avg) min=$(Format-Ms $ttfdStat.min) max=$(Format-Ms $ttfdStat.max) p50=$(Format-Ms $ttfdStat.p50) p95=$(Format-Ms $ttfdStat.p95)" -ForegroundColor DarkGray

$results.scenarios.ttfd = @{
  label      = "TUI ready (TTFD) - ARCANA_SHOW_TTFD=1, poll stderr"
  raw_ms     = $ttfdRaw
  avg_ms     = $ttfdStat.avg
  min_ms     = $ttfdStat.min
  max_ms     = $ttfdStat.max
  p50_ms     = $ttfdStat.p50
  p95_ms     = $ttfdStat.p95
  timeout_ms = $ttfdTimeoutMs
}

# ═══════════════════════════════════════════════════════════════════════════
# KILL LINGERING PROCESSES
# ═══════════════════════════════════════════════════════════════════════════
Get-Process -Name bun -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# ═══════════════════════════════════════════════════════════════════════════
# EXPORT JSON
# ═══════════════════════════════════════════════════════════════════════════
$outPath = Join-Path $outDir "startup.json"
$results | ConvertTo-Json -Depth 5 | Set-Content $outPath
Write-Host "`nResults exported: $outPath" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY TABLE
# ═══════════════════════════════════════════════════════════════════════════
Write-Host @"

╔══════════════════════════════════════════════════════════════════════╗
║                       STARTUP BENCHMARK SUMMARY                     ║
╠══════════════════════════════════════════════════════════════════════╣
"@ -ForegroundColor Cyan

$rowFmt = "  {0,-28} {1,8} {2,8} {3,8} {4,8} {5,8}"
Write-Host ($rowFmt -f "Scenario","Avg","Min","Max","P50","P95") -ForegroundColor White
Write-Host "  " + ("─" * 71) -ForegroundColor DarkGray

function Write-SummaryRow {
  param($Label, $S)
  Write-Host ($rowFmt -f $Label, (Format-Ms $S.avg), (Format-Ms $S.min), (Format-Ms $S.max), (Format-Ms $S.p50), (Format-Ms $S.p95))
}

Write-SummaryRow "Cold start" $coldStat
Write-SummaryRow "Warm start" $warmStat
Write-SummaryRow "Module load only" $loadStat
Write-SummaryRow "TUI ready (TTFD)" $ttfdStat

if ($null -ne $coldStat.avg -and $null -ne $warmStat.avg) {
  $delta = $warmStat.avg - $coldStat.avg
  $sign = if ($delta -ge 0) { "+" } else { "" }
  Write-Host "  " + ("─" * 71) -ForegroundColor DarkGray
  Write-Host "  Warm vs Cold delta:  ${sign}${delta}ms" -ForegroundColor DarkGray
}

Write-Host "╚══════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  Total benchmark time: $([math]::Round($TD.Elapsed.TotalSeconds,1))s" -ForegroundColor DarkGray
