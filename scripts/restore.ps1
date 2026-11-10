# Restore of the DMS database (pg_restore of a custom-format dump) and, optionally, of the storage archive.
# Windows PowerShell 5.1. DESTRUCTIVE for the target database (--clean --if-exists).
# Stop the api, worker and bot before restoring. See docs/BACKUP_RESTORE.md.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore.ps1 -Dump <file.dump> [-Storage <storage-*.tar.gz>] [-Yes]
#
# Without -Yes you are asked to type RESTORE. The current storage folder is renamed
# (<STORAGE_ROOT>.before-restore-<time>), never deleted.
param(
  [Parameter(Mandatory = $true)][string]$Dump,
  [string]$Storage,
  [switch]$Yes
)
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

if (-not (Test-Path $Dump)) { throw "dump file not found: $Dump" }
if ($Storage -and -not (Test-Path $Storage)) { throw "storage archive not found: $Storage" }

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

$pgBin = Get-Setting 'PG_BIN'
if (-not $pgBin) { $pgBin = 'C:\Program Files\PostgreSQL\17\bin' }
$pgRestore = Join-Path $pgBin 'pg_restore.exe'
if (-not (Test-Path $pgRestore)) { throw "pg_restore.exe not found in '$pgBin'. Set PG_BIN in .env." }

$withoutParams = ($databaseUrl -split '\?')[0]
$targetDb = $withoutParams.Substring($withoutParams.LastIndexOf('/') + 1)

Write-Host "Target database : $targetDb  (from DATABASE_URL)"
Write-Host "Dump file       : $Dump"
if ($Storage) { Write-Host "Storage archive : $Storage  -> $storageDir (current folder is renamed, not deleted)" }
Write-Host "This replaces the data in $targetDb. Stop the api, worker and bot first."

if (-not $Yes) {
  $answer = Read-Host 'Type RESTORE to continue'
  if ($answer -ne 'RESTORE') {
    Write-Host 'cancelled, nothing changed'
    exit 1
  }
}

Write-Host "[restore] database <- $Dump"
& $pgRestore --clean --if-exists --no-owner --no-privileges --dbname $databaseUrl $Dump
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }

if ($Storage) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('dms-restore-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    & tar.exe -xzf $Storage -C $tmp
    if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }

    $leaf = Split-Path $storageDir -Leaf
    $extracted = Join-Path $tmp $leaf
    if (-not (Test-Path $extracted)) { throw "archive does not contain a folder named $leaf; nothing moved" }

    if (Test-Path $storageDir) {
      $kept = "$leaf.before-restore-$stamp"
      Rename-Item -Path $storageDir -NewName $kept
      Write-Host "[restore] old storage kept at $(Join-Path (Split-Path $storageDir -Parent) $kept)"
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $storageDir -Parent) | Out-Null
    Move-Item -Path $extracted -Destination $storageDir
    Write-Host "[restore] storage <- $Storage"
  } finally {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $tmp
  }
}

Write-Host '[restore] done. Start the services again and check /api/v1/health.'
