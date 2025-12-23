/* SAA Practice - Static (HTML/CSS/JS)
   - Loads questions from questions.json
   - Modes: REVIEW (instant feedback after answering), TIMED (130 min, no feedback until submit)
   - Persist: order, answers, current question, timer (localStorage)

   Scoring rules:
   - TIMED: 65 questions shown, only 50 random (hidden) are scored => 1000 max (50*20)
   - REVIEW: score scaled to 1000 => round((correct/total)*1000), PASS if >= 720

   UI rules you requested:
   - REVIEW: DO NOT show the score during the run (only show Answered X/Y). Show score only at the end.
   - Remove section “chips/buttons” — user chooses section only from the section dropdown.
   - Any old "practice" sessions are auto-migrated to "review".
*/

const STATE_KEY = "saa_practice_state_v1";
const EXAM_DURATION_SEC = 130 * 60;
const EXAM_TOTAL_QUESTIONS = 65;
const EXAM_SCORED_QUESTIONS = 50;

const POINTS_PER_SCORED_QUESTION = 20; // 50 * 20 = 1000
const PASSING_SCORE = 720; // out of 1000

let QUESTIONS = [];
let QMAP = new Map();
let timerInterval = null;

// DOM
const modeSelect = document.getElementById("modeSelect");
const domainSelect = document.getElementById("domainSelect");
const sectionSelect = document.getElementById("sectionSelect");
const startBtn = document.getElementById("startBtn");
const newSessionBtn = document.getElementById("newSessionBtn");
const resetBtn = document.getElementById("resetBtn");
const hintText = document.getElementById("hintText");

const quizCard = document.getElementById("quizCard");
const questionBox = document.getElementById("questionBox");
const progressText = document.getElementById("progressText");
const metaText = document.getElementById("metaText");
const timerEl = document.getElementById("timer");
const scoreMini = document.getElementById("scoreMini");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const submitBtn = document.getElementById("submitBtn");
const jumpGrid = document.getElementById("jumpGrid");
const resultBox = document.getElementById("resultBox");

// Exists in your HTML; we now hide it and do not use it
const sectionButtons = document.getElementById("sectionButtons");

const SECTION_ORDER = [
  "EC2",
  "Auto Scaling",
  "DynamoDB",
  "EBS",
  "EFS",
  "ELB",
  "IAM",
  "Lambda",
  "RDS",
  "SQS",
  "S3",
  "VPC",
  "CloudFront",
  "Route 53",
  "CloudWatch",
  "KMS"
];

