// FlipTheSAA — Entry point: startup and event wiring
import './debug-loader.js';  // first, so the owner's private debug mode (git-ignored js/debug.local.js) can start before the app
import { exportProgress, importProgress } from './backup.js';
import { EXAM_TOTAL_QUESTIONS, TAB_KEY } from './config.js';
import { difficultyDropdown, difficultyPanel, difficultyTrigger, domainDropdown, domainPanel, domainTrigger, hintText, modeDropdown, modePanel, modeTrigger, newSessionBtn, nextBtn, prevBtn, quizCard, sectionButtons, sectionDropdown, sectionPanel, sectionTrigger, startBtn, submitBtn } from './dom.js';
import { createDrillSession, createNewSession, createServiceSession, normalizeStateForRuntime, persistRuntimeState, restorePauseFromSession, togglePause } from './exam.js';
import { buildDifficultyOptions, buildDomainOptions, buildSectionOptions, closeAllDropdowns, closeDropdown, ensureModeRulesUI, filterSectionOptions, getFiltersFromUI, getSelectedValues, openDropdown, sessionDifficulty, sessionKeyFor, syncDifficultyUI, syncDomainCheckboxes, syncModeUI, syncSectionCheckboxes } from './filters.js';
import { getDrillQuestions, getSessionHistory } from './history.js';
import { answerTryQuestion, renderTryQuestion } from './home.js';
import { renderPerformanceDashboard } from './performance.js';
import { closeMobileMenu, switchTab, switchTabDebounced } from './nav.js';
import { closeMapSheet, openMapSheet, renderJumpGrid, renderQuiz, reviewQuestions, showResults, submitReviewDialog } from './quiz-view.js';
import { closeServiceDrawer, questionIdsForService, showComparison } from './resources.js';
import { initShareDialog, openShareDialog } from './share.js';
import { resetAllProgress, showLoadError } from './shell.js';
import { S } from './state.js';
import { loadState } from './storage.js';
import { THEME_KEY, currentTheme, syncThemeToggle } from './theme.js';
import { confirmDialog, icon, normalizeMode, safeOperation } from './util.js';

/* ============================================================================
   SAA PRACTICE QUIZ - AWS Solutions Architect Associate Exam Prep
   ============================================================================

   WHAT THIS APP DOES:
   This is a single-page quiz application that helps you prepare for the AWS
   SAA-C03 exam. It loads questions from questions.json and presents them in
   two different modes: Review (for learning) and Timed (for exam simulation).

   ARCHITECTURE OVERVIEW:
   - Frontend only: Pure HTML/CSS/JavaScript (no backend, no database)
   - Data storage: Browser's localStorage for session persistence
   - Question data: Static JSON file (questions.json)
   - State management: Single source of truth in localStorage

   QUIZ MODES:
   1. REVIEW MODE:
      - Filter questions by domain (D1-D4) or section (EC2, S3, etc.)
      - Instant feedback after each answer
      - Green/red indicators in jump grid
      - Score shown only at the end (not during quiz)
      - Perfect for learning and understanding concepts

   2. TIMED MODE:
      - Always full 65-question exam (no filtering)
      - 130 minutes timer (2 hours 10 minutes)
      - No feedback until you submit/time runs out
      - Only 50 random questions are scored; the other 15 are unscored (marked "Unscored" in the results)
      - Simulates real AWS exam experience

   SCORING RULES:
   - TIMED: 65 questions total, 50 random scored; each scored question has its own point value (js/scoring.js, from its length and content, computed per exam) and the 50 add up to exactly 1000
   - REVIEW: All questions scored → (correct/total) × 1000
   - PASSING: 720/1000 points (72%) in both modes

   DATA PERSISTENCE:
   - Question order (deterministic shuffle based on session)
   - User answers
   - Current question position
   - Timer state (for timed mode)
   - All data survives page refresh

   LEGACY MIGRATIONS:
   - Old "practice" mode sessions auto-migrate to "review" mode
   - Backward compatible with previous localStorage versions

   ============================================================================
*/

