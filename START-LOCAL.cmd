@echo off
setlocal EnableExtensions EnableDelayedExpansion

if /I "%~1"=="--run-app" goto run_app

title VMO AIMarTech Local Launcher
cd /d "%~dp0"
set "REPO=%~dp0"
set "SUPABASE_PROJECT_ID=vmoaimartech-local"
set "VITE_SUPABASE_PROJECT_ID=vmoaimartech-local"
set "SUPABASE_TELEMETRY_DISABLED=1"
set "APP_URL=http://127.0.0.1:8080/"
set "STUDIO_URL=http://127.0.0.1:56323/"

echo ========================================
echo VMO AIMarTech Local Development
echo ========================================
echo Repository: %REPO%
echo.

where docker.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker CLI was not found.
  echo Install or repair Docker Desktop manually, then try again.
  goto fail
)

docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo Docker Engine is not running.
set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not exist "!DOCKER_DESKTOP!" set "DOCKER_DESKTOP=%LocalAppData%\Docker\Docker Desktop.exe"

if not exist "!DOCKER_DESKTOP!" (
  echo ERROR: Docker Desktop was not found in a standard installation location.
  echo Please start Docker Desktop manually.
  goto fail
)

echo Launching Docker Desktop...
start "" "!DOCKER_DESKTOP!"
echo Waiting for Docker Desktop...
set /a DOCKER_ATTEMPTS=0

:wait_docker
timeout /t 4 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a DOCKER_ATTEMPTS+=1
if !DOCKER_ATTEMPTS! GEQ 30 (
  echo.
  echo Docker Desktop did not become ready.
  echo Please inspect Docker Desktop manually.
  goto fail
)
echo Waiting for Docker Engine... !DOCKER_ATTEMPTS!/30
goto wait_docker

:docker_ready
echo Docker Engine ready.
echo.
echo Starting local Supabase services...
call npm.cmd run dev:infra:start >nul
if errorlevel 1 (
  echo Supabase start returned a non-zero status; checking existing local stack...
  call npm.cmd exec -- supabase status >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Local Supabase did not become healthy.
    goto fail
  )
  echo Local Supabase is already running.
)

echo.
echo Generating local environment...
call npm.cmd run dev:env
if errorlevel 1 (
  echo ERROR: Local environment generation failed.
  goto fail
)

curl.exe --silent --fail --max-time 2 "%APP_URL%" >nul 2>&1
if errorlevel 1 (
  echo.
  echo Starting application in a separate terminal...
  start "VMO AIMarTech App" /D "%REPO%" cmd.exe /k call "START-LOCAL.cmd" --run-app
) else (
  echo Application is already responding.
)

echo Waiting for application readiness...
set /a APP_ATTEMPTS=0
:wait_app
curl.exe --silent --fail --max-time 2 "%APP_URL%" >nul 2>&1
if not errorlevel 1 goto app_ready
set /a APP_ATTEMPTS+=1
if !APP_ATTEMPTS! GEQ 30 (
  echo.
  echo Application did not become ready at %APP_URL%
  echo Inspect the visible VMO AIMarTech App terminal.
  goto fail
)
timeout /t 3 /nobreak >nul
echo Waiting for application... !APP_ATTEMPTS!/30
goto wait_app

:app_ready
echo Application ready.
start "" "%APP_URL%"
echo.
echo ========================================
echo VMO AIMarTech Local Development
echo ========================================
echo Docker:    RUNNING
echo Supabase:  RUNNING
echo App:       %APP_URL%
echo Studio:    %STUDIO_URL%
echo ========================================
echo.
echo The application terminal must remain open while developing.
echo Double-click STOP-LOCAL.cmd when finished.
pause
exit /b 0

:run_app
title VMO AIMarTech App
cd /d "%~dp0"
for /f %%P in ('powershell.exe -NoProfile -Command "$self=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $PID); $wrapper=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $self.ParentProcessId); $wrapper.ParentProcessId"') do >"%~dp0.local-app-shell.pid" echo %%P
echo ========================================
echo VMO AIMarTech Application
echo ========================================
echo App: http://127.0.0.1:8080/
echo Close with STOP-LOCAL.cmd or Ctrl+C.
echo.
call npm.cmd run dev
set "APP_EXIT=%ERRORLEVEL%"
del /q "%~dp0.local-app-shell.pid" >nul 2>&1
echo.
echo Application process exited with code %APP_EXIT%.
echo Review any error above. This window will remain open.
exit /b %APP_EXIT%

:fail
echo.
echo Startup stopped. No system security policy was changed.
pause
exit /b 1
