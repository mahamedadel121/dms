# Double-click / run in PowerShell:  .\start-demo.ps1   (add -Rebuild to rebuild the web app)
param([switch]$Rebuild)
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host 'pnpm not found. Install Node 22+ then: npm install -g pnpm' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}
$extra = @()
if ($Rebuild) { $extra += '--rebuild' }
pnpm demo @extra
Read-Host 'Demo stopped. Press Enter to close'
