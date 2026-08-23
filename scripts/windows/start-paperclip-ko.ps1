[CmdletBinding()]
param(
  [string]$DataDir = (Join-Path $env:LOCALAPPDATA "Paperclip-KO"),
  [string]$InstanceId = "default"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$healthUrl = "http://127.0.0.1:3100/api/health"
$expectedBranch = (& git -C $repoRoot branch --show-current).Trim()

$health = $null
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
} catch {
  # No healthy local instance is running yet.
}

if ($health.status -eq "ok") {
  $runningBranch = $health.serverInfo.git.branchName
  if ($runningBranch -and $expectedBranch -and $runningBranch -ne $expectedBranch) {
    throw "Port 3100 is already used by Paperclip branch '$runningBranch'. Stop it before starting '$expectedBranch'."
  }
  Start-Process "http://127.0.0.1:3100"
  Write-Host "Paperclip is already running at http://127.0.0.1:3100" -ForegroundColor Green
  exit 0
}

$env:PAPERCLIP_HOME = $DataDir
$env:PAPERCLIP_INSTANCE_ID = $InstanceId
$env:PAPERCLIP_ENABLE_COMPANY_DELETION = "false"

Set-Location -LiteralPath $repoRoot
Write-Host "Starting Paperclip Korean edition..." -ForegroundColor Cyan
Write-Host "Data: $DataDir" -ForegroundColor DarkGray
Write-Host "Close this window or press Ctrl+C to stop Paperclip." -ForegroundColor DarkGray

# Open the board after the local server becomes healthy. The background job
# keeps startup non-blocking while the foreground process continues to show logs.
Start-Job -ScriptBlock {
  param([string]$Url)

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri $Url -TimeoutSec 2
      if ($response.status -eq "ok") {
        Start-Process $Url
        break
      }
    } catch {
      # The server is still starting.
    }
    Start-Sleep -Seconds 1
  }
} -ArgumentList $healthUrl | Out-Null

& corepack pnpm paperclipai run --data-dir $DataDir --instance $InstanceId
if ($LASTEXITCODE -ne 0) {
  throw "Paperclip exited with code $LASTEXITCODE."
}
