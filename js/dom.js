// FlipTheSAA — Cached DOM references for the practice screen

// ============================================================================
// DOM REFERENCES - Cache all HTML element references for performance
// ============================================================================

// Setup card controls (shown before starting quiz)
// Single-select mode widget
export const modeDropdown      = document.getElementById("modeDropdown");
export const modeTrigger       = document.getElementById("modeTrigger");
export const modeLabel         = document.getElementById("modeLabel");
export const modePanel         = document.getElementById("modePanel");
// Multi-select domain widget
export const domainDropdown  = document.getElementById("domainDropdown");
export const domainTrigger   = document.getElementById("domainTrigger");
export const domainLabel     = document.getElementById("domainLabel");
export const domainPanel     = document.getElementById("domainPanel");
export const domainAllCheck  = document.getElementById("domainAll");
// Multi-select section widget
export const sectionDropdown = document.getElementById("sectionDropdown");
export const sectionTrigger  = document.getElementById("sectionTrigger");
export const sectionLabel    = document.getElementById("sectionLabel");
export const sectionPanel    = document.getElementById("sectionPanel");
export const sectionAllCheck = document.getElementById("sectionAll");
// Single-select difficulty widget
export const difficultyDropdown = document.getElementById("difficultyDropdown");
export const difficultyTrigger  = document.getElementById("difficultyTrigger");
export const difficultyLabel    = document.getElementById("difficultyLabel");
export const difficultyPanel    = document.getElementById("difficultyPanel");
export const startBtn = document.getElementById("startBtn"); // "Start" or "Resume" button
export const newSessionBtn = document.getElementById("newSessionBtn"); // "Start Fresh" button
// const resetBtn = document.getElementById("resetBtn"); // REMOVED - now handled by navigation tab
export const hintText = document.getElementById("hintText"); // Help text below dropdowns

// Quiz card elements (shown during active quiz)
export const quizCard = document.getElementById("quizCard"); // Main quiz container
export const questionBox = document.getElementById("questionBox"); // Question text and choices area
export const progressText = document.getElementById("progressText"); // "Question X/Y • Mode: REVIEW"
export const metaText = document.getElementById("metaText"); // "Tags: D1 • IAM"
export const timerEl = document.getElementById("timer"); // Timer display (timed mode only)
export const scoreMini = document.getElementById("scoreMini"); // "Answered: X/Y" or final score
export const prevBtn = document.getElementById("prevBtn"); // "Previous" navigation button
export const nextBtn = document.getElementById("nextBtn"); // "Next" navigation button
export const submitBtn = document.getElementById("submitBtn"); // "Finish" or "End Exam" button
export const jumpGrid = document.getElementById("jumpGrid"); // Question number grid (1,2,3...65)
export const resultBox = document.getElementById("resultBox"); // Final results and review section

// Legacy element (hidden, not used)
export const sectionButtons = document.getElementById("sectionButtons"); // Old UI element (deprecated)
