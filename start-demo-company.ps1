# Double-click / run in PowerShell:  .\start-demo-company.ps1   (add -Reset to wipe and reseed, -Rebuild to rebuild the web app)
param([switch]$Reset, [switch]$Rebuild)
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host 'pnpm not found. Install Node 22+ then: npm install -g pnpm' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}
$extra = @()
if ($Reset) { $extra += '--reset' }
if ($Rebuild) { $extra += '--rebuild' }
pnpm demo:company @extra
Write-Host ''
Write-Host 'The demo servers keep running in the background. To stop them: pnpm demo:company:stop' -ForegroundColor Yellow
Read-Host 'Press Enter to close this window (the demo keeps running)'
