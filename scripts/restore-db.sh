#!/usr/bin/env bash
# ALM PostgreSQL restore script (R2-2).
#
# Usage: restore-db.sh <target-db-name> [--yes] [dump-file]
#   $1      target database name — it will be DROPPED and recreated!
#   --yes   REQUIRED safety flag; the script refuses to run without it.
#   $2      optional dump file; default = newest alm-*.sql.gz in the
#           backup dir (/home/node/.openclaw/backups/alm).
#
# Restore strategy: drop-recreate the target database, then load the dump.
# Dump format is auto-detected: custom format (PGDMP magic) is loaded via
# pg_restore; plain-SQL dumps (what backup-db.sh produces, .sql.gz) are
# loaded via psql.
#
# The connection (host/port/user/password) is derived from DATABASE_URL
# parsed out of server/.env by grep (never trusts process.env); only the
# database name is replaced with the requested target.

set -uo pipefail

REPO_DIR="."
ENV_FILE="$REPO_DIR/server/.env"
BACKUP_DIR="/home/node/.openclaw/backups/alm"

export PATH=/usr/local/bin:/usr/bin:/bin

usage() {
  cat <<EOF
Usage: $0 <target-db-name> [--yes] [dump-file]

  <target-db-name>  database to restore into (DROPPED and recreated!)
  --yes             REQUIRED confirmation flag
  [dump-file]       dump to restore; default = newest alm-*.sql.gz in $BACKUP_DIR

Example (scratch test): $0 alm_restore_test --yes
EOF
}

# --- parse args ---
TARGET_DB=""
DUMP_FILE=""
CONFIRMED=0
for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRMED=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "ERROR: unknown option: $arg" >&2; usage >&2; exit 1 ;;
    *)
      if [ -z "$TARGET_DB" ]; then TARGET_DB="$arg"
      elif [ -z "$DUMP_FILE" ]; then DUMP_FILE="$arg"
      else echo "ERROR: unexpected extra argument: $arg" >&2; usage >&2; exit 1
      fi ;;
  esac
done

if [ -z "$TARGET_DB" ]; then
  usage >&2
  exit 1
fi

if [ "$CONFIRMED" -ne 1 ]; then
  echo "REFUSED: restoring DROPs and recreates database '$TARGET_DB'."
  echo "         Re-run with --yes to confirm you really want this."
  exit 1
fi

case "$TARGET_DB" in
  ''|*[!A-Za-z0-9_-]*)
    echo "REFUSED: invalid database name '$TARGET_DB' (allowed: A-Za-z0-9_-)" >&2
    exit 1 ;;
esac

# --- locate psql/pg_restore: system PATH first, then bundled PG16 client ---
if command -v psql >/dev/null 2>&1; then
  PSQL="psql"
  PG_RESTORE="pg_restore"
else
  PG_TOOLS="/home/node/.openclaw/pg-tools"
  export LD_LIBRARY_PATH="$PG_TOOLS/usr/lib/x86_64-linux-gnu:$PG_TOOLS/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  PSQL="$PG_TOOLS/usr/lib/postgresql/16/bin/psql"
  PG_RESTORE="$PG_TOOLS/usr/lib/postgresql/16/bin/pg_restore"
  if [ ! -x "$PSQL" ]; then
    echo "ERROR: psql not found on PATH nor at $PSQL" >&2
    exit 1
  fi
fi

# --- parse DATABASE_URL from server/.env (NEVER trust process.env) ---
if [ ! -r "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not readable" >&2
  exit 1
fi
DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi
# libpq rejects prisma-style URI query params (e.g. ?schema=public)
DB_URL_PQ="${DATABASE_URL%%\?*}"
# base URL without database name (for connecting to maintenance db "postgres")
BASE_URL="${DB_URL_PQ%/*}"
LIVE_DB="${DB_URL_PQ##*/}"
TARGET_URL="$BASE_URL/$TARGET_DB"

# --- pick dump ---
if [ -z "$DUMP_FILE" ]; then
  DUMP_FILE="$(ls -1t "$BACKUP_DIR"/alm-*.sql.gz 2>/dev/null | head -n1)"
  if [ -z "$DUMP_FILE" ]; then
    echo "ERROR: no alm-*.sql.gz backups found in $BACKUP_DIR" >&2
    exit 1
  fi
fi
if [ ! -r "$DUMP_FILE" ]; then
  echo "ERROR: dump file not readable: $DUMP_FILE" >&2
  exit 1
fi

echo "RESTORE PLAN:"
echo "  target database : $TARGET_DB  (will be DROPPED and recreated)"
echo "  dump file       : $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
if [ "$TARGET_DB" = "$LIVE_DB" ]; then
  echo ""
  echo "  ⚠️  WARNING: target IS the live ALM database ('$LIVE_DB')!"
  echo "      The ALM server should be stopped before restoring over it."
fi
echo ""

# --- drop + recreate target database (via maintenance db 'postgres') ---
if ! "$PSQL" "$BASE_URL/postgres" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET_DB\""; then
  echo "ERROR: DROP DATABASE failed for '$TARGET_DB'" >&2
  exit 1
fi
if ! "$PSQL" "$BASE_URL/postgres" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET_DB\""; then
  echo "ERROR: CREATE DATABASE failed for '$TARGET_DB'" >&2
  exit 1
fi

# --- auto-detect dump format and restore ---
# custom-format dumps start with the 5-byte magic "PGDMP";
# plain-SQL dumps (backup-db.sh output) restore via psql.
MAGIC="$(gzip -dc "$DUMP_FILE" 2>/dev/null | head -c 5 || true)"

if [ "$MAGIC" = "PGDMP" ]; then
  echo "RESTORE: detected custom-format dump — using pg_restore"
  if ! gzip -dc "$DUMP_FILE" | "$PG_RESTORE" --no-owner --dbname="$TARGET_URL"; then
    echo "ERROR: pg_restore failed" >&2
    exit 1
  fi
else
  echo "RESTORE: detected plain-SQL dump — using psql"
  if ! gzip -dc "$DUMP_FILE" | "$PSQL" "$TARGET_URL" -v ON_ERROR_STOP=1 -q; then
    echo "ERROR: psql restore failed" >&2
    exit 1
  fi
fi

# --- post-restore sanity check (informational) ---
echo "RESTORE: done. Quick sanity counts in '$TARGET_DB':"
"$PSQL" "$TARGET_URL" -tAc "SELECT 'tables: ' || count(*) FROM information_schema.tables WHERE table_schema='public'" || true
"$PSQL" "$TARGET_URL" -tAc "SELECT 'tasks rows: ' || count(*) FROM tasks" 2>/dev/null || echo "  tasks rows: (no tasks table)"
"$PSQL" "$TARGET_URL" -tAc "SELECT 'users rows: ' || count(*) FROM users" 2>/dev/null || echo "  users rows: (no users table)"

exit 0