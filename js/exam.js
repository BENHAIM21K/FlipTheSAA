// FlipTheSAA — Exam engine: timer, sessions, flags, scoring, pause
import { isCorrectAnswer } from './answers.js';
import { EXAM_DURATION_SEC, EXAM_SCORED_QUESTIONS, EXAM_TOTAL_QUESTIONS, PASSING_SCORE, REVIEW_MAX_QUESTIONS, TIMED_TOTAL_POINTS } from './config.js';
import { layoutsForSession } from './choice-order.js';
import { examPoints } from './scoring.js';
import { quizCard, timerEl } from './dom.js';
import { filteredQuestions, sessionKeyFor } from './filters.js';
import { renderQuiz, showResults } from './quiz-view.js';
import { S } from './state.js';
import { loadChoiceLayouts, loadState, saveState } from './storage.js';
import { icon, normalizeMode, nowMs, pickSeededSubset, safeOperation, seededShuffle } from './util.js';

// ============================================================================
// TIMER FUNCTIONS - Countdown timer for Timed mode
// ============================================================================

/**
 * WHAT IT DOES: Stops the running countdown timer
 *
 * WHY WE NEED IT: Prevents memory leaks and ensures only one timer runs
 * at a time. Called when switching questions, finishing exam, or leaving page.
 *
 * SIDE EFFECTS: Clears the interval and sets S.timerInterval to null
 */
export function stopTimer() {
  if (S.timerInterval) {
    clearInterval(S.timerInterval);  // Stop the interval
    S.timerInterval = null;  // Clear the reference
  }
  S.timerSeed = null;
}

/**
 * WHAT IT DOES: Formats seconds into HH:MM:SS clock display
 *
 * WHY WE NEED IT: The timer stores seconds, but users need to see a
 * readable clock format like "02:10:00" (2 hours, 10 minutes, 0 seconds)
 *
 * PARAMETERS:
 * - totalSec: Number of seconds to format (e.g., 7800 for 130 minutes)
 *
 * RETURNS: Formatted time string "HH:MM:SS"
 *
 * EXAMPLE:
 * formatClock(7800) → "02:10:00"
 * formatClock(90) → "00:01:30"
 */