// ============================================================================
// INITIALIZATION - App startup and question loading
// ============================================================================

/**
 * WHAT IT DOES: Initializes the application when the page loads
 *
 * WHY WE NEED IT: This is the entry point that loads questions, sets up
 * the UI, and restores any previous session from localStorage.
 *
 * HOW IT WORKS:
 * 1. Load questions from questions.json file
 * 2. Validate question data structure
 * 3. Build dropdown menus
 * 4. Restore previous session if exists
 * 5. Show quiz card if resuming
 *
 * ERROR HANDLING:
 * - Retries failed fetch up to 3 times
 * - Validates question JSON structure
 * - Shows user-friendly error messages
 * - Logs detailed error info to console
 *
 * SIDE EFFECTS:
 * - Loads S.QUESTIONS and S.QMAP globals
 * - Modifies DOM (dropdowns, quiz card visibility)
 * - May show error message to user
 */
export async function init() {
  console.info('[SAA Info] Initializing application...');

  // Show loading overlay
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
  }

  // ===== STEP 1: Load Questions from JSON file =====
  // Retry logic: Try up to 3 times in case of network issues
  let questions = null;
  let lastError = null;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.info(`[SAA Info] Loading questions.json (attempt ${attempt}/${MAX_RETRIES})...`);

      const res = await fetch("questions.json", { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      questions = await res.json();

      // Validate questions is an array
      if (!Array.isArray(questions)) {
        throw new Error("questions.json must contain an array of questions");
      }

      // Validate at least one question exists
      if (questions.length === 0) {
        throw new Error("questions.json contains no questions");
      }

      // Validate first question has required fields
      const firstQ = questions[0];
      const requiredFields = ['id', 'domainId', 'domain', 'section', 'question', 'choices', 'answer', 'explanation'];
      for (const field of requiredFields) {
        if (!(field in firstQ)) {
          throw new Error(`Question missing required field: ${field}`);
        }
      }

      console.info(`[SAA Info] Successfully loaded ${questions.length} questions`);
      break;  // Success! Exit retry loop

    } catch (error) {
      lastError = error;
      console.warn(`[SAA Warning] Failed to load questions (attempt ${attempt}/${MAX_RETRIES}):`, error.message);

      // Wait before retry (except on last attempt)
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000));  // Wait 1 second
      }
    }
  }

  // If all retries failed, show error and stop
  if (!questions) {
    const errorMsg = `Failed to load questions after ${MAX_RETRIES} attempts: ${lastError.message}`;
    console.error('[SAA Error]', errorMsg);

    // Keep the overlay up and turn it into an error with a Retry button
    showLoadError(`Tried ${MAX_RETRIES} times (${lastError.message}). Check your connection and try again.`);
    return;  // Stop initialization
  }

  // Store questions globally
  S.QUESTIONS = questions;
  S.QMAP = new Map(S.QUESTIONS.map((q) => [q.id, q]));

  // ===== STEP 2: Setup UI =====

  // Mode select already configured in HTML (Review + Timed only)

  // Hide section chips/buttons (legacy UI, user chooses only from dropdown)
  if (sectionButtons) sectionButtons.style.display = "none";

  // Inform user about question count
  if (S.QUESTIONS.length < EXAM_TOTAL_QUESTIONS) {
    const msg = `Warning: You have ${S.QUESTIONS.length} questions. Timed mode requires at least ${EXAM_TOTAL_QUESTIONS}.`;
    hintText.textContent = msg;
    console.warn(`[SAA Warning] ${msg}`);
  } else if (S.QUESTIONS.length > EXAM_TOTAL_QUESTIONS) {
    const msg = `You have ${S.QUESTIONS.length} questions. Timed mode will randomly select ${EXAM_TOTAL_QUESTIONS} per session.`;
    hintText.textContent = msg;
    console.info(`[SAA Info] ${msg}`);
  }

  // Build dropdown options from loaded questions
  syncModeUI();
  buildDomainOptions();
  buildSectionOptions([]);
  buildDifficultyOptions([], []);

  // Apply mode-specific UI rules
  ensureModeRulesUI();

  // ===== STEP 3: Restore Previous Session (if exists) =====

  const existing = normalizeStateForRuntime(loadState());
  const savedTab = localStorage.getItem(TAB_KEY); // null on first visit

  if (savedTab === null) {
    // FIRST VISIT: no saved tab → always show home
    console.info('[SAA Info] First visit, showing home page');
    S.currentTab = 'home';
    switchTab('home');
  } else if (savedTab === 'practice') {
    // Last tab was practice: restore session if one exists
    if (existing && existing.session && existing.session.questionIds && existing.session.questionIds.length) {
      console.info('[SAA Info] Restoring previous practice session');

      const s = existing.session;

      // Restore UI state to match the session
      S.selectedMode = normalizeMode(s.mode);
      syncModeUI();

      if (s.mode === "timed") {
        S.selectedDomains = [];
        S.selectedSections = [];
        syncDomainCheckboxes();
        buildSectionOptions([]);
        S.selectedDifficulty = sessionDifficulty(existing);
        buildDifficultyOptions([], []);
      } else {
        // Migrate old single-value saves (domainId/section strings) to arrays
        S.selectedDomains = Array.isArray(s.domainIds) ? [...s.domainIds]
          : (s.domainId && s.domainId !== "ALL") ? [s.domainId] : [];
        buildSectionOptions(S.selectedDomains);
        S.selectedSections = Array.isArray(s.sections) ? [...s.sections]
          : (s.section && s.section !== "ALL") ? [s.section] : [];
        syncDomainCheckboxes();
        syncSectionCheckboxes();
        S.selectedDifficulty = sessionDifficulty(existing);
        buildDifficultyOptions(S.selectedDomains, S.selectedSections);
      }

      ensureModeRulesUI();
      switchTab('practice');

      if (s.completed) {
        console.info('[SAA Info] Session was completed, showing results');
        showResults(existing, false);
      } else {
        console.info('[SAA Info] Session in progress, resuming quiz');
        restorePauseFromSession(existing);  // a pause saved before the reload stays a pause
        renderQuiz(existing);
      }
    } else {
      // Was on practice but no valid session → show home
      console.info('[SAA Info] Practice tab saved but no session, showing home');
      S.currentTab = 'home';
      switchTab('home');
    }
  } else {
    // Last tab was home, performance, studygroups, or contact → go there
    console.info(`[SAA Info] Restoring tab: ${savedTab}`);
    switchTab(savedTab);
  }

  // Hide loading overlay now that the correct section is active
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }

  console.info('[SAA Info] Initialization complete');
}

