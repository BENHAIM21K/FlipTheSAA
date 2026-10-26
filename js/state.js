// FlipTheSAA — Shared runtime state

// ============================================================================
// SHARED RUNTIME STATE
// ============================================================================
// Every value that more than one module reads AND changes lives on this one
// object (an imported ES module binding can't be reassigned from outside).
// Persistent data still lives in localStorage (see storage.js).

export const S = {
  QUESTIONS: [],            // All question objects loaded from questions.json
  QMAP: new Map(),          // Fast lookup: questionId → question object
  timerInterval: null,      // Reference to the running timer (for cleanup)
  timerSeed: null,          // Seed of the session the running timer belongs to
  timerState: null,         // Latest state object the timer reads on each tick

  // Practice setup filters ([] = all / no filter)
  selectedMode: 'review',
  selectedDifficulty: 'ALL',
  selectedDomains: [],
  selectedSections: [],

  // Navigation
  currentTab: 'home',       // Current active tab
  quizPausedState: null,    // { pausedAt: timestamp, frozenTime: remaining seconds } while paused
  navigationLocked: false,  // Prevents rapid tab switching

  // Exam workstation
  mapFilter: 'all',         // Question map filter: all | unanswered | flagged | incorrect
  setupExpanded: false,     // The user opened the folded setup panel during a session

  // Tab data and view state
  tryQuestionId: null,      // Question shown in Home's "Try one question"
  tryOrder: null,           // Order its choices are shown in (see js/choice-order.js)
  studyGroupsCache: null,   // studygroups.json once loaded
  resourcesCache: null,     // resources.json once loaded
  serviceIndex: null,       // cheat-sheet service → ids of the questions about it (js/service-match.js), built on first use
  csActiveCategory: 'all',  // Cheat sheet category filter
  resActiveFilter: 'all'    // External links type filter
};
