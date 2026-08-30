@echo off
setlocal EnableExtensions EnableDelayedExpansion

if /I "%~1"=="--run-app" goto run_app

set "NO_PAUSE=0"
set "OPEN_SETUP=0"
for %%A in (%*) do (
  if /I "%%~A"=="--no-pause" set "NO_PAUSE=1"
  if /I "%%~A"=="--setup" set "OPEN_SETUP=1"
)

title VMO AIMarTech Local START
cd /d "%~dp0"
set "REPO=%~dp0"
set "PROJECT_ID=vmoaimartech-local"
set "LEGACY_PROJECT_ID=YOUR_SUPABASE_PROJECT_ID"
set "SUPABASE_PROJECT_ID=%PROJECT_ID%"
set "VITE_SUPABASE_PROJECT_ID=%PROJECT_ID%"
set "SUPABASE_TELEMETRY_DISABLED=1"
set "APP_URL=http://127.0.0.1:8080/"
set "SETUP_URL=http://127.0.0.1:8080/setup"
set "STUDIO_URL=http://127.0.0.1:56323/"
set "SUPABASE_PORTS=56320 56321 56322 56323 56324"

echo ========================================
echo VMO AIMarTech Local Development - START
echo ========================================
echo Repository: %REPO%
echo.

if not exist "%REPO%package.json" (
  echo ERROR: package.json was not found beside START-LOCAL.cmd.
  goto fail
)
if not exist "%REPO%supabase\config.toml" (
  echo ERROR: supabase\config.toml was not found.
  goto fail
)

call :ensure_docker
if errorlevel 1 goto fail

rem A previous vendor/local configuration used the literal placeholder project id
rem YOUR_SUPABASE_PROJECT_ID. Those containers are known stale predecessors of
rem this repository and use the same 5632x ports. Stop only that exact legacy id.
call :stop_legacy_stack

rem If the current project is already healthy, keep it running.
echo.
echo Checking local Supabase...
call npm.cmd exec -- supabase status >nul 2>&1
if not errorlevel 1 (
  echo Local Supabase is already running.
  goto supabase_ready
)

rem Clean only stale containers for the CURRENT project while preserving volumes.
echo Local Supabase is not healthy. Cleaning stale containers for %PROJECT_ID%...
call npm.cmd exec -- supabase stop --project-id "%PROJECT_ID%" >nul 2>&1
call :remove_project_containers "%PROJECT_ID%"

call :wait_ports_free 60
if errorlevel 1 goto fail

echo Starting local Supabase services...
call npm.cmd run dev:infra:start
if errorlevel 1 (
  echo Supabase start returned a non-zero status; verifying health once...
  call npm.cmd exec -- supabase status >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Local Supabase did not become healthy.
    call :show_port_blockers
    goto fail
  )
)

:supabase_ready
echo Supabase ready.

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
if !APP_ATTEMPTS! GEQ 40 (
  echo.
  echo ERROR: Application did not become ready at %APP_URL%
  echo Inspect the visible VMO AIMarTech App terminal.
  goto fail
)
timeout /t 2 /nobreak >nul
echo Waiting for application... !APP_ATTEMPTS!/40
goto wait_app

:app_ready
echo Application ready.
if "%OPEN_SETUP%"=="1" (
  start "" "%SETUP_URL%"
) else (
  start "" "%APP_URL%"
)

echo.
echo ========================================
echo VMO AIMarTech Local Development - READY
echo ========================================
echo Docker:    RUNNING
echo Supabase:  RUNNING
echo App:       %APP_URL%
echo Studio:    %STUDIO_URL%
echo ========================================
echo.
echo Keep the VMO AIMarTech App terminal open while developing.
echo Double-click STOP-LOCAL.cmd when finished.
if "%NO_PAUSE%"=="0" pause
exit /b 0

:ensure_docker
where docker.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker CLI was not found.
  exit /b 1
)

docker info >nul 2>&1
if not errorlevel 1 (
  echo Docker Engine ready.
  exit /b 0
)

set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not exist "!DOCKER_DESKTOP!" set "DOCKER_DESKTOP=%LocalAppData%\Docker\Docker Desktop.exe"
if not exist "!DOCKER_DESKTOP!" (
  echo ERROR: Docker Desktop was not found in a standard location.
  echo Start Docker Desktop manually, then run START-LOCAL.cmd again.
  exit /b 1
)