// ============================================================================
// EVENT LISTENERS - User interaction handlers
// ============================================================================
// All button clicks and dropdown changes are handled here

// ── Mode trigger: toggle open/close ───────────────────────────────────────
modeTrigger.addEventListener('click', () => {
  const isOpen = !modePanel.hidden;
  closeAllDropdowns();
  if (!isOpen) openDropdown(modeTrigger, modePanel);
});

// ── Mode panel: option click selects mode ─────────────────────────────────
modePanel.addEventListener('click', (e) => {
  const option = e.target.closest('.ms-option');
  if (!option || !option.dataset.value) return;
  S.selectedMode = option.dataset.value;
  syncModeUI();
  closeDropdown(modeTrigger, modePanel);
  ensureModeRulesUI();
});

// ── Difficulty trigger: toggle open/close ─────────────────────────────────
difficultyTrigger.addEventListener('click', () => {
  if (difficultyTrigger.disabled) return;
  const isOpen = !difficultyPanel.hidden;
  closeAllDropdowns();
  if (!isOpen) openDropdown(difficultyTrigger, difficultyPanel);
});

// ── Difficulty panel: option click selects difficulty ─────────────────────
difficultyPanel.addEventListener('click', (e) => {
  const option = e.target.closest('.ms-option');
  if (!option || !option.dataset.value) return;
  S.selectedDifficulty = option.dataset.value;
  syncDifficultyUI();
  closeDropdown(difficultyTrigger, difficultyPanel);
});

