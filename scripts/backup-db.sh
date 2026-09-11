#!/usr/bin/env bash
# ALM PostgreSQL backup script (R2-2).
#
# Run by cron daily at 03:15 (and manually when needed).
# - Parses DATABASE_URL from server/.env by grep (never trusts process.env).
# - pg_dump | gzip → /home/node/.openclaw/backups/alm/alm-YYYYMMDD-HHMM.sql.gz
# - Prunes old backups, keeping the 7 newest.
# - Logs every action with timestamps to backup.log (stdout is not captured
#   by cron, so the script logs to file itself).
#
# pg_dump is plain-SQL format (zcat-readable). restore-db.sh auto-detects
# plain vs custom format on restore.
#
# NOTE: this box has no system postgresql-client; a bundled PG16 client is
# extracted at /home/node/.openclaw/pg-tools (used via LD_LIBRARY_PATH).
# If a system pg_dump appears on PATH it is preferred automatically.

set -uo pipefail

REPO_DIR="."
ENV_FILE="$REPO_DIR/server/.env"
BACKUP_DIR="/home/node/.openclaw/backups/alm"
BACKUP_LOG="$BACKUP_DIR/backup.log"
KEEP=7

export PATH=/usr/local/bin:/usr/bin:/bin

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$BACKUP_LOG"; }

# --- locate pg_dump: system PATH first, then bundled PG16 client ---
if command -v pg_dump >/dev/null 2>&1; then
  PG_DUMP="pg_dump"
else
  PG_TOOLS="/home/node/.openclaw/pg-tools"
  export LD_LIBRARY_PATH="$PG_TOOLS/usr/lib/x86_64-linux-gnu:$PG_TOOLS/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  PG_DUMP="$PG_TOOLS/usr/lib/postgresql/16/bin/pg_dump"
  if [ ! -x "$PG_DUMP" ]; then
    log "ERROR: pg_dump not found on PATH nor at $PG_DUMP"
    exit 1
  fi
fi

# --- parse DATABASE_URL from server/.env (NEVER trust process.env) ---
if [ ! -r "$ENV_FILE" ]; then
  log "ERROR: $ENV_FILE not readable"
  exit 1
fi
DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
if [ -z "$DATABASE_URL" ]; then
  log "ERROR: DATABASE_URL not found in $ENV_FILE"
  exit 1
fi
# libpq (pg_dump) rejects prisma-style URI query params (e.g. ?schema=public)
DB_URL_PQ="${DATABASE_URL%%\?*}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="$BACKUP_DIR/alm-$STAMP.sql.gz"

log "BACKUP: starting pg_dump → $OUT"

if ! "$PG_DUMP" --no-owner --no-privileges "$DB_URL_PQ" | gzip > "$OUT"; then
  log "ERROR: pg_dump failed — removing partial backup $OUT"
  rm -f "$OUT"
  exit 1
fi

SIZE="$(stat -c%s "$OUT")"
if [ "$SIZE" -lt 1024 ]; then
  log "ERROR: backup $OUT suspiciously small ($SIZE bytes) — removing it"
  rm -f "$OUT"
  exit 1
fi
log "BACKUP: OK $OUT ($(du -h "$OUT" | cut -f1), $SIZE bytes)"

# --- prune: keep only the $KEEP newest alm-*.sql.gz ---
mapfile -t ALL_DUMPS < <(ls -1t "$BACKUP_DIR"/alm-*.sql.gz 2>/dev/null)
TOTAL="${#ALL_DUMPS[@]}"
if [ "$TOTAL" -gt "$KEEP" ]; then
  for f in "${ALL_DUMPS[@]:$KEEP}"; do
    log "PRUNE: removing old backup $(basename "$f")"
    rm -f "$f"
  done
  log "PRUNE: kept $KEEP newest of $TOTAL backups"
else
  log "PRUNE: $TOTAL backup(s) present, keeping all (limit $KEEP)"
fi

exit 0