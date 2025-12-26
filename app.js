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
      - Only 50 random questions are scored (hidden from user)
      - Simulates real AWS exam experience

   SCORING RULES:
   - TIMED: 65 questions total, 50 random scored → 1000 max (50 × 20 = 1000)
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
// CONSTANTS - Configuration values for the quiz
// ============================================================================

const STATE_KEY = "saa_practice_state_v1"; // localStorage key for current session
const HISTORY_KEY = "saa_practice_history_v1"; // localStorage key for quiz history
const MAX_HISTORY_SESSIONS = 50; // Keep most recent 50 sessions (FIFO)

const EXAM_DURATION_SEC = 130 * 60; // 130 minutes = 7800 seconds (AWS exam time)
const EXAM_TOTAL_QUESTIONS = 65; // Standard AWS SAA exam question count
const EXAM_SCORED_QUESTIONS = 50; // Only 50 of 65 questions count (like real exam)
const REVIEW_MAX_QUESTIONS = 50; // Maximum questions in review mode

const POINTS_PER_SCORED_QUESTION = 20; // 50 questions × 20 points = 1000 max
const PASSING_SCORE = 720; // 720/1000 = 72% passing threshold

// ============================================================================
// GLOBAL STATE - Application runtime variables
// ============================================================================

let QUESTIONS = []; // Array of all question objects loaded from questions.json
let QMAP = new Map(); // Fast lookup: questionId → question object
let timerInterval = null; // Reference to the running timer (for cleanup)

// Navigation state
let currentTab = 'home'; // Current active tab
let quizPausedState = null; // Stores timer state when paused: { pausedAt: timestamp, frozenTime: remaining seconds }
let navigationLocked = false; // Prevents rapid tab switching

// ============================================================================
// DOM REFERENCES - Cache all HTML element references for performance
// ============================================================================

// Setup card controls (shown before starting quiz)
const modeSelect = document.getElementById("modeSelect"); // Dropdown: Review or Timed
const domainSelect = document.getElementById("domainSelect"); // Dropdown: D1, D2, D3, D4, or ALL
const sectionSelect = document.getElementById("sectionSelect"); // Dropdown: EC2, S3, IAM, etc. or ALL
const startBtn = document.getElementById("startBtn"); // "Start" or "Resume" button
const newSessionBtn = document.getElementById("newSessionBtn"); // "Start Fresh" button
// const resetBtn = document.getElementById("resetBtn"); // REMOVED - now handled by navigation tab
const hintText = document.getElementById("hintText"); // Help text below dropdowns

// Quiz card elements (shown during active quiz)
const quizCard = document.getElementById("quizCard"); // Main quiz container
const questionBox = document.getElementById("questionBox"); // Question text and choices area
const progressText = document.getElementById("progressText"); // "Question X/Y • Mode: REVIEW"
const metaText = document.getElementById("metaText"); // "Tags: D1 • IAM"
const timerEl = document.getElementById("timer"); // Timer display (timed mode only)
const scoreMini = document.getElementById("scoreMini"); // "Answered: X/Y" or final score
const prevBtn = document.getElementById("prevBtn"); // "Previous" navigation button
const nextBtn = document.getElementById("nextBtn"); // "Next" navigation button
const submitBtn = document.getElementById("submitBtn"); // "Finish" or "End Exam" button
const jumpGrid = document.getElementById("jumpGrid"); // Question number grid (1,2,3...65)
const resultBox = document.getElementById("resultBox"); // Final results and review section

// Legacy element (hidden, not used)
const sectionButtons = document.getElementById("sectionButtons"); // Old UI element (deprecated)

// ============================================================================
// SECTION ORDER - Defines the display order for AWS service sections
// ============================================================================
// WHY: This ensures sections appear in a logical, alphabetical order in the
// dropdown menu, making it easier for users to find specific AWS services.
const SECTION_ORDER = [
  "EC2",          // Elastic Compute Cloud
  "Auto Scaling", // Auto Scaling Groups
  "DynamoDB",     // NoSQL Database
  "EBS",          // Elastic Block Store
  "EFS",          // Elastic File System
  "ELB",          // Elastic Load Balancing
  "IAM",          // Identity and Access Management
  "Lambda",       // Serverless Functions
  "RDS",          // Relational Database Service
  "SQS",          // Simple Queue Service
  "S3",           // Simple Storage Service
  "VPC",          // Virtual Private Cloud
  "CloudFront",   // Content Delivery Network
  "Route 53",     // DNS Service
  "CloudWatch",   // Monitoring and Logging
  "KMS"           // Key Management Service
];

// ============================================================================
// ERROR HANDLING - Safe operation wrapper for debugging
// ============================================================================

/**
 * WHAT IT DOES: Safely executes functions and catches any errors that occur
 *
 * WHY WE NEED IT: Prevents the entire app from crashing when something goes
 * wrong. Instead of a blank screen, we log helpful error info to the console
 * and return a fallback value so the app can continue running.
 *
 * PARAMETERS:
 * - operationName: String describing what we're trying to do (for logging)
 * - fn: The function to execute safely
 * - fallbackValue: What to return if the function throws an error
 *
 * RETURNS: Either the result of fn() or the fallbackValue if error occurs
 *
 * SIDE EFFECTS: Logs detailed error information to browser console
 *
 * EXAMPLE:
 * const data = safeOperation('Load State', () => JSON.parse(localStorage.getItem('key')), null);
 */