// ============================================================================
// NAVIGATION EVENT LISTENERS
// ============================================================================

/**
 * TAB CLICK HANDLER
 * Uses event delegation on document for all nav tabs
 */
document.addEventListener('click', (e) => {
  const navTab = e.target.closest('.nav-tab');
  if (navTab) {
    const tabName = navTab.getAttribute('data-tab');
    if (tabName) {
      switchTabDebounced(tabName);
    }
  }
});

/**
 * HAMBURGER MENU (Mobile): the button toggles the menu; a click outside it closes it
 *
 * WHY ONE HANDLER: toggling swaps the button's icon, which detaches the tapped
 * <svg>; a separate outside-click listener then saw no hamburger ancestor and
 * closed the menu it had just opened (taps on the icon itself "didn't work").
 */
document.addEventListener('click', (e) => {
  const navMenu = document.getElementById('navMenu');
  if (!navMenu) return;
  const hamburger = e.target.closest('.nav-hamburger');
  if (hamburger) {
    const isOpen = navMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
    hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    hamburger.innerHTML = icon(isOpen ? 'x' : 'menu');
    return;
  }
  if (navMenu.classList.contains('open') && !e.target.closest('.nav-menu')) {
    closeMobileMenu();
  }
});

/**
 * HOME PAGE CTA BUTTON
 */
document.addEventListener('click', (e) => {
  if (e.target && e.target.closest('#ctaStartBtn')) {
    switchTab('practice');
  }
});

/**
 * IN-PAGE LINKS: any element with data-goto="<tab>" opens that tab.
 * data-mode="timed" | "review" also preselects the practice mode.
 * data-practice-topics="A|B" starts a Review session on those topics right away
 * (the "Practice this lesson / these questions" buttons).
 */
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-goto]');
  if (!link) return;
  e.preventDefault();
  closeServiceDrawer();

  if (link.dataset.practiceService) {
    practiceService(link.dataset.practiceService);
    return;
  }

  if (link.dataset.practiceTopics) {
    practiceTopics(link.dataset.practiceTopics.split('|'));
    return;
  }

  const mode = link.dataset.mode;
  if (mode === 'timed' || mode === 'review') {
    S.selectedMode = mode;
    syncModeUI();
    ensureModeRulesUI();
  }
  switchTabDebounced(link.dataset.goto);
});

/**
 * WHAT IT DOES: Sets the Practice filters to Review + the given topics and
 * starts a fresh session on them
 *
 * WHY THE CHECK: there is one saved session slot, so starting this replaces an
 * unfinished session; that only happens after the student agrees.
 */
async function practiceTopics(topics) {
  if (!(await confirmReplaceUnfinished('Start practice'))) return;

  S.selectedMode = 'review';
  S.selectedDomains = [];
  S.selectedDifficulty = 'ALL';
  syncModeUI();
  syncDomainCheckboxes();
  buildSectionOptions([]);
  S.selectedSections = topics.filter(t => sectionPanel.querySelector(`.ms-check[value="${CSS.escape(t)}"]`));
  syncSectionCheckboxes();
  buildDifficultyOptions([], S.selectedSections);
  ensureModeRulesUI();

  switchTab('practice');
  startSession(true);
  document.getElementById('practiceSection')?.scrollIntoView({ block: 'start' });
}

