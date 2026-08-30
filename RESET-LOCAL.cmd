@echo off
setlocal EnableExtensions EnableDelayedExpansion

title VMO AIMarTech Local RESET
cd /d "%~dp0"
set "REPO=%~dp0"
set "PROJECT_ID=vmoaimartech-local"
set "LEGACY_PROJECT_ID=YOUR_SUPABASE_PROJECT_ID"
set "SUPABASE_PROJECT_ID=%PROJECT_ID%"
set "VITE_SUPABASE_PROJECT_ID=%PROJECT_ID%"
set "SUPABASE_TELEMETRY_DISABLED=1"
set "SUPABASE_PORTS=56320 56321 56322 56323 56324"

echo ========================================
echo VMO AIMarTech Local Factory Reset - RESET
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
if not exist "%REPO%START-LOCAL.cmd" (
  echo ERROR: START-LOCAL.cmd was not found beside RESET-LOCAL.cmd.
  goto fail
)
if not exist "%REPO%STOP-LOCAL.cmd" (
  echo ERROR: STOP-LOCAL.cmd was not found beside RESET-LOCAL.cmd.
  goto fail
)

powershell.exe -NoProfile -Command "$raw=Get-Content -LiteralPath '%REPO%supabase\config.toml' -Raw; if($raw -match '(?m)^\s*project_id\s*=\s*\"vmoaimartech-local\"\s*$'){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
  echo ERROR: Safety check failed. Expected project_id %PROJECT_ID%.
  echo No data was deleted.
  goto fail
)

echo WARNING: This permanently deletes ALL local data for this repository,
echo including PostgreSQL rows, Auth users, Storage objects and migration state.
echo Source code, node_modules, Docker Desktop and unrelated projects are NOT deleted.
echo.
set /p "CONFIRM=Type RESET-LOCAL to continue: "
if /I not "!CONFIRM!"=="RESET-LOCAL" (
  echo Reset cancelled. No data was deleted.
  pause
  exit /b 0
)

call :ensure_docker
if errorlevel 1 goto fail

echo.
echo Stopping web app and local Supabase stacks first...
call "%REPO%STOP-LOCAL.cmd" --no-pause

rem Remove current frozen-product local Supabase state.
echo.
echo Removing current local Supabase project %PROJECT_ID%...
call npm.cmd exec -- supabase stop --project-id "%PROJECT_ID%" --no-backup >nul 2>&1
call :remove_project_state "%PROJECT_ID%"

rem Remove ONLY the known stale predecessor created when the repository still
rem used the literal placeholder YOUR_SUPABASE_PROJECT_ID. This is what was
rem occupying ports 56321-56324 in the failure log.
echo Removing stale legacy local Supabase project %LEGACY_PROJECT_ID% if present...
call npm.cmd exec -- supabase stop --project-id "%LEGACY_PROJECT_ID%" --no-backup >nul 2>&1
call :remove_project_state "%LEGACY_PROJECT_ID%"

call :wait_ports_free 90
if errorlevel 1 goto fail

del /q "%REPO%.env.local" >nul 2>&1
del /q "%REPO%.env.local.tmp" >nul 2>&1
del /q "%REPO%.local-app-shell.pid" >nul 2>&1

echo.
echo Local state removed. Rebuilding through the SAME START-LOCAL path...
call "%REPO%START-LOCAL.cmd" --setup --no-pause
if errorlevel 1 (
  echo ERROR: Reset removed local state, but START-LOCAL failed.
  goto fail
)

echo.
echo ========================================
echo VMO AIMarTech Local Factory Reset - DONE
echo ========================================
echo Database/Auth/Storage: REBUILT FROM MIGRATIONS + SEED
echo App:   http://127.0.0.1:8080/
echo Setup: http://127.0.0.1:8080/setup
echo Studio:http://127.0.0.1:56323/
echo ========================================
echo.
echo RESET and START now share exactly the same startup path.
pause
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
  echo ERROR: Docker Desktop was not found. Start it manually and retry.
  exit /b 1
)
echo Launching Docker Desktop...
start "" "!DOCKER_DESKTOP!"
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

:remove_project_state
set "TARGET_PROJECT=%~1"
for /f "delims=" %%C in ('docker ps -a --format "{{.Names}}" 2^>nul ^| findstr /I /E /C:"_!TARGET_PROJECT!"') do docker rm -f "%%C" >nul 2>&1
for /f "delims=" %%V in ('docker volume ls --format "{{.Name}}" 2^>nul ^| findstr /I /C:"!TARGET_PROJECT!"') do docker volume rm -f "%%V" >nul 2>&1
for /f "delims=" %%N in ('docker network ls --format "{{.Name}}" 2^>nul ^| findstr /I /C:"!TARGET_PROJECT!"') do docker network rm "%%N" >nul 2>&1
exit /b 0

:wait_ports_free
set /a WAIT_SECONDS=%~1
set /a WAIT_TRIES=WAIT_SECONDS/2
if !WAIT_TRIES! LSS 1 set /a WAIT_TRIES=1
set /a WAIT_NOW=0
:wait_ports_loop
powershell.exe -NoProfile -Command "$ports=@(56320,56321,56322,56323,56324); $published=(& docker ps --format '{{.Ports}}' 2>$null) -join [Environment]::NewLine; foreach($p in $ports){if($published -match ('(?:0\.0\.0\.0|\[::\]):'+$p+'->')){exit 1}}; try{$listeners=Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object{$ports -contains $_.LocalPort}; if($listeners){exit 1}}catch{}; exit 0" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a WAIT_NOW+=1
if !WAIT_NOW! GEQ !WAIT_TRIES! (
  echo ERROR: Ports %SUPABASE_PORTS% are still occupied after %~1 seconds.
  call :show_port_blockers
  exit /b 1
)
timeout /t 2 /nobreak >nul
echo Waiting for local Supabase ports to become reusable... !WAIT_NOW!/!WAIT_TRIES!
goto wait_ports_loop

:show_port_blockers
echo.
echo Docker containers publishing local Supabase ports:
docker ps --format "{{.ID}}  {{.Names}}  {{.Ports}}" 2>nul | findstr /C:"56320" /C:"56321" /C:"56322" /C:"56323" /C:"56324"
echo.
echo Windows listeners on those ports:
netstat -ano 2>nul | findstr /C:":56320" /C:":56321" /C:":56322" /C:":56323" /C:":56324"
exit /b 0

:fail
echo.
echo Reset stopped. Docker Desktop and unrelated projects were not modified.
pause
exit /b 1
