# Update a Paperclip issue (status and/or comment) with a multiline markdown body.
#
# PowerShell counterpart to paperclip-issue-update.sh, for agents whose shell tool
# runs PowerShell (Codex CLI on Windows). A headless PowerShell 5.1 session has
# $OutputEncoding = ASCII, so piping non-ASCII text to a native command such as
# curl.exe replaces every Hangul character with "?" and the original bytes are
# gone for good. This script never pipes into curl: it writes the JSON to a
# UTF-8 file (no BOM) and passes the file path as an argument, which is safe.
#
# Usage:
#   $body = "작업 완료" + [char]10 + [char]10 + "- 확인함"
#   .paperclip-issue-update.ps1 -Body $body -Status done
#
#   Get-Content -Raw notes.md | .paperclip-issue-update.ps1 -Status in_review
#
# Required environment: PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_RUN_ID
#                       PAPERCLIP_TASK_ID unless -IssueId is given

[CmdletBinding()]
param(
  [Parameter(ValueFromPipeline = $true)][string] $Body,
  [string] $IssueId = $env:PAPERCLIP_TASK_ID,
  [ValidateSet("backlog","todo","in_progress","in_review","done","blocked","cancelled")]
  [string] $Status,
  [switch] $DryRun
)

begin { $collected = New-Object System.Collections.Generic.List[string] }
process { if ($null -ne $Body) { $collected.Add($Body) } }

end {
  $ErrorActionPreference = "Stop"

  $lf = [char]10
  $text = ($collected -join $lf).Replace([string][char]13, "").TrimEnd()
  if ([string]::IsNullOrWhiteSpace($text)) {
    Write-Error "Empty body. Pass -Body or pipe the markdown in."
    exit 1
  }
  if ([string]::IsNullOrWhiteSpace($IssueId)) {
    Write-Error "No issue id. Pass -IssueId or set PAPERCLIP_TASK_ID."
    exit 1
  }

  if ($Status) {
    $payload = @{ status = $Status; comment = $text }
    $method  = "PATCH"
    $suffix  = "/api/issues/$IssueId"
  } else {
    $payload = @{ body = $text }
    $method  = "POST"
    $suffix  = "/api/issues/$IssueId/comments"
  }
  $json = $payload | ConvertTo-Json -Compress -Depth 4

  if ($DryRun) {
    Write-Output "$method $suffix"
    Write-Output $json
    return
  }

  foreach ($name in @("PAPERCLIP_API_URL","PAPERCLIP_API_KEY","PAPERCLIP_RUN_ID")) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      Write-Error "Missing $name."
      exit 1
    }
  }

  # Accept both ".../api" and bare origins for PAPERCLIP_API_URL.
  $apiBase = $env:PAPERCLIP_API_URL.TrimEnd("/")
  if ($apiBase.EndsWith("/api")) { $apiBase = $apiBase.Substring(0, $apiBase.Length - 4) }
  $url = "$apiBase$suffix"

  # UTF-8 without BOM: a BOM would land inside the JSON body.
  $tmp = [IO.Path]::GetTempPath()
  $bodyFile = Join-Path $tmp ("paperclip-issue-update-" + [Guid]::NewGuid().ToString("N") + ".json")
  $respFile = Join-Path $tmp ("paperclip-issue-resp-" + [Guid]::NewGuid().ToString("N") + ".json")
  [IO.File]::WriteAllText($bodyFile, $json, [Text.UTF8Encoding]::new($false))

  try {
    # curl.exe (not the PowerShell "curl" alias). The body is an argument, never piped.
    $codeText = & curl.exe -sS -X $method $url `
      -H "Authorization: Bearer $env:PAPERCLIP_API_KEY" `
      -H "X-Paperclip-Run-Id: $env:PAPERCLIP_RUN_ID" `
      -H "Content-Type: application/json; charset=utf-8" `
      -o $respFile -w "%{http_code}" `
      --data-binary "@$bodyFile"

    $codeText = ($codeText | Out-String).Trim()
    $code = 0
    [void][int]::TryParse($codeText, [ref]$code)
    $output = ""
    if (Test-Path -LiteralPath $respFile) {
      $output = [IO.File]::ReadAllText($respFile, [Text.UTF8Encoding]::new($false))
    }

    if ($code -lt 200 -or $code -ge 300) {
      Write-Error "Paperclip API $method $suffix failed with HTTP $codeText$lf$output"
      exit 1
    }
    Write-Output $output
  } finally {
    Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $respFile -Force -ErrorAction SilentlyContinue
  }
}
