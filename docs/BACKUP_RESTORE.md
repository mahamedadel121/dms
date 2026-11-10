# Backup and restore

A DMS restore point is **two files that belong together**:

| File | What it is | Made by |
|---|---|---|
| `dms-<stamp>.dump` | Logical dump of the PostgreSQL database (`pg_dump --format=custom`) | `pg_dump` |
| `storage-<stamp>.tar.gz` | Archive of the storage folder (`STORAGE_ROOT`, default `storage-data/`): receipts, thumbnails, final PDFs, signatures, logos, SAP export files | `tar` |

Restoring only the database leaves the receipts and final PDFs missing, so always keep both files from the same run.

The scripts are read-only for the database and the storage folder. They never touch `.env`: keep a separate copy of `.env` (it holds `JWT_SECRET`, `FILE_URL_SECRET` and the S/4HANA password) in a safe place.

## Where things are

- Scripts: `scripts/backup.ps1` and `scripts/restore.ps1` (Windows PowerShell 5.1), `scripts/backup.sh` and `scripts/restore.sh` (Git Bash or Linux). The two pairs write and read the same formats.
- Settings are read from the environment first, then from the repo `.env`:
  - `DATABASE_URL`: default `postgresql://postgres@localhost:54329/dms` (the local cluster started by `pnpm db:up`). Any other PostgreSQL URL works the same way.
  - `STORAGE_ROOT`: default `./storage-data`, relative to the repo root.
  - `PG_BIN`: folder with `pg_dump` and `pg_restore`. Default on Windows: `C:\Program Files\PostgreSQL\17\bin`. On Linux leave it empty to use the binaries from `PATH`.
  - `BACKUP_DIR`: default `..\dms-backups` (one level above the repo, so dumps are not committed by accident).
  - `RETAIN_DAYS`: default `14`. Older `dms-*.dump` and `storage-*.tar.gz` files in `BACKUP_DIR` are deleted by the backup script.

## Make a backup

Windows (PowerShell):

```powershell
cd "C:\Users\Administrator\Downloads\new project\Dooo"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1
```

Git Bash or Linux:

```bash
cd /path/to/Dooo
bash scripts/backup.sh
```

Each run prints the two file names. The output looks like `dms-20261110-193953.dump` and `storage-20261110-193953.tar.gz`.

A failed run deletes the partial files and exits with an error. Check the exit code before you trust a backup.

To use a different folder for one run, set `BACKUP_DIR` first (for example `$env:BACKUP_DIR = "D:\dms-backups"` in PowerShell, or `BACKUP_DIR=/mnt/backup bash scripts/backup.sh`).

## Daily schedule

Take the backup while the system is quiet, for example at 02:00. A backup taken while the services are running is still consistent for the database (`pg_dump` works on a snapshot), but a request submitted during the storage archive step can have its receipt file missing from the archive. A quiet hour avoids that.

### Windows Task Scheduler

Run once from PowerShell (or create the task in the Task Scheduler UI with the same command). The task runs while the user is logged on; for an unattended server, set the "Run whether user is logged on or not" option in the UI:

```powershell
schtasks /Create /SC DAILY /ST 02:00 /TN "DMS backup" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\Users\Administrator\Downloads\new project\Dooo\scripts\backup.ps1\""
```

Adjust the path and the time. Check the result in Task Scheduler (History) the next morning, and check that `..\dms-backups` has a new pair of files.

### cron (Linux, or Git Bash on Windows through a wrapper)

```cron
# m h dom mon dow  command
0 2 * * * cd /path/to/Dooo && bash scripts/backup.sh >> /var/log/dms-backup.log 2>&1
```

Make sure `pg_dump` is on the cron `PATH` (or set `PG_BIN`). Cron starts with a small environment.

## Copy off the machine

Backups in `..\dms-backups` on the same disk do not protect against disk loss. Copy the newest pair to another disk or a network share at least once a week. This is a manual step. The project has no cloud upload.

## Restore

### Before you start

