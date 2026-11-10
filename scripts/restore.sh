#!/usr/bin/env bash
# Restore of the DMS database (pg_restore of a custom-format dump) and, optionally, of the storage archive.
# DESTRUCTIVE for the target database: objects are dropped and recreated (--clean --if-exists).
# Stop the api, worker and bot before restoring. See docs/BACKUP_RESTORE.md.
#
# Usage:
#   scripts/restore.sh --dump <file.dump> [--storage <storage-*.tar.gz>] [--yes]
#
# Without --yes the script asks you to type RESTORE. The existing storage folder is never deleted:
# it is renamed to <STORAGE_ROOT>.before-restore-<time> first.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

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

native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

usage() {
  cat <<'EOF'
usage: scripts/restore.sh --dump <file.dump> [--storage <storage-*.tar.gz>] [--yes]
  --dump     pg_dump custom-format file made by scripts/backup.sh (required)
  --storage  storage archive made by scripts/backup.sh (optional)
  --yes      skip the RESTORE confirmation prompt
See docs/BACKUP_RESTORE.md.
EOF
  exit 2
}

DUMP=""
STORAGE_ARCHIVE=""
ASSUME_YES="0"
while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="${2:-}"; shift 2 ;;
    --storage) STORAGE_ARCHIVE="${2:-}"; shift 2 ;;
    --yes) ASSUME_YES="1"; shift ;;
    -h|--help) usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

if [ -z "$DUMP" ]; then usage; fi
if [ ! -f "$DUMP" ]; then echo "dump file not found: $DUMP" >&2; exit 1; fi
if [ -n "$STORAGE_ARCHIVE" ] && [ ! -f "$STORAGE_ARCHIVE" ]; then
  echo "storage archive not found: $STORAGE_ARCHIVE" >&2
  exit 1
fi

DATABASE_URL="$(read_var DATABASE_URL)"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres@localhost:54329/dms}"
STORAGE_ROOT="$(read_var STORAGE_ROOT)"
STORAGE_ROOT="${STORAGE_ROOT:-./storage-data}"
PG_BIN="$(read_var PG_BIN)"

case "$STORAGE_ROOT" in
  /*|[A-Za-z]:*) STORAGE_DIR="$STORAGE_ROOT" ;;
  *) STORAGE_DIR="$REPO_ROOT/${STORAGE_ROOT#./}" ;;
esac

PG_RESTORE="pg_restore"
if [ -n "$PG_BIN" ]; then PG_RESTORE="$PG_BIN/pg_restore"; fi

# database name = last path segment of the URL, without query string
TARGET_DB="${DATABASE_URL%%\?*}"
TARGET_DB="${TARGET_DB##*/}"

echo "Target database : $TARGET_DB  (from DATABASE_URL)"
echo "Dump file       : $DUMP"
if [ -n "$STORAGE_ARCHIVE" ]; then
  echo "Storage archive : $STORAGE_ARCHIVE  -> $STORAGE_DIR (current folder is renamed, not deleted)"
fi
echo "This replaces the data in $TARGET_DB. Stop the api, worker and bot first."

if [ "$ASSUME_YES" != "1" ]; then
  printf 'Type RESTORE to continue: '
  read -r answer || answer=""
  if [ "$answer" != "RESTORE" ]; then
    echo "cancelled, nothing changed"
    exit 1
  fi
fi

echo "[restore] database <- $DUMP"
"$PG_RESTORE" --clean --if-exists --no-owner --no-privileges \
  --dbname "$DATABASE_URL" "$(native_path "$DUMP")"

if [ -n "$STORAGE_ARCHIVE" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  tar -xzf "$STORAGE_ARCHIVE" -C "$TMP_DIR"
  EXTRACTED="$TMP_DIR/$(basename "$STORAGE_DIR")"
  if [ ! -d "$EXTRACTED" ]; then
    echo "archive does not contain a folder named $(basename "$STORAGE_DIR"); nothing moved" >&2
    exit 1
  fi
  if [ -e "$STORAGE_DIR" ]; then
    mv "$STORAGE_DIR" "$STORAGE_DIR.before-restore-$STAMP"
    echo "[restore] old storage kept at $STORAGE_DIR.before-restore-$STAMP"
  fi
  mkdir -p "$(dirname "$STORAGE_DIR")"
  mv "$EXTRACTED" "$STORAGE_DIR"
  echo "[restore] storage <- $STORAGE_ARCHIVE"
fi

echo "[restore] done. Start the services again and check /api/v1/health."