/**
 * WHAT IT DOES: Starts a Review session on the questions about one cheat-sheet service
 * (data-practice-service="<service>": the "Practice <service>" button in the cheat-sheet drawer)
 */
async function practiceService(service) {
  const ids = questionIdsForService(service);
  if (!ids.length) return;
  if (!(await confirmReplaceUnfinished('Start practice'))) return;

  safeOperation('Start service practice', () => {
    S.selectedMode = 'review';
    S.quizPausedState = null;
    quizCard.classList.remove('quiz-manually-paused');
    S.mapFilter = 'all';
    S.setupExpanded = false;
    syncModeUI();
    createServiceSession(service, ids);
    switchTab('practice');   // renders the saved session
    document.getElementById('practiceSection')?.scrollIntoView({ block: 'start' });
  }, undefined);
}

/**
 * WHAT IT DOES: If a session is unfinished, asks before something replaces it
 *
 * RETURNS: true when it's fine to go ahead (nothing unfinished, or the student agreed)
 */
async function confirmReplaceUnfinished(confirmLabel) {
  const existing = normalizeStateForRuntime(loadState());
  if (!existing || !existing.session || existing.session.completed) return true;
  const s = existing.session;
  const answered = Object.keys(s.answers || {}).length;
  const kind = s.mode === 'timed' ? 'timed exam' : s.drill ? 'mistake drill' : 'review session';
  return confirmDialog({
    title: 'Replace your unfinished session?',
    body: `You have an unfinished ${kind} (${answered} of ${s.questionIds.length} answered). Starting this replaces it.`,
    confirmLabel
  });
}

/**
 * MISTAKE DRILL (Performance): a Review session of the questions you last
 * answered wrong, most-missed first
 */
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-drill]')) return;
  const mistakes = getDrillQuestions(getSessionHistory());
  if (!mistakes.length) return;
  if (!(await confirmReplaceUnfinished('Start the drill'))) return;

  safeOperation('Start Mistake Drill', () => {
    S.quizPausedState = null;
    quizCard.classList.remove('quiz-manually-paused');
    S.mapFilter = 'all';
    S.setupExpanded = false;
    createDrillSession(mistakes.map(m => m.questionId));
    switchTab('practice');   // renders the saved drill session
    document.getElementById('practiceSection')?.scrollIntoView({ block: 'start' });
  }, undefined);
});

/**
 * SHARE (timed exam results): "Share your achievement" opens the share dialog
 */
initShareDialog();
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-share]');
  if (btn) openShareDialog();
});

/**
 * YOUR DATA (Performance): export / import a progress backup
 */
function setDataStatus(result) {
  const el = document.getElementById('dataStatus');
  if (!el) return;
  el.textContent = result.message;
  el.classList.toggle('is-error', !result.ok);
}
document.getElementById('exportDataBtn')?.addEventListener('click', () => {
  setDataStatus(safeOperation('Export Progress', () => exportProgress(), { ok: false, message: 'Export failed. Please try again.' }));
});
document.getElementById('importDataBtn')?.addEventListener('click', () => document.getElementById('importDataFile')?.click());
document.getElementById('importDataFile')?.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';   // choosing the same file again still fires 'change'
  if (!file) return;
  let result;
  try {
    result = await importProgress(file);
  } catch (err) {
    console.error('[SAA Error] Import Progress:', err);
    result = { ok: false, message: 'Import failed. Nothing was changed.' };
  }
  setDataStatus(result);
  if (result.changed) renderPerformanceDashboard();
});

/**
 * COMMONLY CONFUSED: the picker, and "Commonly confused" links in the drawer
 */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-compare]');
  if (!btn) return;
  const fromDrawer = !!btn.closest('#serviceDrawer');
  if (fromDrawer) closeServiceDrawer();
  showComparison(btn.dataset.compare, fromDrawer);
});

/**
 * SERVICE DRAWER: close button, and a click on the dimmed backdrop
 */