echo Launching Docker Desktop...
start "" "!DOCKER_DESKTOP!"
echo Waiting for Docker Engine...
set /a DOCKER_ATTEMPTS=0
:wait_docker
timeout /t 4 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 (
  echo Docker Engine ready.
  exit /b 0
)
set /a DOCKER_ATTEMPTS+=1
if !DOCKER_ATTEMPTS! GEQ 30 (
  echo ERROR: Docker Desktop did not become ready within 120 seconds.
  exit /b 1
)
echo Waiting for Docker Engine... !DOCKER_ATTEMPTS!/30
goto wait_docker

:stop_legacy_stack
set "LEGACY_FOUND=0"
for /f "delims=" %%C in ('docker ps --format "{{.Names}}" 2^>nul ^| findstr /I /E /C:"_%LEGACY_PROJECT_ID%"') do (
  if "!LEGACY_FOUND!"=="0" echo Found stale legacy Supabase stack %LEGACY_PROJECT_ID%. Stopping it safely...
  set "LEGACY_FOUND=1"
  docker stop "%%C" >nul 2>&1
)
if "!LEGACY_FOUND!"=="1" (
  call npm.cmd exec -- supabase stop --project-id "%LEGACY_PROJECT_ID%" >nul 2>&1
  echo Legacy stack stopped. Its data was preserved.
)
exit /b 0

:remove_project_containers
set "TARGET_PROJECT=%~1"
for /f "delims=" %%C in ('docker ps -a --format "{{.Names}}" 2^>nul ^| findstr /I /E /C:"_!TARGET_PROJECT!"') do (
  docker rm -f "%%C" >nul 2>&1
)
exit /b 0

:wait_ports_free
set /a WAIT_SECONDS=%~1
set /a WAIT_TRIES=WAIT_SECONDS/2
if !WAIT_TRIES! LSS 1 set /a WAIT_TRIES=1
set /a WAIT_NOW=0
:wait_ports_loop
powershell.exe -NoProfile -Command "$ports=@(56320,56321,56322,56323,56324); $published=(& docker ps --format '{{.Ports}}' 2>$null) -join [Environment]::NewLine; foreach($p in $ports){ if($published -match ('(?:0\.0\.0\.0|\[::\]):'+$p+'->')){ exit 1 } }; try { $listeners=Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $ports -contains $_.LocalPort }; if($listeners){ exit 1 } } catch {}; exit 0" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a WAIT_NOW+=1
if !WAIT_NOW! GEQ !WAIT_TRIES! (
  echo ERROR: One or more local Supabase ports are still occupied after %~1 seconds.
  call :show_port_blockers
  exit /b 1
)
timeout /t 2 /nobreak >nul
echo Waiting for ports %SUPABASE_PORTS% to become reusable... !WAIT_NOW!/!WAIT_TRIES!
goto wait_ports_loop

:show_port_blockers
echo.
echo Docker containers publishing local Supabase ports:
docker ps --format "{{.ID}}  {{.Names}}  {{.Ports}}" 2>nul | findstr /C:"56320" /C:"56321" /C:"56322" /C:"56323" /C:"56324"
echo.
echo Windows listeners on local Supabase ports:
netstat -ano 2>nul | findstr /C:":56320" /C:":56321" /C:":56322" /C:":56323" /C:":56324"
exit /b 0

:run_app
title VMO AIMarTech App
cd /d "%~dp0"
set "PID_FILE=%~dp0.local-app-shell.pid"
for /f %%P in ('powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter ('ProcessId=' + $PID)).ParentProcessId"') do >"%PID_FILE%" echo %%P

echo ========================================
echo VMO AIMarTech Application
echo ========================================
echo App: http://127.0.0.1:8080/
echo Close with STOP-LOCAL.cmd or Ctrl+C.
echo.
call npm.cmd run dev
set "APP_EXIT=%ERRORLEVEL%"
del /q "%PID_FILE%" >nul 2>&1
echo.
echo Application process exited with code %APP_EXIT%.
echo Review any error above. This window will remain open.
exit /b %APP_EXIT%

:fail
echo.
echo Startup stopped. No system security policy was changed.
if "%NO_PAUSE%"=="0" pause
exit /b 1
