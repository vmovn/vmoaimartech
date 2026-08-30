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
set "APP_STOPPED=0"
set "PID_FILE=%REPO%.local-app-shell.pid"
if exist "%PID_FILE%" (
  set /p APP_PID=<"%PID_FILE%"
  echo !APP_PID!| findstr /R "^[0-9][0-9]*$" >nul
  if not errorlevel 1 (
    powershell.exe -NoProfile -Command "$p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + !APP_PID!) -ErrorAction SilentlyContinue; if($p -and $p.Name -eq 'cmd.exe' -and $p.CommandLine -like '*START-LOCAL.cmd*--run-app*'){exit 0}else{exit 1}" >nul 2>&1
    if not errorlevel 1 (
      echo Stopping launcher-managed application terminal...
      taskkill /PID !APP_PID! /T /F >nul 2>&1
      set "APP_STOPPED=1"
    )
  )
  del /q "%PID_FILE%" >nul 2>&1
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
exit /b 0