document.getElementById('drawerCloseBtn')?.addEventListener('click', closeServiceDrawer);
document.getElementById('serviceDrawer')?.addEventListener('click', (e) => {
  if (e.target.id === 'serviceDrawer') closeServiceDrawer(); // the dialog element itself = the backdrop area
});

/**
 * HOME: "Try one question" — answer, and "Another" for a new one
 */
document.getElementById('tryQuestion')?.addEventListener('click', (e) => {
  const choiceBtn = e.target.closest('.try-choice');
  if (choiceBtn && !choiceBtn.disabled) answerTryQuestion(choiceBtn);
});
document.getElementById('tryNextBtn')?.addEventListener('click', () => renderTryQuestion());

/**
 * THEME TOGGLE: flips light/dark and remembers the choice
 */
document.getElementById('themeToggle')?.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* private mode: theme just won't persist */ }
  syncThemeToggle();
});
syncThemeToggle();

/**
 * RESET ALL PROGRESS (Performance → Your data)
 */
document.getElementById('resetDataBtn')?.addEventListener('click', () => resetAllProgress());

/**
 * LOAD ERROR: Retry reloads the page
 */
document.getElementById('loadingRetryBtn')?.addEventListener('click', () => location.reload());

/**
 * KEYBOARD: Enter/Space activates non-button elements that act as buttons
 * (answer choices, cheat-sheet cards, lesson rows, dropdown options)
 */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[role="button"], [role="option"]');
  if (!el || el !== e.target || el.tagName === 'BUTTON') return;
  e.preventDefault();
  el.click();
});

/**
 * ORIENTATION CHANGE HANDLER (Mobile)
 */
window.addEventListener('orientationchange', () => {
  const navMenu = document.getElementById('navMenu');
  if (navMenu && navMenu.classList.contains('open')) {
    closeMobileMenu();
  }
});

// ============================================================================
// EXISTING EVENT LISTENERS
// ============================================================================

// ── Domain trigger: toggle open/close ─────────────────────────────────────
domainTrigger.addEventListener('click', () => {
  if (domainTrigger.disabled) return;
  const isOpen = !domainPanel.hidden;
  closeAllDropdowns();
  if (!isOpen) openDropdown(domainTrigger, domainPanel);
});

// ── Domain panel: handle checkbox changes ──────────────────────────────────
domainPanel.addEventListener('change', (e) => {
  if (!e.target.classList.contains('ms-check')) return;

  if (e.target.value === 'ALL') {
    if (e.target.checked) {
      S.selectedDomains = [];
    } else {
      e.target.checked = true; // can't uncheck "All" with nothing else selected
    }
  } else {
    S.selectedDomains = getSelectedValues(domainPanel);
  }

  syncDomainCheckboxes();
  S.selectedSections = [];
  buildSectionOptions(S.selectedDomains);
  buildDifficultyOptions(S.selectedDomains, []);
});

// ── Section trigger: toggle open/close ────────────────────────────────────
sectionTrigger.addEventListener('click', () => {
  if (sectionTrigger.disabled) return;
  const isOpen = !sectionPanel.hidden;
  closeAllDropdowns();
  if (!isOpen) {
    openDropdown(sectionTrigger, sectionPanel);
    // Desktop: start typing right away. Phones skip this so the keyboard doesn't cover the list.
    if (window.matchMedia('(hover: hover)').matches) document.getElementById('sectionSearch')?.focus();
  }
});

// ── Section panel: search box narrows the topic list ──────────────────────
document.getElementById('sectionSearch')?.addEventListener('input', filterSectionOptions);

// ── Section panel: handle checkbox changes ─────────────────────────────────
sectionPanel.addEventListener('change', (e) => {
  if (!e.target.classList.contains('ms-check')) return;

  if (e.target.value === 'ALL') {
    if (e.target.checked) {
      S.selectedSections = [];
    } else {
      e.target.checked = true; // can't uncheck "All" with nothing else selected
    }
  } else {
    S.selectedSections = getSelectedValues(sectionPanel);
  }

  syncSectionCheckboxes();
  buildDifficultyOptions(S.selectedDomains, S.selectedSections);
});

