// FlipTheSAA — Tab navigation
import { TAB_KEY } from './config.js';
import { normalizeStateForRuntime, pauseSession, restorePauseFromSession, setPauseButton } from './exam.js';
import { TAB_LABELS, renderHome } from './home.js';
import { renderPerformanceDashboard } from './performance.js';
import { closeMapSheet, renderQuiz } from './quiz-view.js';
import { renderResources } from './resources.js';
import { resetAllProgress } from './shell.js';
import { S } from './state.js';
import { loadState } from './storage.js';
import { leaveStudyGroups, renderStudyGroups } from './study-groups.js';
import { icon, safeOperation } from './util.js';

// ============================================================================
// NAVIGATION FUNCTIONS - Tab switching and state management
// ============================================================================

/**
 * WHAT IT DOES: Switches between navigation tabs and manages content visibility
 *
 * WHY WE NEED IT: Handles tab navigation while preserving quiz state and
 * managing timer pause/resume for timed mode. This is the core of the new
 * navigation system.
 */
export function switchTab(tabName) {
  safeOperation('Switch Tab', () => {
    // Reset now lives in the Performance tab's "Your data" panel (see resetAllProgress)
    if (!TAB_LABELS[tabName]) {
      console.warn('[SAA Warning] Unknown tab, showing home:', tabName);
      tabName = 'home';
    }

    // === CHECK QUIZ STATE ===
    const state = normalizeStateForRuntime(loadState());
    const hasActiveTimedQuiz = state &&
                                state.session &&
                                !state.session.completed &&
                                state.session.mode === 'timed';

    const leavingTimedQuiz = S.currentTab === 'practice' && hasActiveTimedQuiz;
    const returningToTimedQuiz = tabName === 'practice' && hasActiveTimedQuiz && S.currentTab !== 'practice';

    // === LEAVING TIMED QUIZ: PAUSE TIMER ===
    if (leavingTimedQuiz) {
      console.info('[SAA Info] Leaving timed quiz, pausing timer');

      // Only pause if not already paused (saved with the session, so a reload keeps it)
      if (!S.quizPausedState) {
        pauseSession(state);
        console.info('[SAA Info] Timer auto-paused (navigation)');
      } else {
        console.info('[SAA Info] Already paused, keeping pause state');
      }
    }

    // A question-map sheet left open on a phone shouldn't follow you to another tab
    closeMapSheet();

    // A lesson recording shouldn't keep playing behind another tab
    if (S.currentTab === 'studygroups' && tabName !== 'studygroups') leaveStudyGroups();

    // === UPDATE NAVIGATION STATE ===
    const previousTab = S.currentTab;
    S.currentTab = tabName;
    localStorage.setItem(TAB_KEY, tabName);

    // Update tab button active states
    document.querySelectorAll('.nav-tab').forEach(tab => {
      const tabId = tab.getAttribute('data-tab');
      if (tabId === tabName) {
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'page');
      } else {
        tab.classList.remove('active');
        tab.removeAttribute('aria-current');
      }
    });

    // The top bar names the current screen (it is the screen's title on a phone)
    const topbarTitle = document.getElementById('topbarTitle');
    if (topbarTitle) topbarTitle.textContent = TAB_LABELS[tabName];

    // === UPDATE SECTION VISIBILITY ===
    document.querySelectorAll('.page-section').forEach(section => {
      section.classList.remove('active');
    });

    const sectionMap = {
      'home': 'homeSection',
      'practice': 'practiceSection',
      'performance': 'performanceSection',
      'studygroups': 'studyGroupsSection',
      'resources': 'resourcesSection',
      'contact': 'contactSection'
    };

    const targetSection = document.getElementById(sectionMap[tabName]);

    if (targetSection) {
      targetSection.classList.add('active');
    } else {
      console.error('[SAA Error] Could not find section with ID:', sectionMap[tabName]);
    }

    // === RETURNING TO TIMED QUIZ: RENDER WITH PAUSE STATE ===
    if (returningToTimedQuiz) {
      console.info('[SAA Info] Returning to timed quiz');

      // Guard: Only keep pause state if session exists and is not completed
      if (S.quizPausedState && (!state.session || state.session.completed)) {
        console.info('[SAA Info] Clearing stale pause state (session completed or missing)');
        S.quizPausedState = null;
      }

      // After a reload the pause is only in the saved session: put it back on screen
      restorePauseFromSession(state);

      // Update pause button icon based on pause state
      setPauseButton(S.quizPausedState !== null);
      if (S.quizPausedState) console.info('[SAA Info] Returning to paused quiz');

      // Render quiz (buttons will be disabled if paused)
      renderQuiz(state);
    } else if (tabName === 'practice' && state && state.session && !state.session.completed) {
      renderQuiz(state);
    }

    // === TAB-SPECIFIC RENDERING ===
    if (tabName === 'home') {
      renderHome();
    }

    if (tabName === 'performance') {
      renderPerformanceDashboard();
    }

    if (tabName === 'studygroups') {
      renderStudyGroups();
    }

    if (tabName === 'resources') {
      renderResources();
    }

    // === MOBILE: CLOSE MENU ===
    const navMenu = document.getElementById('navMenu');
    if (navMenu && navMenu.classList.contains('open')) {
      closeMobileMenu();
    }

    console.info(`[SAA Info] Switched from '${previousTab}' to '${tabName}'`);
  }, undefined);
}

/**
 * WHAT IT DOES: Debounced version of switchTab to prevent rapid clicking issues
 */
export function switchTabDebounced(tabName) {
  if (S.navigationLocked) {
    console.info('[SAA Info] Navigation locked, ignoring click');
    return;
  }

  S.navigationLocked = true;
  switchTab(tabName);

  setTimeout(() => {
    S.navigationLocked = false;
  }, 300);
}

/**
 * WHAT IT DOES: Closes the phone menu sheet and resets the menu button
 */
export function closeMobileMenu() {
  const navMenu = document.getElementById('navMenu');
  if (navMenu) navMenu.classList.remove('open');
  const hamburger = document.getElementById('navHamburger');
  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open menu');
    hamburger.innerHTML = icon('menu');
  }
}