function safeOperation(operationName, fn, fallbackValue) {
  try {
    return fn();
  } catch (error) {
    // Log detailed error info to console with timestamp for debugging
    console.error(`[SAA Error] ${operationName}:`, {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return fallbackValue;
  }
}

// ============================================================================
// UTILITY FUNCTIONS - Simple helper functions
// ============================================================================

/**
 * WHAT IT DOES: Normalizes quiz mode to only "review" or "timed"
 *
 * WHY WE NEED IT: Maintains backward compatibility with old "practice" mode
 * while ensuring only two valid modes exist in the new system.
 *
 * PARAMETERS:
 * - mode: String representing the mode (could be "review", "timed", "practice", or anything)
 *
 * RETURNS: Either "timed" or "review" (default)
 *
 * EXAMPLE:
 * normalizeMode("practice") → "review"
 * normalizeMode("timed") → "timed"
 * normalizeMode("anything-else") → "review"
 */
function normalizeMode(mode) {
  return mode === "timed" ? "timed" : "review";
}

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
function loadState() {
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
function saveState(state) {
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
function clearState() {
  safeOperation('Clear State from localStorage', () => {
    localStorage.removeItem(STATE_KEY);
    console.info('[SAA Info] State cleared from localStorage');
  }, undefined);
}

/**
 * WHAT IT DOES: Clears ALL data including quiz state AND performance history
 * WHY IT EXISTS: Provides complete "start over" functionality for reset
 */
function clearAllData() {
  safeOperation('Clear All Data from localStorage', () => {
    localStorage.removeItem(STATE_KEY);     // Clear quiz state
    localStorage.removeItem(HISTORY_KEY);   // Clear performance history
    console.info('[SAA Info] All data cleared from localStorage (state + history)');
  }, undefined);
}

/**
 * WHAT IT DOES: Gets the current timestamp in milliseconds
 *
 * WHY WE NEED IT: Used for timer calculations, session timestamps,
 * and generating unique session seeds
 *
 * RETURNS: Number of milliseconds since January 1, 1970 (Unix epoch)
 */
function nowMs() {
  return Date.now();
}

// ============================================================================
// DETERMINISTIC SHUFFLE - Seeded random number generation
// ============================================================================
// WHY WE NEED THIS: We want questions to appear in a random order, BUT the
// same order every time you reload the page during a session. This is called
// "deterministic randomness" - random but reproducible.
//
// HOW IT WORKS:
// 1. Take a unique string (session key + timestamp)
// 2. Convert it to a number (seed)
// 3. Use that seed to generate "random" numbers (same seed = same numbers)
// 4. Use those numbers to shuffle the questions
// Result: Questions appear random but stay in the same order on page refresh!

/**
 * WHAT IT DOES: Creates a pseudo-random number generator (PRNG) from a seed
 *
 * WHY WE NEED IT: JavaScript's Math.random() gives different results every
 * time, but we need the SAME "random" sequence for a given session.
 *
 * HOW IT WORKS: Uses the Mulberry32 algorithm - a fast, simple PRNG that
 * produces high-quality pseudo-random numbers from a 32-bit seed.
 *
 * PARAMETERS:
 * - seed: A 32-bit integer that determines the sequence of random numbers
 *
 * RETURNS: A function that returns pseudo-random numbers between 0 and 1
 *
 * EXAMPLE:
 * const rng = mulberry32(12345);
 * rng() → 0.2347... (always the same for seed 12345)
 * rng() → 0.8912... (second call, also always the same)
 */
function mulberry32(seed) {
  return function () {
    // Mulberry32 algorithm (32-bit PRNG)
    // These magic numbers and bit operations create high-quality randomness
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // Convert 32-bit integer to 0-1 range by dividing by 2^32
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * WHAT IT DOES: Converts a string into a 32-bit number (hash)
 *
 * WHY WE NEED IT: The shuffle algorithm needs a numeric seed, but we have
 * a string session key. This converts "review::D1::ALL" into a number.
 *
 * HOW IT WORKS: Uses FNV-1a hash algorithm to convert any string into a
 * consistent 32-bit integer. Same string always produces same number.
 *
 * PARAMETERS:
 * - str: Any string (e.g., "review::D1::ALL::1735142400000")
 *
 * RETURNS: A 32-bit unsigned integer (0 to 4,294,967,295)
 *
 * EXAMPLE:
 * hashStringToSeed("review::D1::ALL") → 2847563928 (always the same)
 */
function hashStringToSeed(str) {
  // FNV-1a hash algorithm for strings
  let h = 2166136261; // FNV offset basis (32-bit)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);  // XOR with character code
    h = Math.imul(h, 16777619);  // Multiply by FNV prime
  }
  return h >>> 0;  // Convert to unsigned 32-bit integer
}

/**
 * WHAT IT DOES: Shuffles an array in a deterministic (reproducible) way
 *
 * WHY WE NEED IT: Questions need to be randomized, but stay in the same
 * order when you refresh the page during a session.
 *
 * HOW IT WORKS: Uses Fisher-Yates shuffle algorithm with our seeded RNG
 * instead of Math.random(). Same seed string = same shuffle order.
 *
 * PARAMETERS:
 * - arr: Array to shuffle (we don't modify the original)
 * - seedStr: String that determines the shuffle order
 *
 * RETURNS: New shuffled array (original array is not modified)
 *
 * EXAMPLE:
 * seededShuffle([1,2,3,4,5], "abc") → [3,1,5,2,4] (always same for "abc")
 */
function seededShuffle(arr, seedStr) {
  const a = [...arr];  // Create a copy so we don't modify the original
  const rand = mulberry32(hashStringToSeed(seedStr));  // Create seeded RNG

  // Fisher-Yates shuffle algorithm
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));  // Pick random index
    [a[i], a[j]] = [a[j], a[i]];  // Swap elements
  }

  return a;
}

/**
 * WHAT IT DOES: Picks a random subset of items from an array (deterministically)
 *
 * WHY WE NEED IT: In Timed mode, we need to pick 50 random questions out of 65
 * to be scored. This selection must be the same every time for a given session.
 *
 * PARAMETERS:
 * - arr: Array to pick from
 * - count: How many items to pick
 * - seedStr: String that determines which items are picked
 *
 * RETURNS: Array containing 'count' items from arr (or all items if count > arr.length)
 *
 * EXAMPLE:
 * pickSeededSubset([1,2,3,4,5], 3, "seed123") → [3,1,5] (always same for "seed123")
 */
function pickSeededSubset(arr, count, seedStr) {
  const shuffled = seededShuffle(arr, seedStr);  // Shuffle first
  return shuffled.slice(0, Math.min(count, shuffled.length));  // Take first N items
}

// ============================================================================
// FILTER AND SESSION KEY FUNCTIONS - Handle quiz filtering and session identity
// ============================================================================

/**
 * WHAT IT DOES: Reads the current filter selections from the UI dropdowns
 *
 * WHY WE NEED IT: Centralizes reading UI state so we don't have to access
 * the dropdowns directly throughout the code.
 *
 * RETURNS: Object with mode, domainId, and section from dropdown values
 *
 * EXAMPLE:
 * getFiltersFromUI() → { mode: "review", domainId: "D1", section: "ALL" }
 */
function getFiltersFromUI() {
  return {
    mode: normalizeMode(modeSelect.value),
    domainId: domainSelect.value,
    section: sectionSelect.value
  };
}

/**
 * WHAT IT DOES: Creates a unique key string for a quiz session
 *
 * WHY WE NEED IT: We need to identify sessions uniquely so we can resume
 * the correct quiz. Different filter combinations = different sessions.
 *
 * RULES:
 * - Timed mode: Always "timed::ALL::ALL" (no filtering allowed)
 * - Review mode: "review::domainId::section" (e.g., "review::D1::EC2")
 *
 * PARAMETERS:
 * - filters: Object with mode, domainId, section
 *
 * RETURNS: String key identifying this unique session
 *
 * EXAMPLE:
 * sessionKeyFor({mode: "review", domainId: "D1", section: "IAM"})
 *   → "review::D1::IAM"
 */
function sessionKeyFor(filters) {
  const mode = normalizeMode(filters.mode);

  // Timed mode is always the full 65-question exam (no filtering)
  if (mode === "timed") return "timed::ALL::ALL";

  // Review mode sessions are identified by their domain and section
  return `review::${filters.domainId}::${filters.section}`;
}

/**
 * WHAT IT DOES: Filters the question list based on user selections
 *
 * WHY WE NEED IT: In Review mode, users can choose to practice only
 * certain domains or sections. This returns only the matching questions.
 *
 * RULES:
 * - Timed mode: NO filtering, always all questions
 * - Review mode: Filter by domain and/or section if not "ALL"
 *
 * PARAMETERS:
 * - filters: Object with mode, domainId, section
 *
 * RETURNS: Array of question objects that match the filters
 *
 * EXAMPLE:
 * filteredQuestions({mode: "review", domainId: "D1", section: "IAM"})
 *   → [all IAM questions from Domain 1]
 */
function filteredQuestions(filters) {
  let list = QUESTIONS;

  // Timed mode: Always use all questions (no filtering)
  if (filters.mode !== "timed") {
    // Filter by domain if not "ALL"
    if (filters.domainId !== "ALL") {
      list = list.filter((q) => q.domainId === filters.domainId);
    }
    // Filter by section if not "ALL"
    if (filters.section !== "ALL") {
      list = list.filter((q) => q.section === filters.section);
    }
  }

  return list;
}

// ============================================================================
// UI BUILDER FUNCTIONS - Populate dropdown menus dynamically
// ============================================================================

/**
 * WHAT IT DOES: Populates the domain dropdown with all available domains
 *
 * WHY WE NEED IT: Domains are loaded from questions.json dynamically, so
 * we build the dropdown options from the actual question data instead of
 * hardcoding them.
 *
 * HOW IT WORKS:
 * 1. Extracts unique domains from all questions (D1, D2, D3, D4)
 * 2. Adds "All domains" as first option
 * 3. Generates <option> HTML for each domain
 * 4. Updates the domain dropdown
 *
 * SIDE EFFECTS: Modifies domainSelect.innerHTML
 */
function buildDomainOptions() {
  // Create "ALL" option + extract unique domains from questions
  const domains = [
    { id: "ALL", name: "All domains" },
    ...Array.from(
      new Map(QUESTIONS.map((q) => [q.domainId, q.domain])).entries()
    ).map(([id, name]) => ({ id, name }))
  ];

  // Build <option> tags and update dropdown
  domainSelect.innerHTML = domains
    .map((d) => `<option value="${d.id}">${d.name}</option>`)
    .join("");
}

/**
 * WHAT IT DOES: Populates the section dropdown with sections for a given domain
 *
 * WHY WE NEED IT: Different domains have different AWS services/sections.
 * This ensures the section dropdown only shows relevant options for the
 * selected domain.
 *
 * HOW IT WORKS:
 * 1. Filter questions by selected domain (if not "ALL")
 * 2. Extract unique sections from those questions
 * 3. Sort sections using SECTION_ORDER for consistent ordering
 * 4. Add "All sections" as first option
 * 5. Update the section dropdown
 *
 * PARAMETERS:
 * - domainId: The selected domain ID ("ALL", "D1", "D2", "D3", or "D4")
 *
 * SIDE EFFECTS: Modifies sectionSelect.innerHTML
 *
 * EXAMPLE:
 * buildSectionOptions("D1") → Shows only sections present in Domain 1
 */
function buildSectionOptions(domainId) {
  // Start with all questions, then filter by domain if specified
  let list = QUESTIONS;
  if (domainId && domainId !== "ALL") {
    list = list.filter((q) => q.domainId === domainId);
  }

  // Get unique sections from the filtered questions
  const present = new Set(list.map((q) => q.section));

  // Order sections according to SECTION_ORDER array
  const ordered = SECTION_ORDER.filter((s) => present.has(s));

  // Add "ALL" as first option
  const sections = ["ALL", ...ordered];

  // Build <option> tags and update dropdown
  sectionSelect.innerHTML = sections
    .map((s) => `<option value="${s}">${s === "ALL" ? "All sections" : s}</option>`)
    .join("");
}

// ============================================================================
// SECURITY FUNCTION - Prevent XSS (Cross-Site Scripting) attacks
// ============================================================================

/**
 * WHAT IT DOES: Escapes HTML special characters to prevent security issues
 *
 * WHY WE NEED IT: When displaying question text or user input in the HTML,
 * we need to escape special characters (<, >, &, etc.) to prevent malicious
 * code injection (XSS attacks).
 *
 * HOW IT WORKS: Replaces dangerous HTML characters with safe HTML entities:
 * - & becomes &amp;
 * - < becomes &lt;
 * - > becomes &gt;
 * - " becomes &quot;
 * - ' becomes &#039;
 *
 * PARAMETERS:
 * - str: Any string that will be inserted into HTML
 *
 * RETURNS: Safe string with HTML characters escaped
 *
 * EXAMPLE:
 * escapeHtml("<script>alert('xss')</script>")
 *   → "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;"
 *
 * SECURITY NOTE: ALWAYS use this when inserting dynamic text into HTML!
 */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")    // Must be first to avoid double-escaping
    .replaceAll("<", "&lt;")     // Prevent HTML tags
    .replaceAll(">", "&gt;")     // Prevent HTML tags
    .replaceAll('"', "&quot;")   // Prevent breaking attributes
    .replaceAll("'", "&#039;");  // Prevent breaking attributes
}

// ============================================================================
// TIMER FUNCTIONS - Countdown timer for Timed mode
// ============================================================================

/**
 * WHAT IT DOES: Stops the running countdown timer
 *
 * WHY WE NEED IT: Prevents memory leaks and ensures only one timer runs
 * at a time. Called when switching questions, finishing exam, or leaving page.
 *
 * SIDE EFFECTS: Clears the interval and sets timerInterval to null
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);  // Stop the interval
    timerInterval = null;  // Clear the reference
  }
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
function formatClock(totalSec) {
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
function getRemainingSec(session) {
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
function updateTimerUI(state) {
  const session = state.session;

  // If paused, show frozen time instead of calculated time
  const remaining = quizPausedState && quizPausedState.frozenTime !== undefined
    ? quizPausedState.frozenTime
    : getRemainingSec(session);

  timerEl.textContent = `Time left: ${formatClock(remaining)}`;

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
 * - Updates global timerInterval variable
 */
function startTimer(state) {
  stopTimer();  // Clean up any existing timer
  timerEl.hidden = false;  // Make timer visible
  updateTimerUI(state);  // Show initial time immediately
  timerInterval = setInterval(() => updateTimerUI(state), 1000);  // Update every second
}

function ensureModeRulesUI() {
  const mode = normalizeMode(modeSelect.value);

  if (mode === "timed") {
    domainSelect.value = "ALL";
    sectionSelect.value = "ALL";
    domainSelect.disabled = true;
    sectionSelect.disabled = true;
    hintText.textContent =
      "Timed mode is always the full 65-question exam (All domains + All sections).";
  } else {
    domainSelect.disabled = false;
    sectionSelect.disabled = false;
    hintText.textContent =
      "Review mode: filter by domain and section. Question order and answers persist on refresh.";
  }
}

function createNewSession(filters, forceFresh) {
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

  // Timed mode: use full pool and select 65 random questions
  if (filters.mode === "timed") {
    list = QUESTIONS;

    // Ensure we have at least 65 questions
    if (list.length < EXAM_TOTAL_QUESTIONS) {
      throw new Error(
        `Timed mode requires at least ${EXAM_TOTAL_QUESTIONS} questions (currently: ${list.length}).`
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
      list = selectedIds.map(id => QMAP.get(id));
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
      list = selectedIds.map(id => QMAP.get(id));
    }
  }

  if (list.length === 0) throw new Error("No questions match your filters.");
  const order = seededShuffle(list.map((q) => q.id), seed);

  const session = {
    version: 1,
    mode: filters.mode,
    domainId: filters.mode === "timed" ? "ALL" : filters.domainId,
    section: filters.mode === "timed" ? "ALL" : filters.section,
    seed,
    questionIds: order,
    answers: {}, // { [id]: choiceIndex }
    flaggedQuestions: [], // Array of question IDs flagged for review (Timed mode only)
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

  // Convert Set to array for storage
  const state = {
    sessionKey: key,
    session: {
      ...session,
      scoredIds: session.scoredIds ? Array.from(session.scoredIds) : null
    }
  };

  saveState(state);
  return state;
}

function normalizeStateForRuntime(state) {
  if (!state || !state.session) return state;

  // Migrate any non-timed mode (including old "practice") to "review"
  state.session.mode = normalizeMode(state.session.mode);

  // Migrate sessionKey prefix if needed
  if (typeof state.sessionKey === "string") {
    state.sessionKey = state.sessionKey.replace(/^practice::/i, "review::");
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

  return state;
}

function persistRuntimeState(state) {
  if (!state || !state.session) return;

  const s = state.session;

  const toStore = {
    sessionKey: state.sessionKey,
    session: {
      ...s,
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
 * RETURNS: Question object from QMAP
 */
function getCurrentQuestion(state) {
  const { session } = state;
  const qid = session.questionIds[session.currentIndex];
  return QMAP.get(qid);
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
function toggleFlag(state) {
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

/**
 * WHAT IT DOES: Renders the jump grid (question number buttons)
 *
 * WHY WE NEED IT: Provides quick navigation between questions and shows
 * visual status (answered, flagged, correct/wrong in review mode)
 *
 * VISUAL INDICATORS:
 * - Current question: highlighted
 * - Answered: filled background
 * - Flagged (Timed mode): flag emoji badge
 * - Correct/Wrong (Review mode): green/red color
 */
function renderJumpGrid(state) {
  const { session } = state;

  // Ensure flaggedQuestions exists (backward compatibility)
  const flagged = Array.isArray(session.flaggedQuestions) ? session.flaggedQuestions : [];

  // Check if paused for disabling jump buttons
  const isPaused = quizPausedState !== null;

  jumpGrid.innerHTML = session.questionIds
    .map((qid, idx) => {
      const ans = session.answers[qid];
      const answered = ans !== undefined;
      const isFlagged = flagged.includes(qid);

      const cls = ["jump", idx === session.currentIndex ? "current" : "", answered ? "answered" : ""];

      // Add flagged class for styling
      if (isFlagged) {
        cls.push("flagged");
      }

      // REVIEW only: color green if correct, red if wrong
      if (session.mode !== "timed" && answered) {
        const q = QMAP.get(qid);
        cls.push(ans === q.answer ? "correct" : "wrong");
      }

      // Add flag emoji for flagged questions in Timed mode
      const flagBadge = (session.mode === "timed" && isFlagged) ? '<span class="flag-badge">🚩</span>' : '';

      // Disable button if paused
      const disabled = isPaused ? 'disabled' : '';

      return `<button type="button" ${disabled} class="${cls.filter(Boolean).join(" ")}" data-idx="${idx}">${idx + 1}${flagBadge}</button>`;
    })
    .join("");

  // ✅ Event delegation: One listener on parent container
  // Remove old listener first to prevent duplicates
  const oldListener = jumpGrid._clickListener;
  if (oldListener) {
    jumpGrid.removeEventListener("click", oldListener);
  }

  // Create new listener function
  const clickListener = (e) => {
    const button = e.target.closest("button");
    if (!button) return; // Click wasn't on a button

    const idx = Number(button.getAttribute("data-idx"));
    if (!isNaN(idx)) {
      state.session.currentIndex = idx;
      persistRuntimeState(state);
      renderQuiz(state);
    }
  };

  // Attach listener and save reference for cleanup
  jumpGrid.addEventListener("click", clickListener);
  jumpGrid._clickListener = clickListener;
}

function computeScore(state) {
  const { session } = state;

  let answeredTotal = 0;
  let correctTotal = 0;

  let answeredScored = 0;
  let correctScored = 0;

  for (const qid of session.questionIds) {
    const q = QMAP.get(qid);
    const ans = session.answers[qid];

    const answered = ans !== undefined;
    const correct = answered && ans === q.answer;

    if (answered) answeredTotal++;
    if (correct) correctTotal++;

    if (session.mode === "timed") {
      if (session.scoredIds && session.scoredIds.has(qid)) {
        if (answered) answeredScored++;
        if (correct) correctScored++;
      }
    }
  }

  const totalQuestions = session.questionIds.length;

  if (session.mode === "timed") {
    const points = correctScored * POINTS_PER_SCORED_QUESTION;
    const totalPoints = EXAM_SCORED_QUESTIONS * POINTS_PER_SCORED_QUESTION; // 1000
    const passed = points >= PASSING_SCORE;

    return {
      answeredTotal,
      correctTotal,
      totalQuestions,
      answeredScored,
      correctScored,
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

function renderQuiz(state) {
  quizCard.hidden = false;

  // Only hide results during an active (not completed) session
  if (!state.session.completed) resultBox.hidden = true;

  const { session } = state;
  const q = getCurrentQuestion(state);
  const idx = session.currentIndex;

  progressText.textContent = `Question ${idx + 1} / ${session.questionIds.length} • Mode: ${session.mode.toUpperCase()}`;

  const tags = `${q.domainId} • ${q.section}`;
  metaText.textContent = `Tags: ${tags}`;

  // Score mini: REVIEW -> only show Answered; TIMED -> show Answered; show Final only when completed
  const s = computeScore(state);
  if (session.mode === "timed") {
    scoreMini.textContent = session.completed
      ? `Final: ${s.points}/${s.totalPoints} ${s.passed ? "(PASSED)" : "(FAILED)"}`
      : `Answered: ${s.answeredTotal}/${s.totalQuestions}`;
  } else {
    scoreMini.textContent = session.completed
      ? `Final: ${s.points}/1000 ${s.passed ? "(PASSED)" : "(FAILED)"}`
      : `Answered: ${s.answeredTotal}/${s.totalQuestions}`;
  }

  // Timer
  if (session.mode === "timed" && !session.completed && quizPausedState === null) {
    timerEl.hidden = false;
    startTimer(state);
  } else {
    timerEl.hidden = true;
    stopTimer();
  }

  // Pause button (show/hide based on timed mode and completion status)
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    if (session.mode === 'timed' && !session.completed) {
      pauseBtn.hidden = false;
    } else {
      pauseBtn.hidden = true;
    }
  }

  // Check if paused
  const isPaused = quizPausedState !== null;

  // Controls enable/disable
  if (isPaused) {
    // Disable all navigation when paused
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    submitBtn.disabled = true;
  } else {
    // Normal navigation rules
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === session.questionIds.length - 1;
    submitBtn.disabled = session.completed;
  }

  // Submit button logic
  submitBtn.textContent = session.mode === "timed" ? "End Exam" : "Finish";

  // Question box
  const selected = session.answers[q.id];
  const hasAnswered = selected !== undefined;

  // Reveal logic:
  // - review: reveal after answer
  // - timed: reveal only after exam submitted
  const revealAnswers = session.mode === "timed" ? session.completed : hasAnswered;

  const isPausedForChoices = quizPausedState !== null;

  const choicesHtml = q.choices
    .map((c, i) => {
      let cls = "choice";
      if (selected === i) cls += " selected";

      if (revealAnswers) {
        if (i === q.answer) cls += " correct";
        if (hasAnswered && selected === i && selected !== q.answer) cls += " wrong";
      }

      // Add disabled class when paused
      if (isPausedForChoices) cls += " disabled";

      // Add aria-disabled for accessibility
      const ariaDisabled = (session.completed || isPausedForChoices) ? "aria-disabled='true'" : "";

      return `<div class="${cls}" data-choice="${i}" ${ariaDisabled}>${escapeHtml(c)}</div>`;
    })
    .join("");

  const feedbackHtml = revealAnswers
    ? (() => {
        const correctText = `Correct answer: ${q.choices[q.answer]}`;

        // Build enhanced explanation sections (optional fields)
        let enhancedHtml = '';

        // AWS Documentation Links
        if (q.resources && Array.isArray(q.resources) && q.resources.length > 0) {
          const resourcesHtml = q.resources.map(r =>
            `<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.title)}</a></li>`
          ).join('');
          enhancedHtml += `
            <details class="exp-details resources">
              <summary>AWS Documentation</summary>
              <div class="exp-details-content">
                <ul>${resourcesHtml}</ul>
              </div>
            </details>
          `;
        }

        // Related Concepts
        if (q.relatedConcepts && Array.isArray(q.relatedConcepts) && q.relatedConcepts.length > 0) {
          const conceptsHtml = q.relatedConcepts.map(c =>
            `<li>${escapeHtml(c)}</li>`
          ).join('');
          enhancedHtml += `
            <details class="exp-details concepts">
              <summary>Related Concepts</summary>
              <div class="exp-details-content">
                <ul>${conceptsHtml}</ul>
              </div>
            </details>
          `;
        }

        // Exam Tips
        if (q.examTips && typeof q.examTips === 'string' && q.examTips.trim()) {
          enhancedHtml += `
            <details class="exp-details tips">
              <summary>Exam Tips</summary>
              <div class="exp-details-content">
                <p>${escapeHtml(q.examTips)}</p>
              </div>
            </details>
          `;
        }

        if (!hasAnswered) {
          return `
            <div class="feedback bad">
              <div class="status">Unanswered ❌</div>
              <div class="exp">${escapeHtml(correctText)}</div>
              <div class="exp">${escapeHtml(q.explanation)}</div>
              ${enhancedHtml}
            </div>
          `;
        }

        const isCorrect = selected === q.answer;
        const boxCls = `feedback ${isCorrect ? "good" : "bad"}`;
        const yourText = `Your answer: ${q.choices[selected]}`;

        return `
          <div class="${boxCls}">
            <div class="status">${isCorrect ? "Correct ✅" : "Incorrect ❌"}</div>
            <div class="exp">${escapeHtml(yourText)}</div>
            <div class="exp">${escapeHtml(correctText)}</div>
            <div class="exp">${escapeHtml(q.explanation)}</div>
            ${enhancedHtml}
          </div>
        `;
      })()
    : "";

  // Flag button HTML (Timed mode only, hidden when completed)
  const flagged = Array.isArray(session.flaggedQuestions) && session.flaggedQuestions.includes(q.id);
  const isPausedForFlag = quizPausedState !== null;
  const disabledAttr = isPausedForFlag ? 'disabled' : '';
  const flagBtnHtml = (session.mode === "timed" && !session.completed)
    ? `<button id="flagBtn" class="btn btn-flag ${flagged ? 'flagged' : ''}" ${disabledAttr}>
         <span class="flag-icon">${flagged ? '🚩' : '🏳️'}</span> ${flagged ? 'Unflag' : 'Flag for Review'}
       </button>`
    : '';

  questionBox.innerHTML = `
    <div class="q-title">${escapeHtml(q.question)}</div>
    <div class="q-tags">${escapeHtml(q.domain)} • ${escapeHtml(q.section)} • ${escapeHtml(q.id)}</div>
    ${flagBtnHtml}
    <div class="choices">${choicesHtml}</div>
    ${feedbackHtml}
  `;

  // ✅ Event delegation: One listener on questionBox for all interactive elements
  // Remove old listener first to prevent duplicates
  const oldQuestionBoxListener = questionBox._questionBoxListener;
  if (oldQuestionBoxListener) {
    questionBox.removeEventListener("click", oldQuestionBoxListener);
  }

  const questionBoxListener = (e) => {
    // Handle flag button clicks
    if (e.target.closest("#flagBtn")) {
      // Don't allow flagging when paused
      if (quizPausedState !== null) return;
      toggleFlag(state);
      return;
    }

    // Handle choice clicks
    if (session.completed || quizPausedState !== null) return;

    const choice = e.target.closest(".choice");
    if (!choice) return;

    const choiceIdx = Number(choice.getAttribute("data-choice"));
    if (!isNaN(choiceIdx)) {
      session.answers[q.id] = choiceIdx;
      state.session = session;
      persistRuntimeState(state);
      renderQuiz(state);
    }
  };

  questionBox.addEventListener("click", questionBoxListener);
  questionBox._questionBoxListener = questionBoxListener;

  renderJumpGrid(state);
}

function buildTimedReviewHtml(state) {
  const { session } = state;

  return session.questionIds
    .map((qid, idx) => {
      const q = QMAP.get(qid);
      const ans = session.answers[qid];

      const status =
        ans === undefined ? "Unanswered ❌" : ans === q.answer ? "Correct ✅" : "Incorrect ❌";

      const yourAnswer = ans === undefined ? "—" : q.choices[ans];
      const correctAnswer = q.choices[q.answer];

      return `
        <details style="margin-top:10px; padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.03);">
          <summary style="cursor:pointer; font-weight:700;">
            Q${idx + 1} • ${escapeHtml(q.section)} • ${escapeHtml(status)}
          </summary>
          <div style="margin-top:10px;">
            <div style="font-weight:700; margin-bottom:6px;">${escapeHtml(q.question)}</div>
            <div style="color: rgba(233,237,245,0.9); margin-bottom:6px;">
              Your answer: <strong>${escapeHtml(yourAnswer)}</strong>
            </div>
            <div style="color: rgba(233,237,245,0.9); margin-bottom:6px;">
              Correct answer: <strong>${escapeHtml(correctAnswer)}</strong>
            </div>
            <div style="color: rgba(233,237,245,0.9);">
              Explanation: ${escapeHtml(q.explanation)}
            </div>
          </div>
        </details>
      `;
    })
    .join("");
}

function showResults(state, autoEnded) {
  const { session } = state;
  session.completed = true;
  state.session = session;
  persistRuntimeState(state);

  stopTimer();

  // Record this session to history for performance tracking
  recordSessionToHistory(state);

  const s = computeScore(state);

  let html = "";
  if (session.mode === "timed") {
    // Build flagged questions summary
    const flagged = Array.isArray(session.flaggedQuestions) ? session.flaggedQuestions : [];
    const flaggedHtml = flagged.length > 0
      ? `<div style="margin-top:12px; padding:10px; border-radius:8px; background: rgba(251, 191, 36, 0.1); border:1px solid rgba(251, 191, 36, 0.3);">
           <div style="font-weight:600; margin-bottom:6px;">🚩 You flagged ${flagged.length} question${flagged.length === 1 ? '' : 's'} for review:</div>
           <div style="font-size:0.95em;">${flagged.map(qid => {
             const idx = session.questionIds.indexOf(qid) + 1;
             return `<span style="margin-right:8px;">Q${idx}</span>`;
           }).join('')}</div>
         </div>`
      : '';

    html = `
      <div><strong>${autoEnded ? "Time is up." : "Exam submitted."}</strong></div>
      <div style="margin-top:8px;">
        <div><strong>Final score:</strong> ${s.points}/${s.totalPoints} ${s.passed ? "(PASSED)" : "(FAILED)"}</div>
        <div class="meta" style="margin-top:6px;">Answered: ${s.answeredTotal}/${s.totalQuestions}</div>
      </div>
      ${flaggedHtml}
      <div style="margin-top:14px;"><strong>Review</strong></div>
      ${buildTimedReviewHtml(state)}
    `;
  } else {
    html = `
      <div><strong>Finished.</strong></div>
      <div style="margin-top:8px;">
        <div><strong>Final score:</strong> ${s.points}/1000 ${s.passed ? "(PASSED)" : "(FAILED)"}</div>
        <div class="meta" style="margin-top:6px;">
          Correct: ${s.correctTotal}/${s.totalQuestions} • Answered: ${s.answeredTotal}/${s.totalQuestions}
        </div>
      </div>
    `;
  }

  resultBox.innerHTML = html;
  resultBox.hidden = false;

  // Re-render quiz so:
  // - timed reveals answers on the question screen too
  // - review keeps jump correctness colors consistent
  renderQuiz(state);
}

// ============================================================================
// PERFORMANCE TRACKING - Session history and analytics
// ============================================================================

/**
 * WHAT IT DOES: Loads quiz history from localStorage
 *
 * WHY WE NEED IT: Retrieves all past quiz attempts so we can analyze
 * performance trends, identify weak areas, and track improvement.
 *
 * RETURNS: History object with version and sessions array, or empty structure
 *
 * STRUCTURE:
 * {
 *   version: 1,
 *   sessions: [
 *     {
 *       sessionId: "unique-id",
 *       mode: "review" | "timed",
 *       domainId: "D1" | "D2" | "D3" | "D4" | "ALL",
 *       section: "EC2" | "S3" | ... | "ALL",
 *       startedAt: 1735142400000,
 *       completedAt: 1735143120000,
 *       durationSeconds: 720,
 *       totalQuestions: 65,
 *       answeredTotal: 63,
 *       correctTotal: 45,
 *       points: 714,
 *       passed: false,
 *       domainScores: { "D1": { correct: 12, total: 18 }, ... },
 *       sectionScores: { "IAM": { correct: 4, total: 6 }, ... },
 *       questionResults: [{ questionId: "SAA-001", correct: true }, ...]
 *     }
 *   ]
 * }
 */
function getSessionHistory() {
  return safeOperation('Load Session History', () => {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      console.info('[SAA Info] No history found, returning empty structure');
      return { version: 1, sessions: [] };
    }

    const parsed = JSON.parse(raw);

    // Validate structure
    if (!parsed.version || !Array.isArray(parsed.sessions)) {
      console.warn('[SAA Warning] Invalid history structure, resetting');
      return { version: 1, sessions: [] };
    }

    console.info(`[SAA Info] Loaded ${parsed.sessions.length} historical sessions`);
    return parsed;
  }, { version: 1, sessions: [] });
}

/**
 * WHAT IT DOES: Saves updated history back to localStorage
 *
 * WHY WE NEED IT: Persists quiz history after adding a new completed session
 *
 * PARAMETERS:
 * - history: History object with version and sessions array
 *
 * SIDE EFFECTS: Writes to localStorage
 */
function saveSessionHistory(history) {
  safeOperation('Save Session History', () => {
    if (!history || !Array.isArray(history.sessions)) {
      console.warn('[SAA Warning] Invalid history object, skipping save');
      return;
    }

    const json = JSON.stringify(history);
    localStorage.setItem(HISTORY_KEY, json);
    console.info(`[SAA Info] Saved history with ${history.sessions.length} sessions`);
  }, undefined);
}

/**
 * WHAT IT DOES: Records a completed quiz session to history
 *
 * WHY WE NEED IT: Called after completing a quiz to save performance data
 * for later analysis and trend tracking.
 *
 * HOW IT WORKS:
 * 1. Load existing history
 * 2. Calculate detailed stats from the completed session
 * 3. Break down scores by domain and section
 * 4. Add new session to history
 * 5. Keep only most recent MAX_HISTORY_SESSIONS (50)
 * 6. Save back to localStorage
 *
 * PARAMETERS:
 * - state: The completed session state
 * - startTime: When the quiz started (milliseconds)
 * - endTime: When the quiz ended (milliseconds)
 */
function recordSessionToHistory(state) {
  safeOperation('Record Session to History', () => {
    const { session } = state;

    // Only record completed sessions
    if (!session.completed) {
      console.info('[SAA Info] Session not completed, skipping history recording');
      return;
    }

    const history = getSessionHistory();
    const score = computeScore(state);

    // Calculate duration
    const startedAt = session.startedAtMs || session.createdAtMs;
    const completedAt = nowMs();
    const durationSeconds = Math.floor((completedAt - startedAt) / 1000);

    // Aggregate scores by domain
    const domainScores = {};
    const sectionScores = {};
    const questionResults = [];

    for (const qid of session.questionIds) {
      const q = QMAP.get(qid);
      if (!q) continue;

      const userAnswer = session.answers[qid];
      const correct = userAnswer !== undefined && userAnswer === q.answer;

      // Track by domain
      if (!domainScores[q.domainId]) {
        domainScores[q.domainId] = { correct: 0, total: 0 };
      }
      domainScores[q.domainId].total++;
      if (correct) domainScores[q.domainId].correct++;

      // Track by section
      if (!sectionScores[q.section]) {
        sectionScores[q.section] = { correct: 0, total: 0 };
      }
      sectionScores[q.section].total++;
      if (correct) sectionScores[q.section].correct++;

      // Track individual question
      questionResults.push({
        questionId: qid,
        correct: correct,
        answered: userAnswer !== undefined
      });
    }

    // Create session record
    const sessionRecord = {
      sessionId: `${session.mode}-${startedAt}`,
      mode: session.mode,
      domainId: session.domainId,
      section: session.section,
      startedAt: startedAt,
      completedAt: completedAt,
      durationSeconds: durationSeconds,

      // Overall scores
      totalQuestions: score.totalQuestions,
      answeredTotal: score.answeredTotal,
      correctTotal: score.correctTotal,
      points: score.points,
      passed: score.passed,

      // Breakdowns
      domainScores: domainScores,
      sectionScores: sectionScores,
      questionResults: questionResults
    };

    // ✅ Check if this session already exists in history (prevent duplicates)
    const existingIndex = history.sessions.findIndex(
      s => s.sessionId === sessionRecord.sessionId
    );

    if (existingIndex !== -1) {
      console.info('[SAA Info] Session already recorded, skipping duplicate:', sessionRecord.sessionId);
      return; // Exit early, don't add duplicate
    }

    // Add to history (only if not duplicate)
    history.sessions.push(sessionRecord);

    // Keep only most recent sessions (FIFO - First In, First Out)
    if (history.sessions.length > MAX_HISTORY_SESSIONS) {
      const removed = history.sessions.length - MAX_HISTORY_SESSIONS;
      history.sessions = history.sessions.slice(-MAX_HISTORY_SESSIONS);
      console.info(`[SAA Info] Removed ${removed} oldest sessions (keeping ${MAX_HISTORY_SESSIONS} most recent)`);
    }

    // Save updated history
    saveSessionHistory(history);

    console.info('[SAA Info] Session recorded to history:', {
      mode: session.mode,
      score: `${score.points}/${score.totalPoints}`,
      passed: score.passed
    });
  }, undefined);
}

/**
 * WHAT IT DOES: Analyzes history to find frequently missed questions
 *
 * WHY WE NEED IT: Helps users identify their weak areas by showing which
 * questions they consistently get wrong across multiple attempts.
 *
 * PARAMETERS:
 * - history: History object from getSessionHistory()
 * - limit: How many weak areas to return (default 10)
 *
 * RETURNS: Array of objects with questionId, missCount, attempts, and question details
 *
 * EXAMPLE:
 * [
 *   { questionId: "SAA-023", missCount: 3, attempts: 3, question: {...} },
 *   { questionId: "SAA-045", missCount: 3, attempts: 4, question: {...} }
 * ]
 */
function analyzeWeakAreas(history, limit = 10) {
  return safeOperation('Analyze Weak Areas', () => {
    const questionStats = {};

    // Aggregate results for each question across all sessions
    for (const session of history.sessions) {
      for (const result of session.questionResults) {
        if (!questionStats[result.questionId]) {
          questionStats[result.questionId] = {
            questionId: result.questionId,
            attempts: 0,
            missCount: 0
          };
        }

        if (result.answered) {
          questionStats[result.questionId].attempts++;
          if (!result.correct) {
            questionStats[result.questionId].missCount++;
          }
        }
      }
    }

    // Convert to array and sort by miss rate (missCount / attempts)
    const weakAreas = Object.values(questionStats)
      .filter(stat => stat.attempts > 0 && stat.missCount > 0)
      .sort((a, b) => {
        // Primary sort: miss count (descending)
        if (b.missCount !== a.missCount) {
          return b.missCount - a.missCount;
        }
        // Secondary sort: miss rate (descending)
        const rateA = a.missCount / a.attempts;
        const rateB = b.missCount / b.attempts;
        return rateB - rateA;
      })
      .slice(0, limit)
      .map(stat => ({
        ...stat,
        question: QMAP.get(stat.questionId)
      }));

    console.info(`[SAA Info] Found ${weakAreas.length} weak areas`);
    return weakAreas;
  }, []);
}

/**
 * WHAT IT DOES: Extracts score trend over time
 *
 * WHY WE NEED IT: Shows improvement (or decline) in quiz performance
 * over multiple attempts. Used for charts and progress tracking.
 *
 * PARAMETERS:
 * - history: History object from getSessionHistory()
 * - mode: Filter by mode ("review", "timed", or null for all)
 *
 * RETURNS: Array of score objects sorted chronologically
 *
 * EXAMPLE:
 * [
 *   { date: 1735142400000, score: 650, passed: false },
 *   { date: 1735228800000, score: 720, passed: true }
 * ]
 */
function getScoreTrend(history, mode = null) {
  return safeOperation('Get Score Trend', () => {
    let sessions = history.sessions;

    // Filter by mode if specified
    if (mode) {
      sessions = sessions.filter(s => s.mode === mode);
    }

    // Map to score data points and sort by date
    const trend = sessions
      .map(s => ({
        date: s.completedAt,
        score: s.points,
        passed: s.passed,
        mode: s.mode
      }))
      .sort((a, b) => a.date - b.date);

    console.info(`[SAA Info] Generated score trend with ${trend.length} data points`);
    return trend;
  }, []);
}

/**
 * WHAT IT DOES: Aggregates performance statistics by domain
 *
 * WHY WE NEED IT: Shows which AWS exam domains (D1-D4) the user is
 * strongest/weakest in across all quiz attempts.
 *
 * PARAMETERS:
 * - history: History object from getSessionHistory()
 *
 * RETURNS: Object with domain stats
 *
 * EXAMPLE:
 * {
 *   "D1": { correct: 45, total: 60, percentage: 75.0, name: "Design Secure Architectures" },
 *   "D2": { correct: 38, total: 55, percentage: 69.1, name: "Design Resilient Architectures" }
 * }
 */
function getDomainPerformance(history) {
  return safeOperation('Get Domain Performance', () => {
    const domainAgg = {};

    // Aggregate all domain scores across all sessions
    for (const session of history.sessions) {
      for (const [domainId, scores] of Object.entries(session.domainScores)) {
        if (!domainAgg[domainId]) {
          domainAgg[domainId] = { correct: 0, total: 0 };
        }
        domainAgg[domainId].correct += scores.correct;
        domainAgg[domainId].total += scores.total;
      }
    }

    // Calculate percentages and add domain names
    const performance = {};
    for (const [domainId, scores] of Object.entries(domainAgg)) {
      const percentage = scores.total > 0
        ? Math.round((scores.correct / scores.total) * 100 * 10) / 10
        : 0;

      // Get domain name from first question with this domainId
      const sampleQ = QUESTIONS.find(q => q.domainId === domainId);
      const domainName = sampleQ ? sampleQ.domain : domainId;

      performance[domainId] = {
        correct: scores.correct,
        total: scores.total,
        percentage: percentage,
        name: domainName
      };
    }

    console.info(`[SAA Info] Calculated performance for ${Object.keys(performance).length} domains`);
    return performance;
  }, {});
}

// ============================================================================
// PERFORMANCE DASHBOARD UI - Visualization and rendering
// ============================================================================

/**
 * WHAT IT DOES: Renders the performance dashboard with all statistics and visualizations
 *
 * WHY WE NEED IT: Displays comprehensive analytics including summary stats,
 * domain performance bars, weak areas list, and score trend chart.
 *
 * HOW IT WORKS:
 * 1. Load session history from localStorage
 * 2. Calculate summary statistics
 * 3. Render domain performance bars
 * 4. Display weak areas list
 * 5. Draw score trend chart
 * 6. Show dashboard card
 *
 * SIDE EFFECTS:
 * - Modifies DOM elements in performanceCard
 * - Makes performanceCard visible
 */
function renderPerformanceDashboard() {
  safeOperation('Render Performance Dashboard', () => {
    const history = getSessionHistory();
    const performanceCard = document.getElementById('performanceCard');

    // Visibility now controlled by page-section.active class (via switchTab)

    // If no history, show empty state
    if (!history.sessions || history.sessions.length === 0) {
      performanceCard.innerHTML = `
        <div class="perf-header">
          <h2>📊 Performance Dashboard</h2>
        </div>
        <div class="perf-empty">
          <div class="perf-empty-icon">📈</div>
          <div class="perf-empty-text">No performance data yet</div>
          <div class="perf-empty-hint">Complete a quiz to start tracking your progress</div>
        </div>
      `;

      console.info('[SAA Info] Performance dashboard shown (empty state)');
      return;
    }

    // Calculate summary statistics
    const totalAttempts = history.sessions.length;
    const avgScore = Math.round(history.sessions.reduce((sum, s) => sum + s.points, 0) / totalAttempts);
    const passedCount = history.sessions.filter(s => s.passed).length;
    const passRate = Math.round((passedCount / totalAttempts) * 100);

    // Calculate improvement trend (compare last 3 to first 3)
    let improvement = 0;
    if (totalAttempts >= 4) {
      const firstThree = history.sessions.slice(0, 3);
      const lastThree = history.sessions.slice(-3);
      const firstAvg = firstThree.reduce((sum, s) => sum + s.points, 0) / 3;
      const lastAvg = lastThree.reduce((sum, s) => sum + s.points, 0) / 3;
      improvement = Math.round(lastAvg - firstAvg);
    }

    // Update summary stats
    document.getElementById('totalAttempts').textContent = totalAttempts;
    document.getElementById('avgScore').textContent = avgScore;
    document.getElementById('passRate').textContent = `${passRate}%`;

    const improvementEl = document.getElementById('improvement');
    improvementEl.textContent = improvement >= 0 ? `+${improvement}` : improvement;
    if (improvement > 0) {
      improvementEl.style.color = 'var(--success)';
    } else if (improvement < 0) {
      improvementEl.style.color = 'var(--error)';
    } else {
      improvementEl.style.color = 'var(--muted)';
    }

    // Render domain performance bars
    renderDomainBars(history);

    // Render weak areas
    renderWeakAreas(history);

    // Render score trend chart
    renderScoreTrend(history);

    console.info('[SAA Info] Performance dashboard rendered successfully');
  }, undefined);
}

/**
 * WHAT IT DOES: Renders horizontal bars showing performance by domain
 *
 * PARAMETERS:
 * - history: History object from getSessionHistory()
 *
 * SIDE EFFECTS: Updates domainBars element innerHTML
 */
function renderDomainBars(history) {
  const domainPerf = getDomainPerformance(history);
  const domainBarsEl = document.getElementById('domainBars');

  if (Object.keys(domainPerf).length === 0) {
    domainBarsEl.innerHTML = '<div style="color: var(--muted); font-size: 14px;">No domain data available</div>';
    return;
  }

  // Sort domains by ID (D1, D2, D3, D4)
  const sortedDomains = Object.entries(domainPerf).sort((a, b) => a[0].localeCompare(b[0]));

  domainBarsEl.innerHTML = sortedDomains.map(([domainId, perf]) => {
    const percentage = perf.percentage;
    const colorClass = percentage >= 80 ? 'good' : percentage >= 60 ? 'medium' : 'poor';

    return `
      <div class="domain-bar">
        <div class="domain-bar-header">
          <div class="domain-bar-name">${domainId}: ${escapeHtml(perf.name)}</div>
          <div class="domain-bar-stat">${perf.correct}/${perf.total} correct</div>
        </div>
        <div class="domain-bar-track">
          <div class="domain-bar-fill ${colorClass}" style="width: ${percentage}%;">
            ${percentage}%
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * WHAT IT DOES: Renders list of most frequently missed questions
 *
 * PARAMETERS:
 * - history: History object from getSessionHistory()
 *
 * SIDE EFFECTS: Updates weakAreas element innerHTML
 */
function renderWeakAreas(history) {
  const weakAreas = analyzeWeakAreas(history, 10);
  const weakAreasEl = document.getElementById('weakAreas');

  if (weakAreas.length === 0) {
    weakAreasEl.innerHTML = '<div style="color: var(--muted); font-size: 14px;">Great job! No weak areas identified yet.</div>';
    return;
  }

  weakAreasEl.innerHTML = weakAreas.map(area => {
    const missRate = Math.round((area.missCount / area.attempts) * 100);
    const question = area.question;

    if (!question) {
      return '';
    }

    return `
      <div class="weak-item">
        <div class="weak-item-text">
          <strong>${escapeHtml(question.id)}</strong> • ${escapeHtml(question.section)} • ${escapeHtml(question.domainId)}<br>
          <span style="font-size: 13px; color: var(--muted);">${escapeHtml(question.question.substring(0, 80))}${question.question.length > 80 ? '...' : ''}</span>
        </div>
        <div class="weak-item-stats">
          <span>${area.attempts} attempts</span>
          <div class="weak-item-badge">${area.missCount} missed (${missRate}%)</div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * WHAT IT DOES: Renders a line chart showing score progression over time
 *
 * PARAMETERS:
 * - history: History object from getSessionHistory()
 *
 * SIDE EFFECTS: Updates scoreTrend element innerHTML
 */
function renderScoreTrend(history) {
  const trend = getScoreTrend(history);
  const scoreTrendEl = document.getElementById('scoreTrend');

  if (trend.length === 0) {
    scoreTrendEl.innerHTML = '<div class="trend-empty">No score data available</div>';
    return;
  }

  // Take last 10 sessions for the chart
  const recentTrend = trend.slice(-10);

  // Chart dimensions and settings
  const maxScore = 1000;
  const minScore = 0;
  const passingScore = PASSING_SCORE; // 720
  const chartHeight = 180;
  const chartWidth = scoreTrendEl.offsetWidth || 600;
  const padding = { top: 10, right: 10, bottom: 10, left: 50 };
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const plotWidth = chartWidth - padding.left - padding.right;

  // Calculate positions for each data point
  const pointSpacing = recentTrend.length > 1 ? plotWidth / (recentTrend.length - 1) : plotWidth / 2;

  // Generate Y-axis grid lines (1000, 750, 500, 250, 0)
  const gridLines = [1000, 750, 500, 250, 0];

  // Build chart HTML
  let chartHtml = '<div class="trend-canvas" style="margin-left: 50px;">';

  // Add grid lines
  chartHtml += '<div class="trend-grid">';
  gridLines.forEach(score => {
    const yPercent = ((maxScore - score) / (maxScore - minScore)) * 100;
    chartHtml += `
      <div class="trend-grid-line" style="position: absolute; top: ${yPercent}%; width: 100%;">
        <span class="trend-grid-label">${score}</span>
      </div>
    `;
  });
  chartHtml += '</div>';

  // Add passing score line
  const passingYPercent = ((maxScore - passingScore) / (maxScore - minScore)) * 100;
  chartHtml += `
    <div class="trend-passing-line" style="top: ${passingYPercent}%;">
      <span class="trend-passing-label">Pass (${passingScore})</span>
    </div>
  `;

  // Add connecting lines between points
  chartHtml += '<div class="trend-line">';
  for (let i = 0; i < recentTrend.length - 1; i++) {
    const point1 = recentTrend[i];
    const point2 = recentTrend[i + 1];

    const x1 = i * pointSpacing;
    const y1 = ((maxScore - point1.score) / (maxScore - minScore)) * plotHeight;
    const x2 = (i + 1) * pointSpacing;
    const y2 = ((maxScore - point2.score) / (maxScore - minScore)) * plotHeight;

    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

    chartHtml += `
      <div class="trend-connector" style="
        left: ${x1}px;
        top: ${y1}px;
        width: ${length}px;
        transform: rotate(${angle}deg);
      "></div>
    `;
  }
  chartHtml += '</div>';

  // Add data points
  recentTrend.forEach((point, i) => {
    const x = i * pointSpacing;
    const y = ((maxScore - point.score) / (maxScore - minScore)) * plotHeight;
    const passedClass = point.passed ? 'passed' : '';

    // Format date for tooltip
    const date = new Date(point.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    chartHtml += `
      <div class="trend-point ${passedClass}"
           style="left: ${x}px; top: ${y}px;"
           data-score="${point.score}"
           data-date="${dateStr}"
           data-mode="${point.mode}"
           data-passed="${point.passed}">
      </div>
    `;
  });

  chartHtml += '</div>';

  scoreTrendEl.innerHTML = chartHtml;

  // Add hover tooltips to points
  scoreTrendEl.querySelectorAll('.trend-point').forEach(pointEl => {
    pointEl.addEventListener('mouseenter', () => {
      const score = pointEl.getAttribute('data-score');
      const date = pointEl.getAttribute('data-date');
      const mode = pointEl.getAttribute('data-mode');
      const passed = pointEl.getAttribute('data-passed') === 'true';

      const tooltip = document.createElement('div');
      tooltip.className = 'trend-tooltip visible';
      tooltip.innerHTML = `
        <div><strong>${date}</strong></div>
        <div>Score: ${score}/1000</div>
        <div>Mode: ${mode}</div>
        <div style="color: ${passed ? 'var(--success)' : 'var(--error)'};">${passed ? '✓ Passed' : '✗ Failed'}</div>
      `;

      const rect = pointEl.getBoundingClientRect();
      const chartRect = scoreTrendEl.getBoundingClientRect();

      // Calculate tooltip dimensions (approximate)
      const tooltipHeight = 80; // Approximate tooltip height in pixels
      const tooltipWidth = 100; // Approximate tooltip width in pixels

      // Calculate point position relative to chart
      const pointX = rect.left - chartRect.left;
      const pointY = rect.top - chartRect.top;

      // ✅ Smart vertical positioning: flip below if too close to top
      const flipThreshold = 100; // If point is within 100px of top, show tooltip below
      let tooltipY;

      if (pointY < flipThreshold) {
        // Too close to top - show tooltip BELOW the point
        tooltipY = pointY + 15; // 15px below point
        console.info('[SAA Info] Tooltip flipped below point (too close to top edge)');
      } else {
        // Normal case - show tooltip ABOVE the point
        tooltipY = pointY - tooltipHeight;
      }

      // Horizontal positioning (centered, with bounds checking)
      let tooltipX = pointX - (tooltipWidth / 2);

      // Keep tooltip within chart bounds horizontally
      if (tooltipX < 0) {
        tooltipX = 0;
      } else if (tooltipX + tooltipWidth > chartRect.width) {
        tooltipX = chartRect.width - tooltipWidth;
      }

      tooltip.style.left = tooltipX + 'px';
      tooltip.style.top = tooltipY + 'px';

      scoreTrendEl.appendChild(tooltip);
      pointEl._tooltip = tooltip;
    });

    pointEl.addEventListener('mouseleave', () => {
      if (pointEl._tooltip) {
        pointEl._tooltip.remove();
        pointEl._tooltip = null;
      }
    });
  });
}

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
function switchTab(tabName) {
  safeOperation('Switch Tab', () => {
    // === HANDLE RESET TAB ===
    if (tabName === 'reset') {
      const message =
        "⚠️ RESET WILL DELETE ALL DATA:\n\n" +
        "• Current quiz progress (questions, answers, timer)\n" +
        "• Performance history (all past attempts)\n" +
        "• Statistics and trends\n\n" +
        "This cannot be undone. Continue?";

      if (confirm(message)) {
        console.info('[SAA Info] User initiated complete reset (state + history)');
        stopTimer();
        clearAllData();  // Clears both STATE_KEY and HISTORY_KEY
        location.reload();
      }
      return;
    }

    // === CHECK QUIZ STATE ===
    const state = normalizeStateForRuntime(loadState());
    const hasActiveTimedQuiz = state &&
                                state.session &&
                                !state.session.completed &&
                                state.session.mode === 'timed';

    const leavingTimedQuiz = currentTab === 'practice' && hasActiveTimedQuiz;
    const returningToTimedQuiz = tabName === 'practice' && hasActiveTimedQuiz && currentTab !== 'practice';

    // === LEAVING TIMED QUIZ: PAUSE TIMER ===
    if (leavingTimedQuiz) {
      console.info('[SAA Info] Leaving timed quiz, pausing timer');

      // Only pause if not already paused
      if (!quizPausedState) {
        stopTimer();

        // Store frozen time for navigation pause (same as manual pause)
        const frozenTime = getRemainingSec(state.session);

        quizPausedState = {
          pausedAt: nowMs(),
          frozenTime: frozenTime
        };

        // Apply CSS class for visual pause state
        const quizCard = document.getElementById('quizCard');
        if (quizCard) {
          quizCard.classList.add('quiz-manually-paused');
        }

        console.info('[SAA Info] Timer auto-paused (navigation)');
      } else {
        console.info('[SAA Info] Already paused, keeping pause state');
      }
    }

    // === UPDATE NAVIGATION STATE ===
    const previousTab = currentTab;
    currentTab = tabName;

    // Update tab button active states
    document.querySelectorAll('.nav-tab').forEach(tab => {
      const tabId = tab.getAttribute('data-tab');
      if (tabId === tabName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // === UPDATE SECTION VISIBILITY ===
    document.querySelectorAll('.page-section').forEach(section => {
      section.classList.remove('active');
    });

    const sectionMap = {
      'home': 'homeSection',
      'practice': 'practiceSection',
      'performance': 'performanceSection',
      'presentations': 'presentationsSection'
    };

    const targetSection = document.getElementById(sectionMap[tabName]);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    // === RETURNING TO TIMED QUIZ: RENDER WITH PAUSE STATE ===
    if (returningToTimedQuiz) {
      console.info('[SAA Info] Returning to timed quiz');

      // Guard: Only keep pause state if session exists and is not completed
      if (quizPausedState && (!state.session || state.session.completed)) {
        console.info('[SAA Info] Clearing stale pause state (session completed or missing)');
        quizPausedState = null;
      }

      // Update pause button icon based on pause state
      const pauseBtn = document.getElementById('pauseBtn');
      if (quizPausedState && pauseBtn) {
        pauseBtn.textContent = '▶️';
        pauseBtn.title = 'Resume quiz';
        console.info('[SAA Info] Returning to paused quiz');
      } else if (pauseBtn) {
        pauseBtn.textContent = '⏸️';
        pauseBtn.title = 'Pause quiz';
      }

      // Render quiz (buttons will be disabled if paused)
      renderQuiz(state);
    } else if (tabName === 'practice' && state && state.session && !state.session.completed) {
      renderQuiz(state);
    }

    // === TAB-SPECIFIC RENDERING ===
    if (tabName === 'performance') {
      renderPerformanceDashboard();
    }

    if (tabName === 'presentations') {
      renderPresentations();
    }

    // === MOBILE: CLOSE MENU ===
    const navMenu = document.getElementById('navMenu');
    if (navMenu && navMenu.classList.contains('open')) {
      navMenu.classList.remove('open');
    }

    console.info(`[SAA Info] Switched from '${previousTab}' to '${tabName}'`);
  }, undefined);
}

/**
 * WHAT IT DOES: Debounced version of switchTab to prevent rapid clicking issues
 */
function switchTabDebounced(tabName) {
  if (navigationLocked) {
    console.info('[SAA Info] Navigation locked, ignoring click');
    return;
  }

  navigationLocked = true;
  switchTab(tabName);

  setTimeout(() => {
    navigationLocked = false;
  }, 300);
}

/**
 * WHAT IT DOES: Toggles pause state for timed quiz (no overlay)
 * WHY IT EXISTS: Allows user to pause/resume by clicking pause button
 */
function togglePause(state) {
  safeOperation('Toggle Pause', () => {
    const isPaused = quizPausedState !== null;

    if (isPaused) {
      // RESUME: Clear pause state and restart timer
      if (quizPausedState && quizPausedState.pausedAt) {
        const pauseDuration = nowMs() - quizPausedState.pausedAt;
        state.session.startedAtMs += pauseDuration;
        persistRuntimeState(state);

        const pauseSeconds = Math.floor(pauseDuration / 1000);
        console.info(`[SAA Info] Resumed after ${pauseSeconds}s pause`);
      }

      quizPausedState = null;
      startTimer(state);

      // Remove CSS class to re-enable interactions
      const quizCard = document.getElementById('quizCard');
      if (quizCard) {
        quizCard.classList.remove('quiz-manually-paused');
      }

      // Update pause button back to pause icon
      const pauseBtn = document.getElementById('pauseBtn');
      pauseBtn.textContent = '⏸️';
      pauseBtn.title = 'Pause quiz';

      // Re-render to enable buttons
      renderQuiz(state);

      console.info('[SAA Info] Quiz resumed');
    } else {
      // PAUSE: Stop timer and set pause state
      stopTimer();

      // Store frozen time value for display
      const frozenTime = getRemainingSec(state.session);

      quizPausedState = {
        pausedAt: nowMs(),
        frozenTime: frozenTime  // Save the time we paused at
      };

      // Apply CSS class to visually disable interactions
      const quizCard = document.getElementById('quizCard');
      if (quizCard) {
        quizCard.classList.add('quiz-manually-paused');
      }

      // Update pause button to resume icon
      const pauseBtn = document.getElementById('pauseBtn');
      pauseBtn.textContent = '▶️';
      pauseBtn.title = 'Resume quiz';

      // Re-render to disable buttons
      renderQuiz(state);

      console.info('[SAA Info] Quiz paused');
    }
  }, undefined);
}

/**
 * WHAT IT DOES: Renders the presentations list with embedded PDF viewers
 */
function renderPresentations() {
  safeOperation('Render Presentations', () => {
    const presentationsListEl = document.querySelector('.presentations-list');

    if (!presentationsListEl) {
      console.warn('[SAA Warning] Presentations list element not found');
      return;
    }

    const presentations = [
      {
        filename: 'קבוצת למידה SAA v1.pdf',
        title: 'IAM, EC2 & Storage Fundamentals',
        description: 'SAA Study Group Session 1'
      },
      {
        filename: 'קבוצת למידה SAA v2.pdf',
        title: 'High Availability, Load Balancing & Databases',
        description: 'SAA Study Group Session 2'
      },
      {
        filename: 'קבוצת למידה SAA v3.pdf',
        title: 'Route 53 & S3 Basics',
        description: 'SAA Study Group Session 3'
      },
      {
        filename: 'קבוצת למידה SAA v4.pdf',
        title: 'Advanced S3, Security & Global Delivery',
        description: 'SAA Study Group Session 4'
      },
      {
        filename: 'קבוצת למידה SAA v5.pdf',
        title: 'Integration, Messaging, Containers & Serverless',
        description: 'SAA Study Group Session 5'
      },
      {
        filename: 'קבוצת למידה SAA v6.pdf',
        title: 'Data, Analytics & Machine Learning on AWS',
        description: 'SAA Study Group Session 6'
      },
      {
        filename: 'קבוצת למידה SAA v7.pdf',
        title: 'Monitoring, IAM Advanced & Cloud Security',
        description: 'SAA Study Group Session 7'
      },
      {
        filename: 'קבוצת למידה SAA v8.pdf',
        title: 'VPC Networking & DR',
        description: 'SAA Study Group Session 8'
      }
    ];

    const html = presentations.map((pres, index) => {
      const pdfPath = `Presentations/${encodeURIComponent(pres.filename)}`;

      return `
        <div class="presentation-item" data-presentation-index="${index}">
          <h3 class="presentation-header">${escapeHtml(pres.title)}</h3>
          <embed
            src="${pdfPath}#toolbar=1&navpanes=1&scrollbar=1&view=FitH"
            type="application/pdf"
            class="presentation-embed"
            aria-label="${escapeHtml(pres.title)}"
          />
          <noscript>
            <div class="presentation-fallback">
              <p>📄 Your browser doesn't support embedded PDFs.</p>
              <p><a href="${pdfPath}" download="${escapeHtml(pres.filename)}">⬇️ Download ${escapeHtml(pres.title)}</a></p>
            </div>
          </noscript>
        </div>
      `;
    }).join('');

    presentationsListEl.innerHTML = html;

    console.info('[SAA Info] Rendered', presentations.length, 'presentations');
  }, undefined);
}

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
 * - Loads QUESTIONS and QMAP globals
 * - Modifies DOM (dropdowns, quiz card visibility)
 * - May show error message to user
 */
async function init() {
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

    // Hide loading overlay before showing error
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }

    alert(errorMsg + '\n\nPlease check:\n1. questions.json exists\n2. File is valid JSON\n3. Network connection is working');
    return;  // Stop initialization
  }

  // Store questions globally
  QUESTIONS = questions;
  QMAP = new Map(QUESTIONS.map((q) => [q.id, q]));

  // Hide loading overlay after successful load
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }

  // ===== STEP 2: Setup UI =====

  // Mode select already configured in HTML (Review + Timed only)

  // Hide section chips/buttons (legacy UI, user chooses only from dropdown)
  if (sectionButtons) sectionButtons.style.display = "none";

  // Inform user about question count
  if (QUESTIONS.length < EXAM_TOTAL_QUESTIONS) {
    const msg = `Warning: You have ${QUESTIONS.length} questions. Timed mode requires at least ${EXAM_TOTAL_QUESTIONS}.`;
    hintText.textContent = msg;
    console.warn(`[SAA Warning] ${msg}`);
  } else if (QUESTIONS.length > EXAM_TOTAL_QUESTIONS) {
    const msg = `You have ${QUESTIONS.length} questions. Timed mode will randomly select ${EXAM_TOTAL_QUESTIONS} per session.`;
    hintText.textContent = msg;
    console.info(`[SAA Info] ${msg}`);
  }

  // Build dropdown options from loaded questions
  buildDomainOptions();
  buildSectionOptions("ALL");

  // Apply mode-specific UI rules
  ensureModeRulesUI();

  // ===== STEP 3: Restore Previous Session (if exists) =====

  const existing = normalizeStateForRuntime(loadState());

  // Check if there's a valid session to restore
  if (existing && existing.session && existing.session.questionIds && existing.session.questionIds.length) {
    console.info('[SAA Info] Restoring previous session');

    const s = existing.session;

    // Restore UI state to match the session
    modeSelect.value = normalizeMode(s.mode);

    if (s.mode === "timed") {
      domainSelect.value = "ALL";
      sectionSelect.value = "ALL";
    } else {
      domainSelect.value = s.domainId;
      buildSectionOptions(s.domainId);
      sectionSelect.value = s.section;
    }

    ensureModeRulesUI();

    // Navigate to practice tab to show the quiz
    switchTab('practice');

    // If session was completed, show results. Otherwise, resume quiz.
    if (s.completed) {
      console.info('[SAA Info] Session was completed, showing results');
      showResults(existing, false);
    } else {
      console.info('[SAA Info] Session in progress, resuming quiz');
      renderQuiz(existing);
    }
  } else {
    console.info('[SAA Info] No previous session found, showing home page');
    // Initialize to home tab
    currentTab = 'home';
    switchTab('home');
  }

  console.info('[SAA Info] Initialization complete');
}

// ============================================================================
// EVENT LISTENERS - User interaction handlers
// ============================================================================
// All button clicks and dropdown changes are handled here

/**
 * MODE DROPDOWN CHANGE
 * When user switches between Review and Timed mode, update UI rules
 * (Timed mode disables domain/section filtering)
 */
modeSelect.addEventListener("change", () => {
  ensureModeRulesUI();
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
 * HAMBURGER MENU TOGGLE (Mobile)
 */
document.addEventListener('click', (e) => {
  const hamburger = e.target.closest('.nav-hamburger');
  if (hamburger) {
    e.stopPropagation();
    const navMenu = document.getElementById('navMenu');
    if (navMenu) {
      navMenu.classList.toggle('open');
    }
  }
});

/**
 * HOME PAGE CTA BUTTON
 */
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'ctaStartBtn') {
    switchTab('practice');
  }
});

/**
 * CLOSE MOBILE MENU ON OUTSIDE CLICK
 */
document.addEventListener('click', (e) => {
  const navMenu = document.getElementById('navMenu');
  const hamburger = e.target.closest('.nav-hamburger');
  const isInsideMenu = e.target.closest('.nav-menu');

  if (navMenu &&
      navMenu.classList.contains('open') &&
      !hamburger &&
      !isInsideMenu) {
    navMenu.classList.remove('open');
  }
});

/**
 * ORIENTATION CHANGE HANDLER (Mobile)
 */
window.addEventListener('orientationchange', () => {
  const navMenu = document.getElementById('navMenu');
  if (navMenu && navMenu.classList.contains('open')) {
    navMenu.classList.remove('open');
  }
});

// ============================================================================
// EXISTING EVENT LISTENERS
// ============================================================================

/**
 * DOMAIN DROPDOWN CHANGE
 * When user selects a domain, rebuild the section dropdown to show
 * only sections that exist in that domain
 */
domainSelect.addEventListener("change", () => {
  buildSectionOptions(domainSelect.value);
});

/**
 * SECTION DROPDOWN CHANGE
 * Placeholder for future functionality (currently no action needed)
 */
sectionSelect.addEventListener("change", () => {
  // no-op (reserved for future features)
});

/**
 * START/RESUME BUTTON
 * Starts a new quiz or resumes existing session with current filter settings
 */
startBtn.addEventListener("click", () => {
  const filters = getFiltersFromUI();
  ensureModeRulesUI();

  safeOperation('Start Quiz', () => {
    // Clear any existing pause state from previous sessions
    quizPausedState = null;

    // Remove pause CSS class if it exists
    const quizCard = document.getElementById('quizCard');
    if (quizCard) {
      quizCard.classList.remove('quiz-manually-paused');
    }

    let state = normalizeStateForRuntime(createNewSession(filters, false));
    renderQuiz(state);
  }, undefined);
});

/**
 * START FRESH BUTTON
 * Forces creation of a brand new session with new shuffle order,
 * even if a matching session already exists
 */
newSessionBtn.addEventListener("click", () => {
  const filters = getFiltersFromUI();
  ensureModeRulesUI();

  safeOperation('Start Fresh Quiz', () => {
    // Clear any existing pause state from previous sessions
    quizPausedState = null;

    // Remove pause CSS class if it exists
    const quizCard = document.getElementById('quizCard');
    if (quizCard) {
      quizCard.classList.remove('quiz-manually-paused');
    }

    let state = normalizeStateForRuntime(createNewSession(filters, true));
    renderQuiz(state);
  }, undefined);
});

/**
 * OLD RESET BUTTON LISTENER - REMOVED
 * Reset is now handled by navigation tab via switchTab('reset')
 */
// DELETED: resetBtn listener - element no longer exists (replaced with nav tab)

/**
 * PAUSE/RESUME BUTTON (Timed Mode Only)
 * Manually pause and resume timed quiz with timer adjustment
 */
const pauseBtn = document.getElementById('pauseBtn');
if (pauseBtn) {
  pauseBtn.addEventListener('click', () => {
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
submitBtn.addEventListener("click", () => {
  safeOperation('Submit Quiz', () => {
    const state = normalizeStateForRuntime(loadState());
    if (!state || !state.session) {
      console.warn('[SAA Warning] No active session to submit');
      return;
    }

    if (state.session.completed) {
      console.info('[SAA Info] Session already completed');
      return;
    }

    // Timed mode: Confirm before submitting (can't undo)
    if (state.session.mode === "timed") {
      if (!confirm("End exam now? (You can't continue after submitting)")) {
        console.info('[SAA Info] User cancelled exam submission');
        return;
      }
    }

    showResults(state, false);
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
  alert("Initialization error: " + (e.message || String(e)) + "\n\nPlease refresh the page or check the console for details.");
});