// ── Click outside: close any open dropdown ────────────────────────────────
document.addEventListener('click', (e) => {
  if (!modeDropdown.contains(e.target))       closeDropdown(modeTrigger, modePanel);
  if (!domainDropdown.contains(e.target))     closeDropdown(domainTrigger, domainPanel);
  if (!sectionDropdown.contains(e.target))    closeDropdown(sectionTrigger, sectionPanel);
  if (!difficultyDropdown.contains(e.target)) closeDropdown(difficultyTrigger, difficultyPanel);
});

// ── Escape key: close any open dropdown ───────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllDropdowns();
});

/**
 * START/RESUME BUTTON
 * Starts a new quiz or resumes existing session with current filter settings
 */
startBtn.addEventListener("click", () => startSession(false));

// ============================================================================
// EXAM WORKSTATION - map filter, phone map sheet, folded setup panel
// ============================================================================

// Map filter buttons (All / Unanswered / Flagged / Incorrect)
document.getElementById('mapFilter')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-map-filter]');
  if (!btn) return;
  S.mapFilter = btn.dataset.mapFilter;
  const state = normalizeStateForRuntime(loadState());
  if (state && state.session) renderJumpGrid(state);
});

// Phone: the Map button opens the question map as a bottom sheet
document.getElementById('mapToggleBtn')?.addEventListener('click', () => {
  if (document.getElementById('wsMap').classList.contains('open')) closeMapSheet();
  else openMapSheet();
});
document.getElementById('mapCloseBtn')?.addEventListener('click', closeMapSheet);
document.getElementById('wsBackdrop')?.addEventListener('click', closeMapSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMapSheet(); });

// Folded setup panel: "Change" opens it, "Hide" folds it again
document.getElementById('setupChangeBtn')?.addEventListener('click', () => {
  S.setupExpanded = !S.setupExpanded;
  const state = normalizeStateForRuntime(loadState());
  if (state && state.session) renderQuiz(state);
});

/**
 * START FRESH BUTTON
 * Forces creation of a brand new session with new shuffle order,
 * even if a matching session already exists
 */
newSessionBtn.addEventListener("click", () => startSession(true));

/**
 * WHAT IT DOES: Starts (or resumes) a session from the current filters
 *
 * WHY: createNewSession() throws when the filters can't produce a session
 * (no matching questions, or fewer than 65 for a timed exam). That used to be
 * logged and nothing happened on screen; now the reason shows under the buttons.
 */
function startSession(forceFresh) {
  const filters = getFiltersFromUI();
  ensureModeRulesUI();
  showSetupError('');

  try {
    // A paused clock belongs to the session being replaced, not the new one
    const previous = normalizeStateForRuntime(loadState());
    const resuming = !forceFresh && previous && previous.session && !previous.session.completed
      && previous.sessionKey === sessionKeyFor({ ...filters, mode: normalizeMode(filters.mode) });
    if (!resuming) {
      S.quizPausedState = null;
      quizCard.classList.remove('quiz-manually-paused');
      S.mapFilter = 'all';
    }
    S.setupExpanded = false;  // fold the setup back into its one-line summary

    const state = normalizeStateForRuntime(createNewSession(filters, forceFresh));
    restorePauseFromSession(state);
    renderQuiz(state);
  } catch (error) {
    console.error('[SAA Error] Start session:', error);
    showSetupError(error.message || 'This session could not be started.');
  }
}

/**
 * WHAT IT DOES: Shows (or clears, with '') the message under the setup buttons
 */
