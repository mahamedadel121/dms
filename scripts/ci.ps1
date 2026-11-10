# Local CI: runs on this machine only (no hosted CI, no GitHub).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
foreach ($step in 'db:up', 'db:migrate', 'lint', 'typecheck', 'test') {
  pnpm $step
  if ($LASTEXITCODE -ne 0) { throw "step failed: $step" }
}
Write-Host 'CI OK'
