#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

echo "Backing up Postgres…"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/commercecore-$STAMP.sql.gz"

if [ -n "${S3_ENDPOINT:-}" ] && command -v mc >/dev/null 2>&1; then
  echo "Syncing object storage…"
  mc mirror --overwrite "${S3_ALIAS:-minio}/${S3_BUCKET:-commercecore}" "$BACKUP_DIR/assets-$STAMP" >/dev/null
fi

echo "Backup written to $BACKUP_DIR/commercecore-$STAMP.sql.gz"
