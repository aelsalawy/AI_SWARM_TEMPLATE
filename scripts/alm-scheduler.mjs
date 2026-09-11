#!/usr/bin/env node
// ALM in-container scheduler — replaces busybox crond, which cannot dispatch
// jobs when started as non-root in this container (verified 2026-09-07).
// Contract (identical to the old crontab spool):
//   - alm-watchdog.sh every 5 minutes (first fire ~30s after start)
//   - scripts/backup-db.sh daily at 03:15 UTC (once per UTC day)
// Armed by start-alm.sh (idempotent). Logs to /tmp/alm-scheduler.log.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const WD = '/home/node/.openclaw/workspace-cto/alm-watchdog.sh';
const BK = './scripts/backup-db.sh';
const LASTDAY = '/tmp/alm-backup-lastday';
const ts = () => new Date().toISOString();

function run(script) {
  const child = spawn('bash', [script], { stdio: 'ignore', detached: true });
  child.unref();
  console.log(`[${ts()}] scheduled: ${script}`);
}

let lastWatchdog = 0;

setInterval(() => {
  const now = new Date();
  if (Date.now() - lastWatchdog >= 5 * 60 * 1000) {
    run(WD);
    lastWatchdog = Date.now();
  }
  const day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() === 3 && now.getUTCMinutes() === 15) {
    let last = '';
    try { last = readFileSync(LASTDAY, 'utf8').trim(); } catch { /* first run */ }
    if (last !== day) {
      run(BK);
      writeFileSync(LASTDAY, day);
    }
  }
}, 30_000);

console.log(`[${ts()}] alm-scheduler started (watchdog */5min, backup 03:15 UTC)`);