// FlipTheSAA — localStorage: load / save / clear the current session
import { CHOICE_LAYOUT_KEY, HISTORY_KEY, STATE_KEY, TAB_KEY } from './config.js';
import { safeOperation } from './util.js';

// ============================================================================
// LOCAL STORAGE FUNCTIONS - Save and load quiz state from browser storage
// ============================================================================

/**
 * WHAT IT DOES: Loads the saved quiz session from browser's localStorage
 *
 * WHY WE NEED IT: Allows users to refresh the page without losing their
 * progress. All answers, question order, and timer state are preserved.
 *
 * RETURNS: State object if exists and is valid, null if no state or corrupt data
 *
 * SIDE EFFECTS: Reads from localStorage
 *
 * ERROR HANDLING: If localStorage data is corrupt or can't be parsed,
 * returns null instead of crashing the app
 */
export function loadState() {
  return safeOperation('Load State from localStorage', () => {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      console.info('[SAA Info] No saved state found in localStorage');
      return null;
    }

    const parsed = JSON.parse(raw);

    // Validate that the loaded state has required properties
    if (!parsed.session || !parsed.sessionKey) {
      console.warn('[SAA Warning] Loaded state is missing required fields, ignoring');
      return null;
    }

    console.info('[SAA Info] Successfully loaded state from localStorage');
    return parsed;
  }, null);
}

/**
 * WHAT IT DOES: Saves the current quiz session to browser's localStorage
 *
 * WHY WE NEED IT: Persists all quiz data so users don't lose progress
 * if they accidentally close the tab or refresh the page.
 *
 * PARAMETERS:
 * - state: The complete state object containing session data
 *
 * SIDE EFFECTS: Writes to localStorage
 *
 * ERROR HANDLING: Catches quota exceeded errors and corrupt data issues
 */
export function saveState(state) {
  safeOperation('Save State to localStorage', () => {
    if (!state || !state.session) {
      console.warn('[SAA Warning] Attempted to save invalid state, skipping');
      return;
    }

    const json = JSON.stringify(state);
    localStorage.setItem(STATE_KEY, json);
    console.info('[SAA Info] State saved to localStorage successfully');
  }, undefined);
}

/**
 * WHAT IT DOES: Removes all saved quiz data from localStorage
 *
 * WHY WE NEED IT: Allows users to start completely fresh by clearing
 * all previous session data (called when user clicks "Reset" button)
 *
 * SIDE EFFECTS: Deletes data from localStorage
 */
export function clearState() {
  safeOperation('Clear State from localStorage', () => {
    localStorage.removeItem(STATE_KEY);
    console.info('[SAA Info] State cleared from localStorage');
  }, undefined);
}

/**
 * WHAT IT DOES: Clears ALL data including quiz state AND performance history
 * WHY IT EXISTS: Provides complete "start over" functionality for reset
 */
export function clearAllData() {
  safeOperation('Clear All Data from localStorage', () => {
    localStorage.removeItem(STATE_KEY);     // Clear quiz state
    localStorage.removeItem(HISTORY_KEY);   // Clear performance history
    localStorage.removeItem(TAB_KEY);       // Clear last active tab
    localStorage.removeItem(CHOICE_LAYOUT_KEY); // Clear where the correct answers were last shown
    console.info('[SAA Info] All data cleared from localStorage (state + history)');
  }, undefined);
}

// ============================================================================
// CHOICE LAYOUTS - where each question's correct answer(s) were the last time it was shown
// ============================================================================
// Shape: { [questionId]: [display positions, ascending] }, e.g. { "SAA-113": [1] } = the correct answer was B.
// A new session shows a question it has met before with its correct answer somewhere else (js/choice-order.js).

export function loadChoiceLayouts() {
  return safeOperation('Load choice layouts', () => {
    const raw = localStorage.getItem(CHOICE_LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }, {});
}

export function saveChoiceLayouts(layouts) {
  safeOperation('Save choice layouts', () => {
    localStorage.setItem(CHOICE_LAYOUT_KEY, JSON.stringify(layouts));
  }, undefined);
}

/** Remembers where the correct answer(s) of a question were just shown (writes only when something changed). */
export function recordShownLayout(questionId, positions) {
  const layouts = loadChoiceLayouts();
  const same = Array.isArray(layouts[questionId]) && layouts[questionId].length === positions.length &&
    layouts[questionId].every((p, i) => p === positions[i]);
  if (same) return;
  layouts[questionId] = positions;
  saveChoiceLayouts(layouts);
}
