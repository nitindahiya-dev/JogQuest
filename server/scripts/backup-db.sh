#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?Set DATABASE_URL before running this script}"

BACKUP_DIR="${BACKUP_DIR:-$HOME/jogquest-backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

command -v pg_dump >/dev/null || {
  echo "Error: pg_dump is not installed." >&2
  exit 1
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BACKUP_DIR/jogquest-$timestamp.dump"
temporary="$output.partial"

trap 'rm -f "$temporary"' EXIT

pg_dump --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$temporary"

test -s "$temporary"
mv "$temporary" "$output"
sha256sum "$output" > "$output.sha256"

echo "Backup created: $output"
echo "Checksum created: $output.sha256"
echo "Copy both files to secure off-device storage."
