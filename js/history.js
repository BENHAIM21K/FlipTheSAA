// FlipTheSAA — Session history and analytics
import { isCorrectAnswer } from './answers.js';
import { HISTORY_KEY, MAX_HISTORY_SESSIONS } from './config.js';
import { computeScore } from './exam.js';
import { S } from './state.js';
import { nowMs, safeOperation } from './util.js';

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
export function getSessionHistory() {
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
export function saveSessionHistory(history) {
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
export function recordSessionToHistory(state) {
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
      const q = S.QMAP.get(qid);
      if (!q) continue;

      const userAnswer = session.answers[qid];
      const correct = userAnswer !== undefined && isCorrectAnswer(userAnswer, q.answer);

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
        answered: userAnswer !== undefined,
        // timed exams only: false for the 15 unscored questions (older records have no flag = scored)
        ...(session.mode === "timed" && session.scoredIds ? { scored: session.scoredIds.has(qid) } : {})
      });
    }

    // Create session record
    const sessionRecord = {
      sessionId: `${session.mode}-${startedAt}`,
      mode: session.mode,
      drill: !!session.drill,   // a mistake-drill session (still a review session for scoring)
      domainIds: session.domainIds || [],
      sections:  session.sections  || [],
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
export function analyzeWeakAreas(history, limit = 10) {
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
        question: S.QMAP.get(stat.questionId)
      }));

    console.info(`[SAA Info] Found ${weakAreas.length} weak areas`);
    return weakAreas;
  }, []);
}

/**
 * WHAT IT DOES: The questions for the mistake drill: every question whose MOST
 * RECENT answer was wrong, most-missed first (ties: the most recent miss first)
 *
 * WHY "most recent": answering a question correctly in any later session takes
 * it out of the drill, so the deck shrinks as you improve. Unanswered questions
 * and flagged-only questions are not mistakes (owner's decision: wrong only).
 *
 * RETURNS: [{ questionId, missCount, lastMissAt }]
 */
export function getDrillQuestions(history) {
  return safeOperation('Get Drill Questions', () => {
    const stats = {};
    const sessions = [...(history.sessions || [])].sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
    for (const session of sessions) {
      for (const r of session.questionResults || []) {
        if (!r.answered || !S.QMAP.has(r.questionId)) continue;
        const s = stats[r.questionId] || (stats[r.questionId] = { questionId: r.questionId, missCount: 0, lastMissAt: 0, lastCorrect: true });
        s.lastCorrect = !!r.correct;
        if (!r.correct) { s.missCount++; s.lastMissAt = session.completedAt || 0; }
      }
    }
    return Object.values(stats)
      .filter(s => !s.lastCorrect)
      .sort((a, b) => b.missCount - a.missCount || b.lastMissAt - a.lastMissAt)
      .map(({ questionId, missCount, lastMissAt }) => ({ questionId, missCount, lastMissAt }));
  }, []);
}

/** True when any session has at least one answered question (the drill has something to say) */
export function hasAnsweredQuestions(history) {
  return (history.sessions || []).some(s => (s.questionResults || []).some(r => r.answered));
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
export function getScoreTrend(history, mode = null) {
  return safeOperation('Get Score Trend', () => {
    // Mistake drills aren't scored like exams (see renderPerformanceDashboard)
    let sessions = history.sessions.filter(s => !s.drill);

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
        mode: s.mode,
        drill: !!s.drill
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
export function getDomainPerformance(history) {
  return safeOperation('Get Domain Performance', () => {
    const domainAgg = {};
    const add = (domainId, correct, total) => {
      if (!domainAgg[domainId]) domainAgg[domainId] = { correct: 0, total: 0 };
      domainAgg[domainId].correct += correct;
      domainAgg[domainId].total += total;
    };

    // Accuracy counts ANSWERED questions only. domainScores counts every question
    // in the session, so finishing a 50-question review after 5 answers used to
    // read as 10% everywhere. questionResults knows which were answered.
    for (const session of history.sessions) {
      if (Array.isArray(session.questionResults) && session.questionResults.length) {
        for (const r of session.questionResults) {
          const q = S.QMAP.get(r.questionId);
          if (q && r.answered) add(q.domainId, r.correct ? 1 : 0, 1);
        }
      } else {
        for (const [domainId, scores] of Object.entries(session.domainScores || {})) add(domainId, scores.correct, scores.total);
      }
    }

    // Calculate percentages and add domain names
    const performance = {};
    for (const [domainId, scores] of Object.entries(domainAgg)) {
      const percentage = scores.total > 0
        ? Math.round((scores.correct / scores.total) * 100 * 10) / 10
        : 0;

      // Get domain name from first question with this domainId
      const sampleQ = S.QUESTIONS.find(q => q.domainId === domainId);
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