export function formatClock(totalSec) {
  const s = Math.max(0, totalSec);  // Prevent negative time
  const hh = Math.floor(s / 3600);  // Hours
  const mm = Math.floor((s % 3600) / 60);  // Minutes
  const ss = s % 60;  // Seconds
  const pad = (n) => String(n).padStart(2, "0");  // Add leading zero
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/**
 * WHAT IT DOES: Calculates how many seconds remain in the timed exam
 *
 * WHY WE NEED IT: Timer needs to account for page refreshes and browser
 * sleep. We calculate elapsed time from the start timestamp each time.
 *
 * HOW IT WORKS:
 * 1. Get current time - start time = elapsed time
 * 2. Total duration - elapsed time = remaining time
 *
 * PARAMETERS:
 * - session: Session object with startedAtMs and durationSec
 *
 * RETURNS: Number of seconds remaining (can be negative if time expired)
 *
 * EXAMPLE:
 * If exam started 60 seconds ago with 130-minute duration:
 * getRemainingSec(session) → 7740 seconds (129 minutes left)
 */
export function getRemainingSec(session) {
  const elapsed = Math.floor((nowMs() - session.startedAtMs) / 1000);
  return session.durationSec - elapsed;
}

/**
 * WHAT IT DOES: Updates the timer display and checks if time expired
 *
 * WHY WE NEED IT: Called every second to update the countdown and
 * automatically submit the exam when time runs out.
 *
 * HOW IT WORKS:
 * 1. Calculate remaining time
 * 2. Update the timer display text
 * 3. If time <= 0 and exam not completed, auto-submit
 *
 * PARAMETERS:
 * - state: Current app state with session data
 *
 * SIDE EFFECTS:
 * - Updates timerEl.textContent
 * - May auto-complete session and show results
 * - Persists state to localStorage
 */
export function updateTimerUI(state) {
  const session = state.session;

  // If paused, show frozen time instead of calculated time
  const remaining = S.quizPausedState && S.quizPausedState.frozenTime !== undefined
    ? S.quizPausedState.frozenTime
    : getRemainingSec(session);

  // While paused the clock stays on screen, frozen, and says so
  const isPaused = S.quizPausedState !== null;
  timerEl.classList.toggle('paused', isPaused);
  timerEl.innerHTML = `<span class="timer-label">${isPaused ? 'Paused' : 'Time left'}</span><span class="timer-value">${formatClock(remaining)}</span>`;

  // Add warning class when time is low (< 5 minutes)
  if (remaining > 0 && remaining < 300) {
    timerEl.classList.add('warning');
  } else {
    timerEl.classList.remove('warning');
  }

  // Time expired! Auto-submit the exam
  if (remaining <= 0 && !session.completed) {
    session.completed = true;
    state.session = session;
    persistRuntimeState(state);
    stopTimer();
    showResults(state, true);  // true = auto-ended (time's up)
  }
}

/**
 * WHAT IT DOES: Starts the countdown timer for Timed mode
 *
 * WHY WE NEED IT: Begins the 130-minute countdown when user starts or
 * resumes a timed exam.
 *
 * HOW IT WORKS:
 * 1. Stop any existing timer (cleanup)
 * 2. Show the timer element
 * 3. Update display immediately
 * 4. Set interval to update every second
 *
 * PARAMETERS:
 * - state: Current app state with session data
 *
 * SIDE EFFECTS:
 * - Shows timer element
 * - Creates interval that runs every 1000ms
 * - Updates global S.timerInterval variable
 */
export function startTimer(state) {
  stopTimer();  // Clean up any existing timer
  S.timerState = state;
  S.timerSeed = state.session.seed;
  timerEl.hidden = false;  // Make timer visible
  updateTimerUI(state);  // Show initial time immediately
  // Each tick reads S.timerState, the latest copy renderQuiz was given, so an
  // auto-submit at 0:00 always scores the newest answers
  S.timerInterval = setInterval(() => updateTimerUI(S.timerState), 1000);
}

/**
 * WHAT IT DOES: Keeps the clock running for this session without restarting it
 *
 * WHY: renderQuiz runs on every click; it used to stop and recreate the
 * interval each time. Now the interval starts once per session and each
 * render only hands it the latest state.
 */
export function ensureTimer(state) {
  S.timerState = state;
  if (S.timerInterval && S.timerSeed === state.session.seed) {
    timerEl.hidden = false;
    updateTimerUI(state);
    return;
  }
  startTimer(state);
}

export function createNewSession(filters, forceFresh) {
  filters.mode = normalizeMode(filters.mode);

  const key = sessionKeyFor(filters);
  const existing = loadState();

  // Resume if same key and not forcing fresh
  if (
    !forceFresh &&
    existing &&
    existing.sessionKey === key &&
    existing.session &&
    !existing.session.completed
  ) {
    return existing;
  }

  // Build new session
  let list = filteredQuestions(filters);

  // Generate seed for deterministic shuffling
  const seed = `${key}::${nowMs()}`;

  // Timed mode: select 65 random questions from filtered pool
  if (filters.mode === "timed") {
    // list is already filtered by difficulty (line 866)
    // DO NOT overwrite it with S.QUESTIONS

    // Ensure we have at least 65 questions in the filtered pool
    if (list.length < EXAM_TOTAL_QUESTIONS) {
      throw new Error(
        `Only ${list.length} questions match this difficulty, and a timed exam needs ${EXAM_TOTAL_QUESTIONS}. Choose "All difficulties" or use Review mode.`
      );
    }

    // If more than 65 questions, randomly select 65 using seeded subset
    // This ensures questions are picked from throughout the pool (not just first 65)
    if (list.length > EXAM_TOTAL_QUESTIONS) {
      const questionIds = list.map(q => q.id);
      const selectedIds = pickSeededSubset(
        questionIds,
        EXAM_TOTAL_QUESTIONS,
        seed + "::timedSelection"
      );
      list = selectedIds.map(id => S.QMAP.get(id));
    }
  }

  // Review mode: limit to 50 questions max
  // Use RANDOM selection (not first 50 or last 50)
  if (filters.mode === "review") {
    if (list.length > REVIEW_MAX_QUESTIONS) {
      const questionIds = list.map(q => q.id);
      const selectedIds = pickSeededSubset(
        questionIds,
        REVIEW_MAX_QUESTIONS,
        seed + "::reviewSelection"
      );
      list = selectedIds.map(id => S.QMAP.get(id));
    }
  }

  if (list.length === 0) throw new Error("No questions match these filters. Remove a section or the difficulty and try again.");
  const order = seededShuffle(list.map((q) => q.id), seed);

  const session = {
    version: 1,
    mode: filters.mode,
    domainIds: filters.mode === "timed" ? [] : (filters.domainIds || []),
    sections:  filters.mode === "timed" ? [] : (filters.sections  || []),
    difficulty: filters.difficulty || "ALL", // restored on resume (see sessionDifficulty)
    seed,
    questionIds: order,
    choiceOrder: layoutsForSession(order.map((id) => S.QMAP.get(id)), seed, loadChoiceLayouts()), // { [id]: [original index per display position] }
    answers: {}, // { [id]: choiceIndex } (original index into q.choices, whatever order it was shown in)
    flaggedQuestions: [], // Array of question IDs flagged for review (Timed mode only)
    checkedQuestions: new Set(), // Question IDs where user clicked "Check Answer" (Review mode only)
    currentIndex: 0,
    createdAtMs: nowMs(),
    completed: false
  };

  if (filters.mode === "timed") {
    session.startedAtMs = nowMs();
    session.durationSec = EXAM_DURATION_SEC;

    // Only 50 random question IDs are scored (hidden) -> 1000 max
    const scored = pickSeededSubset(order, EXAM_SCORED_QUESTIONS, seed + "::scored");
    session.scoredIds = new Set(scored);
  }

  // Convert Sets to arrays for storage
  const state = {
    sessionKey: key,
    session: {
      ...session,
      scoredIds: session.scoredIds ? Array.from(session.scoredIds) : null,
      checkedQuestions: Array.from(session.checkedQuestions)
    }
  };

  saveState(state);
  return state;
}

/**
 * WHAT IT DOES: Creates a Review session from an explicit list of questions:
 * the mistake drill (questions you last answered wrong, most-missed first)
 *
 * WHY separate from createNewSession: the drill isn't a filter over the bank;
 * its order is meaningful (worst first), so it isn't shuffled.
 */
export function createDrillSession(questionIds) {
  const ids = questionIds.filter(id => S.QMAP.has(id)).slice(0, REVIEW_MAX_QUESTIONS);
  if (!ids.length) throw new Error("There are no mistakes to drill.");
  const created = nowMs();

  const state = {
    sessionKey: "review::DRILL::ALL::ALL",
    session: {
      version: 1,
      mode: "review",
      drill: true,
      domainIds: [],
      sections: [],
      difficulty: "ALL",
      seed: `drill::${created}`,
      questionIds: ids,
      choiceOrder: layoutsForSession(ids.map((id) => S.QMAP.get(id)), `drill::${created}`, loadChoiceLayouts()),
      answers: {},
      flaggedQuestions: [],
      checkedQuestions: [],
      currentIndex: 0,
      createdAtMs: created,
      completed: false,
      scoredIds: null
    }
  };
  saveState(state);
  return state;
}

/**
 * WHAT IT DOES: Creates a Review session from the questions about one cheat-sheet service
 * (the "Practice <service>" button in the cheat-sheet drawer)
 *
 * WHY separate from createNewSession: the questions are not a filter over topics; they are the ones that name the
 * service in their correct answer (js/service-match.js). A random REVIEW_MAX_QUESTIONS of them when there are more.
 * It is an ordinary Review session (it counts in Performance like any topic review); `service` only labels it.
 */
export function createServiceSession(service, questionIds) {
  const valid = questionIds.filter((id) => S.QMAP.has(id));
  if (!valid.length) throw new Error(`There are no questions about ${service} yet.`);
  const created = nowMs();
  const seed = `service::${service}::${created}`;
  const ids = seededShuffle(pickSeededSubset(valid, REVIEW_MAX_QUESTIONS, seed + "::reviewSelection"), seed);

  const state = {
    sessionKey: `review::SERVICE::${service}`,
    session: {
      version: 1,
      mode: "review",
      service,
      domainIds: [],
      sections: [],
      difficulty: "ALL",
      seed,
      questionIds: ids,
      choiceOrder: layoutsForSession(ids.map((id) => S.QMAP.get(id)), seed, loadChoiceLayouts()),
      answers: {},
      flaggedQuestions: [],
      checkedQuestions: [],
      currentIndex: 0,
      createdAtMs: created,
      completed: false,
      scoredIds: null
    }
  };
  saveState(state);
  return state;
}

export function normalizeStateForRuntime(state) {
  if (!state || !state.session) return state;

  // Migrate any non-timed mode (including old "practice") to "review"
  state.session.mode = normalizeMode(state.session.mode);

  // Migrate sessionKey prefix if needed
  if (typeof state.sessionKey === "string") {
    state.sessionKey = state.sessionKey.replace(/^practice::/i, "review::");
  }

  // A session saved before questions were removed from the bank still lists their ids. Without this the exam
  // would crash on them when it is drawn or scored (the results never appear), so they are dropped here.
  const listed = state.session.questionIds;
  if (Array.isArray(listed) && listed.some((id) => !S.QMAP.has(id))) {
    const s = state.session;
    const known = (id) => S.QMAP.has(id);
    const keepKnown = (obj) => (obj && typeof obj === "object" && !Array.isArray(obj)) ? Object.fromEntries(Object.entries(obj).filter(([id]) => known(id))) : obj;
    const keepKnownList = (list) => Array.isArray(list) ? list.filter(known) : list instanceof Set ? new Set([...list].filter(known)) : list;
    s.questionIds = listed.filter(known);
    s.answers = keepKnown(s.answers) || {};
    s.eliminated = keepKnown(s.eliminated);
    s.choiceOrder = keepKnown(s.choiceOrder);
    s.flaggedQuestions = keepKnownList(s.flaggedQuestions) || [];
    s.checkedQuestions = keepKnownList(s.checkedQuestions);
    s.scoredIds = keepKnownList(s.scoredIds);
    if (!s.questionIds.length) return null;
    s.currentIndex = Math.min(Math.max(0, s.currentIndex || 0), s.questionIds.length - 1);
    console.warn(`[SAA Warning] Dropped ${listed.length - s.questionIds.length} question(s) that are no longer in the bank from the saved session`);
  }

  if (state.session.mode === "timed") {
    // Good case: array from localStorage -> Set
    if (Array.isArray(state.session.scoredIds)) {
      state.session.scoredIds = new Set(state.session.scoredIds);
    }
    // Bad case: {} or null -> rebuild deterministically from seed + questionIds
    else if (!(state.session.scoredIds instanceof Set)) {
      const rebuilt = pickSeededSubset(
        state.session.questionIds,
        EXAM_SCORED_QUESTIONS,
        state.session.seed + "::scored"
      );
      state.session.scoredIds = new Set(rebuilt);
    }
  }

  // Convert checkedQuestions from array to Set (for both timed and review modes)
  if (Array.isArray(state.session.checkedQuestions)) {
    state.session.checkedQuestions = new Set(state.session.checkedQuestions);
  } else if (!(state.session.checkedQuestions instanceof Set)) {
    state.session.checkedQuestions = new Set();
  }

  return state;
}

export function persistRuntimeState(state) {
  if (!state || !state.session) return;

  const s = state.session;

  const toStore = {
    sessionKey: state.sessionKey,
    session: {
      ...s,
      checkedQuestions: Array.from(s.checkedQuestions || []),
      scoredIds:
        s.mode === "timed"
          ? Array.from(s.scoredIds instanceof Set ? s.scoredIds : [])
          : null
    }
  };

  saveState(toStore);
}

/**
 * WHAT IT DOES: Gets the current question object being displayed
 *
 * PARAMETERS:
 * - state: Current app state
 *
 * RETURNS: Question object from S.QMAP
 */
export function getCurrentQuestion(state) {
  const { session } = state;
  const qid = session.questionIds[session.currentIndex];
  return S.QMAP.get(qid);
}

/**
 * WHAT IT DOES: Toggles the flag status for the current question
 *
 * WHY WE NEED IT: In Timed mode (like real AWS exams), users can flag
 * questions they want to review later. This adds/removes the current
 * question ID from the flaggedQuestions array.
 *
 * PARAMETERS:
 * - state: Current app state
 *
 * SIDE EFFECTS:
 * - Modifies session.flaggedQuestions array
 * - Persists state to localStorage
 * - Re-renders quiz to update flag button and jump grid
 */
export function toggleFlag(state) {
  safeOperation('Toggle Question Flag', () => {
    const { session } = state;
    const currentQid = session.questionIds[session.currentIndex];

    // Ensure flaggedQuestions array exists (for backward compatibility)
    if (!Array.isArray(session.flaggedQuestions)) {
      session.flaggedQuestions = [];
    }

    // Toggle flag: add if not flagged, remove if already flagged
    const flagIndex = session.flaggedQuestions.indexOf(currentQid);
    if (flagIndex === -1) {
      session.flaggedQuestions.push(currentQid);
      console.info(`[SAA Info] Flagged question ${currentQid}`);
    } else {
      session.flaggedQuestions.splice(flagIndex, 1);
      console.info(`[SAA Info] Unflagged question ${currentQid}`);
    }

    // Save and re-render
    persistRuntimeState(state);
    renderQuiz(state);
  }, undefined);
}

export function computeScore(state) {
  const { session } = state;

  let answeredTotal = 0;
  let correctTotal = 0;

  let answeredScored = 0;
  let correctScored = 0;

  // Timed exam: the scored questions are worth different points (js/scoring.js), always 1000 together
  const scoredQuestions = session.mode === "timed" && session.scoredIds
    ? session.questionIds.filter((id) => session.scoredIds.has(id)).map((id) => S.QMAP.get(id)).filter(Boolean)
    : [];
  const pointValues = examPoints(scoredQuestions, TIMED_TOTAL_POINTS);
  let earnedPoints = 0;

  for (const qid of session.questionIds) {
    const q = S.QMAP.get(qid);
    const ans = session.answers[qid];

    const answered = ans !== undefined;
    const correct = answered && isCorrectAnswer(ans, q.answer);

    // In review mode: only count checked questions OR all questions if exam completed
    const shouldCount = session.mode === "timed"
      ? true  // Timed mode: count all questions
      : (session.completed || session.checkedQuestions?.has(qid));  // Review: only checked questions

    if (answered && shouldCount) answeredTotal++;
    if (correct && shouldCount) correctTotal++;

    if (session.mode === "timed") {
      if (session.scoredIds && session.scoredIds.has(qid)) {
        if (answered) answeredScored++;
        if (correct) {
          correctScored++;
          earnedPoints += pointValues.get(qid) || 0;
        }
      }
    }
  }

  const totalQuestions = session.questionIds.length;

  if (session.mode === "timed") {
    const points = earnedPoints;
    const totalPoints = TIMED_TOTAL_POINTS; // 1000
    const passed = points >= PASSING_SCORE;
    const unscoredIds = session.questionIds.filter((id) => !(session.scoredIds && session.scoredIds.has(id)));

    return {
      answeredTotal,
      correctTotal,
      totalQuestions,
      answeredScored,
      correctScored,
      scoredCount: scoredQuestions.length,
      unscoredIds,
      pointValues,
      points,
      totalPoints,
      passed
    };
  }

  // REVIEW: scaled to 1000 (unanswered counts as wrong)
  const points = totalQuestions ? Math.round((correctTotal / totalQuestions) * 1000) : 0;
  const totalPoints = 1000;
  const passed = points >= PASSING_SCORE;

  return {
    answeredTotal,
    correctTotal,
    totalQuestions,
    points,
    totalPoints,
    passed
  };
}

/**
 * WHAT IT DOES: Sets the pause button's icon and accessible name
 */
export function setPauseButton(isPaused) {
  const btn = document.getElementById('pauseBtn');
  if (!btn) return;
  const label = isPaused ? 'Resume quiz' : 'Pause quiz';
  btn.innerHTML = `${icon(isPaused ? 'play' : 'pause')}<span>${isPaused ? 'Resume' : 'Pause'}</span>`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

/**
 * WHAT IT DOES: Toggles pause state for timed quiz (no overlay)
 * WHY IT EXISTS: Allows user to pause/resume by clicking pause button
 */
export function togglePause(state) {
  safeOperation('Toggle Pause', () => {
    if (S.quizPausedState !== null) {
      resumeSession(state);
      startTimer(state);
      renderQuiz(state);  // Re-render to enable buttons
      console.info('[SAA Info] Quiz resumed');
    } else {
      pauseSession(state);
      renderQuiz(state);  // Re-render to disable buttons
      console.info('[SAA Info] Quiz paused');
    }
  }, undefined);
}

/**
 * WHAT IT DOES: Pauses a timed session: stops the clock and records the moment
 * in the SAVED session (session.pausedAtMs), not only in memory
 *
 * WHY: The pause used to live only in memory, so reloading the page during a
 * pause resumed the clock as if the pause never happened, costing exam time.
 */
export function pauseSession(state) {
  stopTimer();
  const pausedAt = nowMs();
  state.session.pausedAtMs = pausedAt;
  persistRuntimeState(state);

  S.quizPausedState = { pausedAt, frozenTime: getRemainingSec(state.session) };
  quizCard.classList.add('quiz-manually-paused');
  setPauseButton(true);
}

/**
 * WHAT IT DOES: Ends a pause: moves the start time forward by the paused
 * duration (so the pause doesn't count) and clears the saved pause
 */
export function resumeSession(state) {
  const pausedAt = state.session.pausedAtMs || (S.quizPausedState && S.quizPausedState.pausedAt);
  if (pausedAt) {
    const pauseDuration = nowMs() - pausedAt;
    state.session.startedAtMs += pauseDuration;
    console.info(`[SAA Info] Resumed after ${Math.floor(pauseDuration / 1000)}s pause`);
  }
  delete state.session.pausedAtMs;
  persistRuntimeState(state);

  S.quizPausedState = null;
  quizCard.classList.remove('quiz-manually-paused');
  setPauseButton(false);
}

/**
 * WHAT IT DOES: After a reload, puts a saved pause back on screen
 *
 * WHY: S.quizPausedState is memory only; session.pausedAtMs is the saved copy.
 * Does nothing if the session isn't a paused, unfinished timed exam.
 */
export function restorePauseFromSession(state) {
  const s = state && state.session;
  if (!s || s.mode !== 'timed' || s.completed || !s.pausedAtMs || S.quizPausedState) return;

  S.quizPausedState = {
    pausedAt: s.pausedAtMs,
    frozenTime: s.durationSec - Math.floor((s.pausedAtMs - s.startedAtMs) / 1000)
  };
  quizCard.classList.add('quiz-manually-paused');
  setPauseButton(true);
}