function normalizeMode(mode) {
  // Only allow "review" or "timed". Any other value (including old "practice") becomes "review".
  return mode === "timed" ? "timed" : "review";
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function clearState() {
  localStorage.removeItem(STATE_KEY);
}

function nowMs() {
  return Date.now();
}

// Deterministic RNG for stable shuffles (seeded)
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  // Simple hash -> 32-bit seed
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(arr, seedStr) {
  const a = [...arr];
  const rand = mulberry32(hashStringToSeed(seedStr));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickSeededSubset(arr, count, seedStr) {
  const shuffled = seededShuffle(arr, seedStr);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function getFiltersFromUI() {
  return {
    mode: normalizeMode(modeSelect.value),
    domainId: domainSelect.value,
    section: sectionSelect.value
  };
}

function sessionKeyFor(filters) {
  const mode = normalizeMode(filters.mode);

  // Timed mode is always "full exam"
  if (mode === "timed") return "timed::ALL::ALL";

  // Always store as review sessions
  return `review::${filters.domainId}::${filters.section}`;
}

function filteredQuestions(filters) {
  let list = QUESTIONS;

  if (filters.mode !== "timed") {
    if (filters.domainId !== "ALL") {
      list = list.filter((q) => q.domainId === filters.domainId);
    }
    if (filters.section !== "ALL") {
      list = list.filter((q) => q.section === filters.section);
    }
  }

  return list;
}

function buildDomainOptions() {
  const domains = [
    { id: "ALL", name: "All domains" },
    ...Array.from(
      new Map(QUESTIONS.map((q) => [q.domainId, q.domain])).entries()
    ).map(([id, name]) => ({ id, name }))
  ];

  domainSelect.innerHTML = domains
    .map((d) => `<option value="${d.id}">${d.name}</option>`)
    .join("");
}

function buildSectionOptions(domainId) {
  let list = QUESTIONS;
  if (domainId && domainId !== "ALL") {
    list = list.filter((q) => q.domainId === domainId);
  }

  const present = new Set(list.map((q) => q.section));
  const ordered = SECTION_ORDER.filter((s) => present.has(s));

  const sections = ["ALL", ...ordered];

  sectionSelect.innerHTML = sections
    .map((s) => `<option value="${s}">${s === "ALL" ? "All sections" : s}</option>`)
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function formatClock(totalSec) {
  const s = Math.max(0, totalSec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function getRemainingSec(session) {
  const elapsed = Math.floor((nowMs() - session.startedAtMs) / 1000);
  return session.durationSec - elapsed;
}

function updateTimerUI(state) {
  const session = state.session;
  const remaining = getRemainingSec(session);
  timerEl.textContent = `Time left: ${formatClock(remaining)}`;

  if (remaining <= 0 && !session.completed) {
    session.completed = true;
    state.session = session;
    persistRuntimeState(state);
    stopTimer();
    showResults(state, true);
  }
}

function startTimer(state) {
  stopTimer();
  timerEl.hidden = false;
  updateTimerUI(state);
  timerInterval = setInterval(() => updateTimerUI(state), 1000);
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

  // Timed mode: use full pool and enforce 65
  if (filters.mode === "timed") {
    list = QUESTIONS;
    if (list.length !== EXAM_TOTAL_QUESTIONS) {
      throw new Error(
        `Timed mode requires exactly ${EXAM_TOTAL_QUESTIONS} questions in questions.json (currently: ${list.length}).`
      );
    }
  }

  if (list.length === 0) throw new Error("No questions match your filters.");

  const seed = `${key}::${nowMs()}`;
  const order = seededShuffle(list.map((q) => q.id), seed);

  const session = {
    version: 1,
    mode: filters.mode,
    domainId: filters.mode === "timed" ? "ALL" : filters.domainId,
    section: filters.mode === "timed" ? "ALL" : filters.section,
    seed,
    questionIds: order,
    answers: {}, // { [id]: choiceIndex }
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

function getCurrentQuestion(state) {
  const { session } = state;
  const qid = session.questionIds[session.currentIndex];
  return QMAP.get(qid);
}

function renderJumpGrid(state) {
  const { session } = state;

  jumpGrid.innerHTML = session.questionIds
    .map((qid, idx) => {
      const ans = session.answers[qid];
      const answered = ans !== undefined;

      const cls = ["jump", idx === session.currentIndex ? "current" : "", answered ? "answered" : ""];

      // REVIEW only: color green if correct, red if wrong
      if (session.mode !== "timed" && answered) {
        const q = QMAP.get(qid);
        cls.push(ans === q.answer ? "correct" : "wrong");
      }

      return `<button type="button" class="${cls.filter(Boolean).join(" ")}" data-idx="${idx}">${idx + 1}</button>`;
    })
    .join("");

  jumpGrid.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      state.session.currentIndex = Number(b.getAttribute("data-idx"));
      persistRuntimeState(state);
      renderQuiz(state);
    });
  });
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
  if (session.mode === "timed" && !session.completed) {
    timerEl.hidden = false;
    startTimer(state);
  } else {
    timerEl.hidden = true;
    stopTimer();
  }

  // Controls enable/disable
  prevBtn.disabled = idx === 0;
  nextBtn.disabled = idx === session.questionIds.length - 1;

  // Submit button logic
  submitBtn.textContent = session.mode === "timed" ? "End Exam" : "Finish";
  submitBtn.disabled = session.completed;

  // Question box
  const selected = session.answers[q.id];
  const hasAnswered = selected !== undefined;

  // Reveal logic:
  // - review: reveal after answer
  // - timed: reveal only after exam submitted
  const revealAnswers = session.mode === "timed" ? session.completed : hasAnswered;

  const choicesHtml = q.choices
    .map((c, i) => {
      let cls = "choice";
      if (selected === i) cls += " selected";

      if (revealAnswers) {
        if (i === q.answer) cls += " correct";
        if (hasAnswered && selected === i && selected !== q.answer) cls += " wrong";
      }

      const disabledAttr = session.completed ? "aria-disabled='true'" : "";
      return `<div class="${cls}" data-choice="${i}" ${disabledAttr}>${escapeHtml(c)}</div>`;
    })
    .join("");

  const feedbackHtml = revealAnswers
    ? (() => {
        const correctText = `Correct answer: ${q.choices[q.answer]}`;

        if (!hasAnswered) {
          return `
            <div class="feedback bad">
              <div class="status">Unanswered ❌</div>
              <div class="exp">${escapeHtml(correctText)}</div>
              <div class="exp">${escapeHtml(q.explanation)}</div>
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
          </div>
        `;
      })()
    : "";

  questionBox.innerHTML = `
    <div class="q-title">${escapeHtml(q.question)}</div>
    <div class="q-tags">${escapeHtml(q.domain)} • ${escapeHtml(q.section)} • ${escapeHtml(q.id)}</div>
    <div class="choices">${choicesHtml}</div>
    ${feedbackHtml}
  `;

  // Choice click handling
  questionBox.querySelectorAll(".choice").forEach((el) => {
    el.addEventListener("click", () => {
      if (session.completed) return;

      const choiceIdx = Number(el.getAttribute("data-choice"));
      session.answers[q.id] = choiceIdx;

      state.session = session;
      persistRuntimeState(state);
      renderQuiz(state);
    });
  });

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

  const s = computeScore(state);

  let html = "";
  if (session.mode === "timed") {
    html = `
      <div><strong>${autoEnded ? "Time is up." : "Exam submitted."}</strong></div>
      <div style="margin-top:8px;">
        <div><strong>Final score:</strong> ${s.points}/${s.totalPoints} ${s.passed ? "(PASSED)" : "(FAILED)"}</div>
        <div class="meta" style="margin-top:6px;">Answered: ${s.answeredTotal}/${s.totalQuestions}</div>
      </div>
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

async function init() {
  const res = await fetch("questions.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load questions.json");
  QUESTIONS = await res.json();

  QMAP = new Map(QUESTIONS.map((q) => [q.id, q]));

  // Force UI to only allow Review + Timed
  modeSelect.innerHTML = `
    <option value="review">Review</option>
    <option value="timed">Timed</option>
  `;

  // Hide section chips/buttons (user chooses only from dropdown)
  if (sectionButtons) sectionButtons.style.display = "none";

  // Basic sanity check
  if (QUESTIONS.length !== EXAM_TOTAL_QUESTIONS) {
    hintText.textContent = `Note: You currently have ${QUESTIONS.length} questions. Timed mode requires exactly ${EXAM_TOTAL_QUESTIONS}.`;
  }

  buildDomainOptions();
  buildSectionOptions("ALL");

  ensureModeRulesUI();

  // Restore last session if exists
  const existing = normalizeStateForRuntime(loadState());
  if (existing && existing.session && existing.session.questionIds && existing.session.questionIds.length) {
    const s = existing.session;
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

    quizCard.hidden = false;

    if (s.completed) {
      showResults(existing, false);
    } else {
      renderQuiz(existing);
    }
  }
}

// Events
modeSelect.addEventListener("change", () => {
  ensureModeRulesUI();
});

domainSelect.addEventListener("change", () => {
  buildSectionOptions(domainSelect.value);
});

sectionSelect.addEventListener("change", () => {
  // no-op
});

startBtn.addEventListener("click", () => {
  const filters = getFiltersFromUI();
  ensureModeRulesUI();

  try {
    let state = normalizeStateForRuntime(createNewSession(filters, false));
    renderQuiz(state);
  } catch (e) {
    alert(e.message || String(e));
  }
});

newSessionBtn.addEventListener("click", () => {
  const filters = getFiltersFromUI();
  ensureModeRulesUI();

  try {
    let state = normalizeStateForRuntime(createNewSession(filters, true));
    renderQuiz(state);
  } catch (e) {
    alert(e.message || String(e));
  }
});

resetBtn.addEventListener("click", () => {
  if (confirm("Reset will clear your saved progress (order, answers, timer). Continue?")) {
    stopTimer();
    clearState();
    location.reload();
  }
});

prevBtn.addEventListener("click", () => {
  const state = normalizeStateForRuntime(loadState());
  if (!state || !state.session) return;

  if (state.session.currentIndex > 0) {
    state.session.currentIndex -= 1;
    persistRuntimeState(state);
    renderQuiz(state);
  }
});

nextBtn.addEventListener("click", () => {
  const state = normalizeStateForRuntime(loadState());
  if (!state || !state.session) return;

  if (state.session.currentIndex < state.session.questionIds.length - 1) {
    state.session.currentIndex += 1;
    persistRuntimeState(state);
    renderQuiz(state);
  }
});

submitBtn.addEventListener("click", () => {
  const state = normalizeStateForRuntime(loadState());
  if (!state || !state.session) return;

  if (state.session.completed) return;

  if (state.session.mode === "timed") {
    if (!confirm("End exam now? (You can’t continue after submitting)")) return;
  }

  showResults(state, false);
});

// Start
init().catch((e) => {
  console.error(e);
  alert("Init error: " + (e.message || String(e)));
});
