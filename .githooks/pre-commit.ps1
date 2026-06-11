#!/usr/bin/env pwsh
# Pre-commit hook: detect and convert UTF-16 LE files to UTF-8 (no BOM).
# Workaround for AI agents on Windows that bypass editor encoding settings.

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$staged = (& git diff --cached --name-only --diff-filter=ACMRT)

if (-not $staged) { exit 0 }

$fixed = @()
foreach ($rel in $staged) {
  if (-not (Test-Path -LiteralPath $rel)) { continue }
  $bytes = [System.IO.File]::ReadAllBytes($rel)
  if ($bytes.Length -lt 2) { continue }
  if ($bytes[0] -ne 0xFF -or $bytes[1] -ne 0xFE) { continue }

  $text = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $rel), [System.Text.Encoding]::Unicode)
  [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $rel), $text, $utf8NoBom)
  & git add -- $rel
  $fixed += $rel
}

if ($fixed.Count -gt 0) {
  Write-Host "[pre-commit] Converted $($fixed.Count) UTF-16 file(s) to UTF-8:" -ForegroundColor Yellow
  $fixed | ForEach-Object { Write-Host "  - $_" }
}
exit 0
