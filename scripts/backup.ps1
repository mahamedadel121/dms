# Backup of the DMS database (pg_dump, custom format) and of the storage folder (tar.gz).
# Windows PowerShell 5.1. Same output format as scripts/backup.sh. See docs/BACKUP_RESTORE.md.
#
# Usage:   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1
# Settings are read from the environment first, then from the repo .env:
#   DATABASE_URL  default postgresql://postgres@localhost:54329/dms
#   STORAGE_ROOT  default ./storage-data (relative to the repo root)
#   PG_BIN        default C:\Program Files\PostgreSQL\17\bin
#   BACKUP_DIR    default <repo>\..\dms-backups (outside the repo on purpose)
#   RETAIN_DAYS   default 14 (older dms-*.dump and storage-*.tar.gz in BACKUP_DIR are deleted)
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repoRoot '.env'

function Get-Setting([string]$key) {
  $fromEnv = [Environment]::GetEnvironmentVariable($key)
  if ($fromEnv) { return $fromEnv }
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match "^$key=(.*)$") { return $Matches[1].Trim().Trim('"') }
    }
  }
  return ''
}

$databaseUrl = Get-Setting 'DATABASE_URL'
if (-not $databaseUrl) { $databaseUrl = 'postgresql://postgres@localhost:54329/dms' }

$storageRoot = Get-Setting 'STORAGE_ROOT'
if (-not $storageRoot) { $storageRoot = './storage-data' }
if ([System.IO.Path]::IsPathRooted($storageRoot)) {
  $storageDir = $storageRoot
} else {
  $storageDir = Join-Path $repoRoot (($storageRoot -replace '^\./', '') -replace '/', '\')
}
$storageDir = [System.IO.Path]::GetFullPath($storageDir)
if (-not (Test-Path $storageDir)) { throw "storage directory not found: $storageDir" }

$pgBin = Get-Setting 'PG_BIN'
if (-not $pgBin) { $pgBin = 'C:\Program Files\PostgreSQL\17\bin' }
$pgDump = Join-Path $pgBin 'pg_dump.exe'
if (-not (Test-Path $pgDump)) { throw "pg_dump.exe not found in '$pgBin'. Set PG_BIN in .env." }

$backupDir = Get-Setting 'BACKUP_DIR'
if (-not $backupDir) { $backupDir = Join-Path (Split-Path $repoRoot -Parent) 'dms-backups' }

$retainDays = 14
$retainSetting = Get-Setting 'RETAIN_DAYS'
if ($retainSetting) { $retainDays = [int]$retainSetting }

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpFile = Join-Path $backupDir "dms-$stamp.dump"
$storageFile = Join-Path $backupDir "storage-$stamp.tar.gz"

try {
  Write-Host "[backup] database -> $dumpFile"
  & $pgDump --format=custom --no-owner --no-privileges --file $dumpFile $databaseUrl
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

  Write-Host "[backup] storage  -> $storageFile"
  $parent = Split-Path $storageDir -Parent
  $leaf = Split-Path $storageDir -Leaf
  & tar.exe -czf $storageFile -C $parent $leaf
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} catch {
  Remove-Item -Force -ErrorAction SilentlyContinue $dumpFile, $storageFile
  throw
}

if ($retainDays -gt 0) {
  $limit = (Get-Date).AddDays(-$retainDays)
  Get-ChildItem -Path $backupDir -File |
    Where-Object { ($_.Name -like 'dms-*.dump' -or $_.Name -like 'storage-*.tar.gz') -and $_.LastWriteTime -lt $limit } |
    ForEach-Object {
      Write-Host "[backup] deleting old $($_.Name)"
      Remove-Item -Force $_.FullName
    }
}

Write-Host '[backup] done'
Write-Host '[backup] keep the .dump and the .tar.gz TOGETHER: they are one restore point'
