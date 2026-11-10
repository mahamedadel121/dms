#!/usr/bin/env bash
# Backup of the DMS database (pg_dump, custom format) and of the storage directory (tar.gz).
# Read-only for the database and the storage folder. See docs/BACKUP_RESTORE.md.
#
# Usage:   scripts/backup.sh
# Env (optional, else read from the repo .env):
#   DATABASE_URL   default postgresql://postgres@localhost:54329/dms
#   STORAGE_ROOT   default ./storage-data (relative paths are relative to the repo root)
#   PG_BIN         folder with pg_dump; default: pg_dump from PATH
#   BACKUP_DIR     default <repo>/../dms-backups (outside the repo on purpose)
#   RETAIN_DAYS    default 14 (older backup files in BACKUP_DIR are deleted)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

# Reads KEY from the environment, else from .env. The file is not sourced (values may contain special characters).
read_var() {
  local key="$1"
  local val="${!key:-}"
  if [ -z "$val" ] && [ -f "$ENV_FILE" ]; then
    val="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r' || true)"
    val="${val%\"}"
    val="${val#\"}"
  fi
  printf '%s' "$val"
}

# Windows binaries need Windows paths when Git Bash is used.
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

DATABASE_URL="$(read_var DATABASE_URL)"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres@localhost:54329/dms}"
STORAGE_ROOT="$(read_var STORAGE_ROOT)"
STORAGE_ROOT="${STORAGE_ROOT:-./storage-data}"
PG_BIN="$(read_var PG_BIN)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/../dms-backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

case "$STORAGE_ROOT" in
  /*|[A-Za-z]:*) STORAGE_DIR="$STORAGE_ROOT" ;;
  *) STORAGE_DIR="$REPO_ROOT/${STORAGE_ROOT#./}" ;;
esac

PG_DUMP="pg_dump"
if [ -n "$PG_BIN" ]; then PG_DUMP="$PG_BIN/pg_dump"; fi

if [ ! -d "$STORAGE_DIR" ]; then
  echo "storage directory not found: $STORAGE_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="$BACKUP_DIR/dms-$STAMP.dump"
STORAGE_FILE="$BACKUP_DIR/storage-$STAMP.tar.gz"

cleanup_partial() {
  rm -f "$DUMP_FILE" "$STORAGE_FILE"
}
trap cleanup_partial ERR

echo "[backup] database -> $DUMP_FILE"
"$PG_DUMP" --format=custom --no-owner --no-privileges \
  --file "$(native_path "$DUMP_FILE")" "$DATABASE_URL"

echo "[backup] storage  -> $STORAGE_FILE"
tar -czf "$STORAGE_FILE" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"

trap - ERR

if [ "$RETAIN_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 \( -name 'dms-*.dump' -o -name 'storage-*.tar.gz' \) -mtime +"$RETAIN_DAYS" -print -delete
fi

echo "[backup] done"
echo "[backup] keep the .dump and the .tar.gz TOGETHER: they are one restore point"
