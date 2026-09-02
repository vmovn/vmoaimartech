# Stops the launcher-managed local Vite process for this repository only.
# Used by STOP-LOCAL.cmd. Exit 0 if a matching process was stopped, 2 if none.

$ErrorActionPreference = "SilentlyContinue"
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..")).TrimEnd("\")
$pidFile = Join-Path $repo ".local-app-shell.pid"
$stopped = $false

function Stop-ProcessTree([int] $ProcessId) {
  if ($ProcessId -le 0) { return $false }
  $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $ProcessId)
  if (-not $process) { return $false }
  & taskkill.exe /PID $ProcessId /T /F 1>$null 2>$null
  return $true
}

function Get-ProcessCommandLine($process) {
  if (-not $process) { return "" }
  return [string]$process.CommandLine
}

function Test-LauncherCmd($process) {
  if (-not $process -or $process.Name -ne "cmd.exe") { return $false }
  $commandLine = Get-ProcessCommandLine $process
  return ($commandLine -match "START-LOCAL\.cmd" -and $commandLine -match "--run-app")
}

function Test-RepoNode($process) {
  if (-not $process -or $process.Name -notmatch "node") { return $false }
  $commandLine = Get-ProcessCommandLine $process
  $repoPattern = [regex]::Escape($repo)
  return ($commandLine -match $repoPattern) -or ($commandLine -match "vite" -and $commandLine -match "8080")
}

if (Test-Path -LiteralPath $pidFile) {
  $raw = ((Get-Content -LiteralPath $pidFile -Raw) -replace "[^\d]", "")
  if ($raw -match "^\d+$") {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $raw)
    if (Test-LauncherCmd $process) {
      if (Stop-ProcessTree ([int]$raw)) { $stopped = $true }
    }
  }
  Remove-Item -LiteralPath $pidFile -Force
}

Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | ForEach-Object {
  $commandLine = Get-ProcessCommandLine $_
  if ($commandLine -match "START-LOCAL\.cmd" -and $commandLine -match "--run-app" -and $commandLine -match [regex]::Escape($repo)) {
    if (Stop-ProcessTree ([int]$_.ProcessId)) { $stopped = $true }
  }
}

Get-Process | Where-Object { $_.MainWindowTitle -eq "VMO AIMarTech App" } | ForEach-Object {
  if (Stop-ProcessTree ([int]$_.Id)) { $stopped = $true }
}

$listenAddresses = @("127.0.0.1", "::1", "0.0.0.0", "::")
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -eq 8080 -and $listenAddresses -contains $_.LocalAddress }
foreach ($listener in $listeners) {
  $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $listener.OwningProcess)
  if (Test-RepoNode $process) {
    if (Stop-ProcessTree ([int]$process.ProcessId)) { $stopped = $true }
  }
}

if ($stopped) { exit 0 }
exit 2
