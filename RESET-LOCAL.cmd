@echo off
setlocal EnableExtensions EnableDelayedExpansion
title VMO AIMarTech Local Factory Reset
cd /d "%~dp0"

set "REPO=%~dp0"
set "PROJECT_ID=vmoaimartech-local"
set "SUPABASE_PROJECT_ID=%PROJECT_ID%"
set "VITE_SUPABASE_PROJECT_ID=%PROJECT_ID%"
set "APP_URL=http://127.0.0.1:8080/"
set "SETUP_URL=http://127.0.0.1:8080/setup"
set "STUDIO_URL=http://127.0.0.1:56323/"
set "SUPABASE_TELEMETRY_DISABLED=1"

echo ========================================
echo VMO AIMarTech Local Factory Reset
echo ========================================
echo.

if not exist "%REPO%package.json" (
  echo ERROR: package.json was not found beside RESET-LOCAL.cmd.
  goto fail
)
if not exist "%REPO%supabase\config.toml" (
  echo ERROR: supabase\config.toml was not found.
  goto fail
)

powershell.exe -NoProfile -Command "$raw=Get-Content -LiteralPath '%REPO%supabase\config.toml' -Raw; if ($raw -match '(?m)^\s*project_id\s*=\s*\"vmoaimartech-local\"\s*$') { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo ERROR: Safety check failed.
  echo Expected local Supabase project_id: %PROJECT_ID%
  echo No data was deleted.
  goto fail
)

echo WARNING: This permanently deletes ALL data owned by this repository's
echo local Supabase project, including:
echo   - PostgreSQL rows and migration history
echo   - Auth users and sessions
echo   - Storage buckets, uploaded objects, and metadata
echo   - Realtime state and other local Supabase volumes
echo.
echo Source code, node_modules, Docker Desktop, and unrelated containers
echo are NOT deleted.
echo.
set /p "CONFIRM=Type RESET-LOCAL to continue: "
if /I not "!CONFIRM!"=="RESET-LOCAL" (
  echo Reset cancelled. No data was deleted.
  pause
  exit /b 0
)

where docker.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker CLI was not found.
  goto fail
)

docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not exist "!DOCKER_DESKTOP!" set "DOCKER_DESKTOP=%LocalAppData%\Docker\Docker Desktop.exe"
if not exist "!DOCKER_DESKTOP!" (
  echo ERROR: Docker Desktop was not found in a standard location.
  echo Start Docker Desktop manually, then run RESET-LOCAL.cmd again.
  goto fail
)

echo Launching Docker Desktop...
start "" "!DOCKER_DESKTOP!"
echo Waiting for Docker Engine...
set /a DOCKER_ATTEMPTS=0
:wait_docker
timeout /t 4 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a DOCKER_ATTEMPTS+=1
if !DOCKER_ATTEMPTS! GEQ 30 (
  echo Docker Desktop did not become ready.
  echo Please inspect Docker Desktop manually. No reset was performed.
  goto fail
)
echo Waiting for Docker Engine... !DOCKER_ATTEMPTS!/30
goto wait_docker

:docker_ready
echo Docker Engine ready.

set "APP_STOPPED=0"
if exist "%REPO%.local-app-shell.pid" (
  set /p APP_PID=<"%REPO%.local-app-shell.pid"
  echo !APP_PID!| findstr /R "^[0-9][0-9]*$" >nul
  if not errorlevel 1 (
    powershell.exe -NoProfile -Command "$p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + !APP_PID!) -ErrorAction SilentlyContinue; if ($p -and $p.Name -eq 'cmd.exe' -and $p.CommandLine -like '*START-LOCAL.cmd*--run-app*') { exit 0 } else { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
      echo Stopping launcher-managed application terminal...
      taskkill /PID !APP_PID! /T /F >nul 2>&1
      set "APP_STOPPED=1"
    )
  )
  del /q "%REPO%.local-app-shell.pid" >nul 2>&1
)

if "!APP_STOPPED!"=="0" (
  tasklist /FI "WINDOWTITLE eq VMO AIMarTech App" /NH 2>nul | findstr /I "cmd.exe" >nul
  if not errorlevel 1 (
    echo Stopping launcher-managed application terminal...
    taskkill /FI "WINDOWTITLE eq VMO AIMarTech App" /T /F >nul 2>&1
    set "APP_STOPPED=1"
  )
)

curl.exe --silent --fail --max-time 2 "%APP_URL%" >nul 2>&1
if not errorlevel 1 (
  echo ERROR: An application not managed by START-LOCAL.cmd is still using port 8080.
  echo Stop that application manually. No database data was deleted.
  goto fail
)

echo.
echo Deleting ONLY Supabase project %PROJECT_ID% and its local volumes...
call npm.cmd exec -- supabase stop --project-id "%PROJECT_ID%" --no-backup
if errorlevel 1 (
  echo ERROR: Supabase could not remove the local project volumes.
  echo The reset stopped before rebuilding services.
  goto fail
)

echo Waiting for this project's containers to be removed completely...
set /a REMOVE_ATTEMPTS=0
:wait_project_removed
docker ps -a --format "{{.Names}}" 2>nul | findstr /I /E /C:"_%PROJECT_ID%" >nul
if errorlevel 1 goto project_removed
set /a REMOVE_ATTEMPTS+=1
if !REMOVE_ATTEMPTS! GEQ 30 (
  echo ERROR: Containers for %PROJECT_ID% were not removed within 60 seconds.
  echo No unrelated container was stopped.
  goto fail
)
timeout /t 2 /nobreak >nul
echo Waiting for local container removal... !REMOVE_ATTEMPTS!/30
goto wait_project_removed

:project_removed
echo Local project volumes and containers removed.

if exist "%REPO%.env.local" del /q "%REPO%.env.local" >nul 2>&1

echo.
echo Recreating local Supabase from migrations and seed...
call npm.cmd run dev:infra:start
if errorlevel 1 (
  echo ERROR: Local Supabase rebuild failed. Review the migration error above.
  goto fail
)

echo.
echo Generating a fresh local environment and cryptographically random secrets...
call npm.cmd run dev:env
if errorlevel 1 (
  echo ERROR: Local environment generation failed.
  goto fail
)

echo.
echo Starting the application in a separate terminal...
start "VMO AIMarTech App" /D "%REPO%" cmd.exe /k call "START-LOCAL.cmd" --run-app

echo Waiting for application readiness...
set /a APP_ATTEMPTS=0
:wait_app
curl.exe --silent --fail --max-time 2 "%APP_URL%" >nul 2>&1
if not errorlevel 1 goto reset_complete
set /a APP_ATTEMPTS+=1
if !APP_ATTEMPTS! GEQ 30 (
  echo ERROR: Application did not become ready at %APP_URL%
  echo Inspect the visible VMO AIMarTech App terminal.
  goto fail
)
timeout /t 3 /nobreak >nul
echo Waiting for application... !APP_ATTEMPTS!/30
goto wait_app

:reset_complete
start "" "%SETUP_URL%"
echo.
echo ========================================
echo LOCAL RESET COMPLETE
echo ========================================
echo Database:  EMPTY AND REBUILT
echo Auth users: NONE
echo Storage:   RESET TO SEEDED BUCKETS
echo App:       %APP_URL%
echo Setup:     %SETUP_URL%
echo Studio:    %STUDIO_URL%
echo ========================================
echo.
echo The application terminal remains running for development.
pause
exit /b 0

:fail
echo.
echo Reset stopped. Docker Desktop and unrelated projects were not modified.
pause
exit /b 1
