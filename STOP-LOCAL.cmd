@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "NO_PAUSE=0"
set "APP_ONLY=0"
for %%A in (%*) do (
  if /I "%%~A"=="--no-pause" set "NO_PAUSE=1"
  if /I "%%~A"=="--app-only" set "APP_ONLY=1"
)

title VMO AIMarTech Local STOP
cd /d "%~dp0"
set "REPO=%~dp0"
set "PROJECT_ID=vmoaimartech-local"
set "LEGACY_PROJECT_ID=YOUR_SUPABASE_PROJECT_ID"
set "SUPABASE_PROJECT_ID=%PROJECT_ID%"
set "VITE_SUPABASE_PROJECT_ID=%PROJECT_ID%"
set "SUPABASE_TELEMETRY_DISABLED=1"

echo ========================================
echo VMO AIMarTech Local Development - STOP
echo ========================================

call :stop_app

if "%APP_ONLY%"=="1" (
  echo Local web application: STOPPED
  if "%NO_PAUSE%"=="0" pause
  exit /b 0
)

echo Stopping current local Supabase project %PROJECT_ID%...
call npm.cmd exec -- supabase stop --project-id "%PROJECT_ID%" >nul 2>&1

rem Also stop the exact stale legacy project that previously owned the same ports.
set "LEGACY_FOUND=0"
for /f "delims=" %%C in ('docker ps --format "{{.Names}}" 2^>nul ^| findstr /I /E /C:"_%LEGACY_PROJECT_ID%"') do (
  set "LEGACY_FOUND=1"
  docker stop "%%C" >nul 2>&1
)
if "!LEGACY_FOUND!"=="1" (
  call npm.cmd exec -- supabase stop --project-id "%LEGACY_PROJECT_ID%" >nul 2>&1
  echo Stale legacy Supabase project also stopped.
)

echo.
echo Local web application: STOPPED
echo Local Supabase containers: STOPPED
echo Local database/storage data: PRESERVED
echo Docker Desktop: LEFT RUNNING
echo Unrelated Docker containers: NOT TOUCHED

if "%NO_PAUSE%"=="0" pause
exit /b 0

:stop_app
if not exist "%REPO%scripts\dev\stop-local-app.ps1" (
  echo ERROR: scripts\dev\stop-local-app.ps1 was not found.
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO%scripts\dev\stop-local-app.ps1"
if errorlevel 2 (
  echo No launcher-managed application terminal was running.
) else (
  if errorlevel 1 (
    echo WARNING: Could not inspect the local application process.
  ) else (
    echo Stopped launcher-managed application terminal.
  )
)
exit /b 0
