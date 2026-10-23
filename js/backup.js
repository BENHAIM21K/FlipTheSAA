// FlipTheSAA — Export / import progress (a JSON backup file)
import { HISTORY_KEY, MAX_HISTORY_SESSIONS, STATE_KEY } from './config.js';
import { getSessionHistory, saveSessionHistory } from './history.js';
import { loadState, saveState } from './storage.js';
import { confirmDialog } from './util.js';

// ============================================================================
// BACKUP FILE FORMAT
// ============================================================================
// {
//   "app": "FlipTheSAA", "kind": "progress-backup", "version": 1,
//   "exportedAt": "2026-10-23T14:02:11.000Z",
//   "history": { version: 1, sessions: [...] },   ← saa_practice_history_v1, as stored
//   "session": { sessionKey, session } | null     ← saa_practice_state_v1 (an unfinished session)
// }
// The theme and last-tab preferences are left out on purpose: they belong to a device.

const BACKUP_KIND = 'progress-backup';

const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * WHAT IT DOES: Downloads this browser's progress as a .json file
 *
 * RETURNS: a one-line summary for the status line, or an error message
 */
export function exportProgress() {
  const history = getSessionHistory();
  const state = loadState();
  const sessions = history.sessions || [];
  if (!sessions.length && !(state && state.session)) {
    return { ok: false, message: 'Nothing to export yet: finish or start a session first.' };
  }

  const backup = {
    app: 'FlipTheSAA',
    kind: BACKUP_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    history,
    session: state && state.session ? state : null
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flipthesaa-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const unfinished = state && state.session && !state.session.completed;
  return {
    ok: true,
    message: `Exported ${sessions.length} session${sessions.length === 1 ? '' : 's'}${unfinished ? ' and your unfinished session' : ''} to ${a.download}.`
  };
}

/** A session record has to look like one we wrote before it's merged */
function isValidSession(s) {
  return s && typeof s.sessionId === 'string' && typeof s.points === 'number' &&
    typeof s.completedAt === 'number' && Array.isArray(s.questionResults);
}

/**
 * WHAT IT DOES: Reads a backup file, shows what it contains and what merging
 * would add, and on confirmation merges it into this browser's progress
 *
 * MERGE RULES (owner's decision: merge, never replace):
 * - History: sessions are matched by sessionId; ones already here are kept as
 *   they are, new ones are added; then sorted by date, keeping the newest 50.
 * - Unfinished session: restored from the backup only if this browser has none
 *   running; a session in progress here is never overwritten.
 *
 * RETURNS: { ok, message, changed }
 */
export async function importProgress(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    return { ok: false, message: `${file.name} isn't a valid backup file (it isn't JSON).` };
  }
  if (!backup || backup.kind !== BACKUP_KIND || !backup.history || !Array.isArray(backup.history.sessions)) {
    return { ok: false, message: `${file.name} isn't a FlipTheSAA progress backup.` };
  }

  const incoming = backup.history.sessions.filter(isValidSession);
  const local = getSessionHistory();
  const localIds = new Set((local.sessions || []).map(s => s.sessionId));
  const fresh = incoming.filter(s => !localIds.has(s.sessionId));
  const skipped = backup.history.sessions.length - incoming.length;

  const current = loadState();
  const hereRunning = current && current.session && !current.session.completed;
  const backupSession = backup.session && backup.session.session && backup.session.sessionKey ? backup.session : null;
  const backupRunning = backupSession && !backupSession.session.completed;
  const willRestoreSession = backupRunning && !hereRunning;

  if (!fresh.length && !willRestoreSession) {
    return { ok: true, changed: false, message: `Nothing new in ${file.name}: all ${incoming.length} of its sessions are already here.` };
  }

  // Say exactly what will happen before doing it
  const dates = incoming.map(s => s.completedAt).sort((a, b) => a - b);
  const facts = [
    `This backup from ${fmtDay(Date.parse(backup.exportedAt) || dates[dates.length - 1] || Date.now())} has ${incoming.length} session${incoming.length === 1 ? '' : 's'}${dates.length ? ` (${fmtDay(dates[0])} – ${fmtDay(dates[dates.length - 1])})` : ''}.`,
    `${fresh.length} ${fresh.length === 1 ? 'is' : 'are'} new here${incoming.length - fresh.length ? `; ${incoming.length - fresh.length} you already have` : ''}.`
  ];
  if (willRestoreSession) facts.push(`Its unfinished ${backupSession.session.mode === 'timed' ? 'timed exam' : 'session'} will be restored.`);
  else if (backupRunning && hereRunning) facts.push("Its unfinished session is skipped: you have one in progress here, and that one is kept.");
  if (skipped) facts.push(`${skipped} damaged entr${skipped === 1 ? 'y' : 'ies'} will be skipped.`);
  facts.push("Nothing already here is changed or removed.");

  const ok = await confirmDialog({
    title: 'Add this backup to your progress?',
    body: facts.join(' '),
    confirmLabel: 'Merge backup'
  });
  if (!ok) return { ok: true, changed: false, message: 'Import cancelled. Nothing was changed.' };

  // Merge history: keep local records, add new ones, newest 50 by date
  const merged = [...(local.sessions || []), ...fresh]
    .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0))
    .slice(-MAX_HISTORY_SESSIONS);
  saveSessionHistory({ version: local.version || 1, sessions: merged });

  if (willRestoreSession) saveState(backupSession);

  const dropped = (local.sessions || []).length + fresh.length - merged.length;
  return {
    ok: true,
    changed: true,
    message: `Added ${fresh.length} session${fresh.length === 1 ? '' : 's'}${willRestoreSession ? ' and restored your unfinished session' : ''}. History now holds ${merged.length}${dropped > 0 ? ` (the oldest ${dropped} dropped to stay within ${MAX_HISTORY_SESSIONS})` : ''}.`
  };
}

// Keys are re-exported for tests and documentation of what a backup covers
export const BACKUP_KEYS = [HISTORY_KEY, STATE_KEY];