function showSetupError(message) {
  const el = document.getElementById('setupError');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

/**
 * OLD RESET BUTTON LISTENER - REMOVED
 * Reset is now handled by navigation tab via switchTab('reset')
 */
// DELETED: resetBtn listener - element no longer exists (replaced with nav tab)

/**
 * PAUSE/RESUME BUTTON (Timed Mode Only)
 * Manually pause and resume timed quiz with timer adjustment
 */
export const pauseBtnEl = document.getElementById('pauseBtn');
if (pauseBtnEl) {
  pauseBtnEl.addEventListener('click', () => {
    safeOperation('Pause/Resume Quiz', () => {
      const state = normalizeStateForRuntime(loadState());
      if (!state || !state.session || state.session.completed) return;

      togglePause(state);
    }, undefined);
  });
}

/**
 * PREVIOUS BUTTON
 * Navigate to the previous question in the quiz
 */
prevBtn.addEventListener("click", () => {
  safeOperation('Navigate Previous', () => {
    const state = normalizeStateForRuntime(loadState());
    if (!state || !state.session) {
      console.warn('[SAA Warning] No active session for previous navigation');
      return;
    }

    if (state.session.currentIndex > 0) {
      state.session.currentIndex -= 1;
      persistRuntimeState(state);
      renderQuiz(state);
    }
  }, undefined);
});

/**
 * NEXT BUTTON
 * Navigate to the next question in the quiz
 */
nextBtn.addEventListener("click", () => {
  safeOperation('Navigate Next', () => {
    const state = normalizeStateForRuntime(loadState());
    if (!state || !state.session) {
      console.warn('[SAA Warning] No active session for next navigation');
      return;
    }

    if (state.session.currentIndex < state.session.questionIds.length - 1) {
      state.session.currentIndex += 1;
      persistRuntimeState(state);
      renderQuiz(state);
    }
  }, undefined);
});

/**
 * SUBMIT/FINISH BUTTON
 * Completes the quiz and shows results
 * - Timed mode: Asks for confirmation before ending
 * - Review mode: Immediately shows results
 */
submitBtn.addEventListener("click", async () => {
  const state = safeOperation('Load State for Submit', () => normalizeStateForRuntime(loadState()), null);
  if (!state || !state.session) {
    console.warn('[SAA Warning] No active session to submit');
    return;
  }

  if (state.session.completed) {
    console.info('[SAA Info] Session already completed');
    return;
  }

  // Timed mode: the review step before submitting (can't undo)
  if (state.session.mode === "timed") {
    closeMapSheet();
    const choice = await submitReviewDialog(state.session);
    if (choice === 'flagged' || choice === 'unanswered') {
      const latest = normalizeStateForRuntime(loadState());
      if (latest && latest.session && !latest.session.completed) {
        // Going back to questions means working again: end the pause first
        if (S.quizPausedState !== null) togglePause(latest);
        reviewQuestions(latest, choice);
      }
      return;
    }
    if (choice !== 'submit') {
      console.info('[SAA Info] User cancelled exam submission');
      return;
    }
  }

  safeOperation('Submit Quiz', () => {
    // Reload: the timer may have auto-submitted while the dialog was open
    const latest = normalizeStateForRuntime(loadState());
    if (!latest || !latest.session || latest.session.completed) return;
    showResults(latest, false);
  }, undefined);
});

/**
 * OLD PERFORMANCE BUTTON LISTENERS - REMOVED
 * Performance is now accessed via navigation tabs
 * These listeners are no longer needed
 */
// DELETED: viewPerformanceBtn listener - now handled by switchTab()
// DELETED: closePerformanceBtn listener - no longer needed (tab navigation)

// ============================================================================
// APP STARTUP
// ============================================================================

/**
 * Initialize the application when page loads
 * If init fails, show error to user with helpful message
 */
init().catch((e) => {
  console.error('[SAA Error] Initialization failed:', e);
  showLoadError(`Something went wrong while starting (${e.message || String(e)}). Reload the page to try again.`);
});
