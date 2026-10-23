// FlipTheSAA — App-level actions: reset all progress, load errors
import { stopTimer } from './exam.js';
import { clearAllData } from './storage.js';
import { confirmDialog } from './util.js';

/**
 * WHAT IT DOES: Asks for confirmation, then deletes all progress and reloads
 *
 * WHY: Used to be a top-level "Reset" tab; it now sits last on the Performance
 * screen, behind a dialog that says exactly what will be deleted.
 */
export async function resetAllProgress() {
  const ok = await confirmDialog({
    title: 'Reset all progress?',
    body: "This deletes your current session (answers and timer) and every past result stored in this browser. It can't be undone.",
    confirmLabel: 'Delete everything',
    tone: 'danger'
  });
  if (!ok) return;

  console.info('[SAA Info] User initiated complete reset (state + history)');
  stopTimer();
  clearAllData();
  location.reload();
}

/**
 * WHAT IT DOES: Replaces the loading spinner with an error and a Retry button
 */
export function showLoadError(message) {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  const body = overlay.querySelector('.loading-body');
  if (body) body.hidden = true;
  const detail = document.getElementById('loadingErrorDetail');
  if (detail) detail.textContent = message;
  const box = document.getElementById('loadingError');
  if (box) box.hidden = false;
}
