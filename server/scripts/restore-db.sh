#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?Set DATABASE_URL before running this script}"
BACKUP="${1:?Usage: restore-db.sh /path/to/backup.dump}"

if [[ ! -f "$BACKUP" ]]; then
  echo "Error: backup file not found." >&2
  exit 1
fi

echo "WARNING: this restores into the database specified by DATABASE_URL."
echo "Use a separate, empty recovery database whenever possible."
read -r -p "Type RESTORE to continue: " confirmation
[[ "$confirmation" == "RESTORE" ]] || {
  echo "Restore cancelled."
  exit 1
}

pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$BACKUP"

echo "Restore command completed. Application-level recovery still needs validation."
