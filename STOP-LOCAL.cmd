@echo off
setlocal EnableExtensions EnableDelayedExpansion
title VMO AIMarTech Local Stop
cd /d "%~dp0"
set "SUPABASE_PROJECT_ID=vmoaimartech-local"
set "VITE_SUPABASE_PROJECT_ID=vmoaimartech-local"
set "SUPABASE_TELEMETRY_DISABLED=1"

echo ========================================
echo Stopping VMO AIMarTech Local Development
echo ========================================

set "APP_STOPPED=0"
if exist "%~dp0.local-app-shell.pid" (
  set /p APP_PID=<"%~dp0.local-app-shell.pid"
  echo !APP_PID!| findstr /R "^[0-9][0-9]*$" >nul
  if not errorlevel 1 (
    powershell.exe -NoProfile -Command "$p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + !APP_PID!) -ErrorAction SilentlyContinue; if ($p -and $p.Name -eq 'cmd.exe' -and $p.CommandLine -like '*START-LOCAL.cmd*--run-app*') { exit 0 } else { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
      echo Stopping launcher-managed application terminal...
      taskkill /PID !APP_PID! /T /F >nul 2>&1
      set "APP_STOPPED=1"
    )
  )
  if "!APP_STOPPED!"=="1" del /q "%~dp0.local-app-shell.pid" >nul 2>&1
)

if "!APP_STOPPED!"=="0" (
  tasklist /FI "WINDOWTITLE eq VMO AIMarTech App" /NH 2>nul | findstr /I "cmd.exe" >nul
  if not errorlevel 1 (
    echo Stopping launcher-managed application terminal...
    taskkill /FI "WINDOWTITLE eq VMO AIMarTech App" /T /F >nul 2>&1
    set "APP_STOPPED=1"
  )
)

if "!APP_STOPPED!"=="0" echo No launcher-managed application terminal was running.

echo Stopping this repository's local Supabase services...
call npm.cmd run dev:infra:stop
if errorlevel 1 (
  echo Local Supabase was already stopped or returned a warning.
) else (
  echo Local Supabase stopped.
)

echo.
echo Docker Desktop was left running.
echo No unrelated Node process or Docker container was targeted.
pause
exit /b 0
