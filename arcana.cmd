@echo off
REM Arcana launcher — zero-JIT startup. Checks args: TUI mode spawns opencode directly,
REM subcommands (run, skills, cron, memory, gateway, completion) delegate to full CLI.
setlocal enabledelayedexpansion

set "ARCANA_HOME=%USERPROFILE%\.arcana"
set "CONFIG=%ARCANA_HOME%\cache\opencode-config.json"

REM Generate bridge config once (nearly instant — 2 dir checks + 1 JSON file)
if not exist "%CONFIG%" (
    powershell -NoProfile -Command "mkdir '%ARCANA_HOME%\cache' -Force *>$null; $s=@(); if(Test-Path '%~dp0skills'){$s+='%~dp0skills'}; if(Test-Path '%ARCANA_HOME%\skills'){$s+='%ARCANA_HOME%\skills'}; @{'skills'=@{paths=$s}} | ConvertTo-Json -Depth 3 | Out-File '%CONFIG%' -Encoding utf8"
)

set "ARCANA_CONFIG=%CONFIG%"
set "PWD=%CD%"

REM Check if first arg is an arcana subcommand
set "_arg1=%~1"
if "%_arg1%"=="run" goto :subcommand
if "%_arg1%"=="skills" goto :subcommand
if "%_arg1%"=="cron" goto :subcommand
if "%_arg1%"=="memory" goto :subcommand
if "%_arg1%"=="gateway" goto :subcommand
if "%_arg1%"=="completion" goto :subcommand
if "%_arg1%"=="--version" goto :subcommand
if "%_arg1%"=="-v" goto :subcommand
if "%_arg1%"=="--help" goto :subcommand
if "%_arg1%"=="-h" goto :subcommand

REM Auto-load proxy key from license activation
if not defined ARCANA_PROXY_KEY if exist "%USERPROFILE%\.arcana\proxy_key" (
    set /p ARCANA_PROXY_KEY=<"%USERPROFILE%\.arcana\proxy_key"
)

REM TUI mode — spawn opencode directly
bun run --conditions=browser "%~dp0packages\engine\src\index.ts" %*
goto :end

:subcommand
REM Subcommand mode — delegate to full arcana TypeScript CLI
bun run "%~dp0packages\arcana\src\index.ts" %*

:end