1. Stop the services so that nothing writes during the restore: stop `pnpm dev` (api, web, worker, and bot if running) with Ctrl+C.
2. Choose the pair to restore: the `dms-<stamp>.dump` and the `storage-<stamp>.tar.gz` with the same stamp.
3. Optional but recommended: restore into a scratch database first to check the dump. Create one with `"C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 54329 -U postgres -c "CREATE DATABASE dms_check"`, run the restore with `DATABASE_URL=postgresql://postgres@localhost:54329/dms_check`, then drop it.

### Restore (PowerShell)

```powershell
cd "C:\Users\Administrator\Downloads\new project\Dooo"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore.ps1 `
  -Dump "..\dms-backups\dms-20261110-193953.dump" `
  -Storage "..\dms-backups\storage-20261110-193953.tar.gz"
```

Without `-Yes` the script shows what it will replace and asks you to type `RESTORE`. Anything else cancels with nothing changed. Use `-Yes` only in a script you have already tested.

### Restore (Git Bash or Linux)

```bash
bash scripts/restore.sh --dump ../dms-backups/dms-20261110-193953.dump \
  --storage ../dms-backups/storage-20261110-193953.tar.gz
```

Add `--yes` to skip the prompt. `--dump` is required; `--storage` and `--yes` are optional.

### What the restore does

- **Database:** `pg_restore --clean --if-exists --no-owner --no-privileges` into the database named in `DATABASE_URL`. Existing tables are dropped and recreated from the dump, so the data in that database is replaced.
- **Storage:** the archive is extracted to a temporary folder. The current storage folder is **renamed** to `storage-data.before-restore-<time>` and the restored folder takes its place. Nothing is deleted. Delete the renamed folder by hand once you are sure the restore is good.

### After the restore

1. Start the services again (`pnpm dev`).
2. Check the API: open `http://localhost:4000/api/v1/health` (it should answer OK).
3. Sign in as a seeded user (for example `admin`) and open a request with a receipt image. The image and the PDF must open.
4. If you restored a dump taken before a SAP posting was made, check the SAP monitor (`/sap`) for postings that are still pending. See `docs/SAP_INTEGRATION.md`.

## What was tested

Tested on the build machine on 2026-11-10 against the local PostgreSQL 17 cluster on port 54329:

- `backup.sh` and `backup.ps1` each wrote a `.dump` (about 175 KB) and a `.tar.gz` (about 300 KB).
- `restore.ps1` without `-Yes` with a wrong answer: cancelled, exit code 1, nothing changed.
- `restore.ps1 -Yes` and `restore.sh --yes` into a scratch database (`dms_wp9_restore_test`, dropped afterwards): 48 tables restored; the storage archive extracted; a second run renamed the existing storage folder to `*.before-restore-*` instead of deleting it.
- Not tested: scheduled runs (Task Scheduler and cron are documented examples only) and restores on another machine.

## S3 / MinIO storage

Set `STORAGE_DRIVER=s3` with `S3_BUCKET` (required), `S3_REGION`, `S3_ENDPOINT` (MinIO URL; empty for AWS), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (true for MinIO) and optionally `S3_PREFIX`. Files are stored under the same keys as in the local folder, with the prefix in front.

- **Bucket versioning**: enable it on the bucket, so an overwritten or deleted object can be recovered.
- **What to back up**: the database dump and the bucket (or the prefix). `backup.ps1` / `backup.sh` archive only the local `STORAGE_ROOT`; with the S3 driver they do not copy the bucket. Use bucket replication, `aws s3 sync s3://bucket/prefix <backup-location>` or `mc mirror`.
- **Migrate existing local files**: `aws s3 sync storage-data s3://bucket/prefix` (add `--endpoint-url http://minio:9000` for MinIO), then switch `STORAGE_DRIVER=s3` and restart. Keys are unchanged, so existing database rows keep working.
- **Direct downloads**: `S3_PRESIGNED_REDIRECT=true` makes `GET /api/v1/files/...` answer 302 to a presigned S3 URL (valid at most 5 minutes) instead of streaming the file through the API. The browser must be able to reach the S3 endpoint. Leave it false to proxy.
