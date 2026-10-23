// FlipTheSAA — Home tab
import { isMultiAnswer } from './answers.js';
import { DOMAIN_WEIGHTS, PASSING_SCORE } from './config.js';
import { getDomainPerformance, getSessionHistory } from './history.js';
import { S } from './state.js';
import { loadState } from './storage.js';
import { escapeHtml, fetchJson, icon, safeOperation } from './util.js';

// ============================================================================
// HOME - Readiness, resume, what's inside, and one live question
// ============================================================================

// Tab id → the name shown in the top bar (and the list of valid tabs)
export const TAB_LABELS = {
  home: 'Home',
  practice: 'Practice',
  performance: 'Performance',
  studygroups: 'Study groups',
  resources: 'Resources',
  contact: 'Contact'
};


/**
 * WHAT IT DOES: Renders every block of the Home screen
 */
export function renderHome() {
  safeOperation('Render Home', () => {
    renderHomeCounts();
    renderReadiness();
    renderResume();
    if (!S.tryQuestionId) renderTryQuestion();
  }, undefined);
}

/**
 * WHAT IT DOES: Fills the "what's inside" strip with counts read from the data files
 *
 * WHY: The numbers on Home must match the data, so they are counted, never typed in.
 */
export async function renderHomeCounts() {
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  if (S.QUESTIONS.length) {
    setText('insideQuestions', S.QUESTIONS.length.toLocaleString('en-US'));
    const byDomain = {};
    S.QUESTIONS.forEach(q => { byDomain[q.domainId] = (byDomain[q.domainId] || 0) + 1; });
    const breakdown = Object.keys(byDomain).sort().map(d => `${d} ${byDomain[d]}`).join(' · ');
    setText('insideQuestionsSub', breakdown);
  }

  try {
    if (!S.studyGroupsCache) S.studyGroupsCache = await fetchJson('studygroups.json');
    const cohorts = S.studyGroupsCache.studyGroups || [];
    const recorded = cohorts.reduce((sum, c) =>
      sum + (c.lessons || []).filter(l => l.recording && l.recording.url).length, 0);
    const cohortsEl = document.getElementById('insideCohorts');
    if (cohortsEl) cohortsEl.innerHTML = `${cohorts.length} <small>cohort${cohorts.length === 1 ? '' : 's'}</small>`;
    setText('insideCohortsSub', `${recorded} recorded lessons, with slides and quizzes`);
  } catch (e) {
    console.warn('[SAA Warning] Could not count study groups', e);
  }

  try {
    if (!S.resourcesCache) S.resourcesCache = await fetchJson('resources.json');
    const servicesEl = document.getElementById('insideServices');
    if (servicesEl) servicesEl.innerHTML = `${(S.resourcesCache.cheatsheet || []).length} <small>services</small>`;
  } catch (e) {
    console.warn('[SAA Warning] Could not count cheat sheet services', e);
  }
}

/**
 * WHAT IT DOES: Builds "the 720 line": a 0–1000 track with the pass tick,
 * a grey dot for each earlier session and an accent dot for the latest
 */
export function scoreTrackHtml(pastPoints, latestPoints) {
  const pct = (p) => Math.max(0, Math.min(100, p / 10));
  const pass = pct(PASSING_SCORE);
  const dots = pastPoints.map(p => `<span class="score-dot" style="left:${pct(p)}%"></span>`).join('');
  const latest = latestPoints == null ? '' : `<span class="score-dot latest" style="left:${pct(latestPoints)}%"></span>`;
  const label = latestPoints == null
    ? `Score scale from 0 to 1000. The pass mark is ${PASSING_SCORE}.`
    : `Latest score ${latestPoints} of 1000. The pass mark is ${PASSING_SCORE}.`;

  return `
    <div class="score-track" role="img" aria-label="${label}">
      <span class="pass-zone" style="left:${pass}%"></span>
      <span class="pass-tick" style="left:${pass}%"></span>
      ${dots}${latest}
    </div>
    <div class="score-scale" aria-hidden="true">
      <span class="scale-min">0</span>
      <span class="scale-pass" style="left:${pass}%">Pass ${PASSING_SCORE}</span>
      <span class="scale-max">1000</span>
    </div>`;
}

/**
 * WHAT IT DOES: Lists the four exam domains with their weight and your accuracy
 *
 * WHY: Next to the score, it says where the points are and where you lose them.
 * With no history yet, the weights alone are still worth knowing.
 */
export function domainWeightsHtml(history) {
  const perf = history.sessions && history.sessions.length ? getDomainPerformance(history) : {};
  const names = {};
  S.QUESTIONS.forEach(q => { if (!names[q.domainId]) names[q.domainId] = q.domain; });

  const rows = Object.keys(DOMAIN_WEIGHTS).map(id => {
    const shortName = String(names[id] || id).replace(/^Design\s+/i, '').replace(/\s+Architectures$/i, '');
    const p = perf[id];
    const yours = p && p.total ? `${Math.round(p.percentage)}%` : '<span class="muted-dash">—</span>';
    return `<div class="ready-domain"><span>${escapeHtml(id)} · ${escapeHtml(shortName)}</span><span class="num">${DOMAIN_WEIGHTS[id]}%</span><span class="num">${yours}</span></div>`;
  }).join('');

  return `
    <div class="ready-domains">
      <div class="ready-domain ready-domain-head"><span>Exam domain</span><span>Weight</span><span>You</span></div>
      ${rows}
    </div>`;
}

/**
 * WHAT IT DOES: Shows the latest score against the pass mark, or how to get one
 */
export function renderReadiness() {
  const el = document.getElementById('homeReadiness');
  if (!el) return;

  const history = getSessionHistory();
  // Scores only: mistake drills aren't scored like exams (see renderPerformanceDashboard)
  const sessions = (history.sessions || []).filter(s => !s.drill);

  if (sessions.length === 0) {
    el.innerHTML = `
      <p class="ready-finding">No score yet. Finish a timed mock to see where you stand against the ${PASSING_SCORE} pass mark.</p>
      ${scoreTrackHtml([], null)}
      <button class="btn" type="button" data-goto="practice" data-mode="timed">Start a timed mock</button>
      ${domainWeightsHtml(history)}`;
    return;
  }

  const recent = sessions.slice(-10);
  const latest = recent[recent.length - 1];
  const gap = latest.points - PASSING_SCORE;
  const findingCls = gap >= 0 ? 'is-positive' : 'is-negative';
  const finding = gap >= 0
    ? `${gap} points above the pass mark.`
    : `${-gap} points below the pass mark.`;

  el.innerHTML = `
    <div class="ready-figure">
      <span class="ready-score num">${latest.points}</span>
      <span class="ready-of">/ 1000 · latest ${latest.mode === 'timed' ? 'timed mock' : 'review session'}</span>
    </div>
    ${scoreTrackHtml(recent.slice(0, -1).map(s => s.points), latest.points)}
    <p class="ready-finding ${findingCls}">${finding}</p>
    <button class="btn" type="button" data-goto="performance">Open performance</button>
    ${domainWeightsHtml(history)}`;
}

/**
 * WHAT IT DOES: Offers to resume an unfinished session, if there is one
 */
export function renderResume() {
  const el = document.getElementById('homeResume');
  if (!el) return;

  const saved = loadState();
  const s = saved && saved.session;
  if (!s || s.completed || !Array.isArray(s.questionIds) || !s.questionIds.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }

  const answered = Object.keys(s.answers || {}).length;
  el.innerHTML = `
    <span class="resume-label">In progress</span>
    <span class="resume-text">${s.mode === 'timed' ? 'Timed mock' : 'Review session'} · ${answered} of ${s.questionIds.length} answered</span>
    <button class="btn" type="button" data-goto="practice">Resume ${icon('arrow-right')}</button>`;
  el.hidden = false;
}

/**
 * WHAT IT DOES: Shows one random single-answer question from the bank on Home
 *
 * WHY: The quickest way to show what the practice is like is to let the visitor
 * answer a real question. It does not count toward history.
 */
export function renderTryQuestion() {
  const box = document.getElementById('tryQuestion');
  if (!box || !S.QUESTIONS.length) return;

  const pool = S.QUESTIONS.filter(q => !isMultiAnswer(q) && Array.isArray(q.choices) && q.choices.length);
  if (!pool.length) return;

  let q = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && q.id === S.tryQuestionId) {
    q = pool[(pool.indexOf(q) + 1) % pool.length];
  }
  S.tryQuestionId = q.id;

  const choices = q.choices.map((c, i) => `
    <button type="button" class="choice try-choice" data-i="${i}">
      <span class="choice-key" aria-hidden="true">${String.fromCharCode(65 + i)}</span>
      <span class="choice-text">${escapeHtml(c)}</span>
    </button>`).join('');

  box.innerHTML = `
    <div class="try-meta">
      <span class="qid">${escapeHtml(q.id)}</span>
      <span>${escapeHtml(q.domain)}</span>
      ${q.difficulty ? `<span>${escapeHtml(q.difficulty)}</span>` : ''}
    </div>
    <p class="try-stem">${escapeHtml(q.question)}</p>
    <div class="try-choices">${choices}</div>
    <div class="try-result" id="tryResult" aria-live="polite"></div>`;
}

/**
 * WHAT IT DOES: Marks the visitor's pick on the Home question and shows the explanation
 */
export function answerTryQuestion(choiceBtn) {
  const box = document.getElementById('tryQuestion');
  const q = S.QMAP.get(S.tryQuestionId);
  if (!box || !q) return;

  const picked = Number(choiceBtn.dataset.i);
  const isCorrect = picked === q.answer;

  box.querySelectorAll('.try-choice').forEach(btn => {
    const i = Number(btn.dataset.i);
    btn.disabled = true;
    btn.classList.add('disabled');
    if (i === q.answer) btn.classList.add('correct');
    else if (i === picked) btn.classList.add('wrong');
  });

  const status = isCorrect
    ? `${icon('circle-check')} Correct`
    : `${icon('circle-x')} Not quite. The answer is ${String.fromCharCode(65 + q.answer)}.`;

  document.getElementById('tryResult').innerHTML = `
    <div class="feedback ${isCorrect ? 'good' : 'bad'}">
      <div class="status">${status}</div>
      <div class="exp">${escapeHtml(q.explanation)}</div>
    </div>
    <div class="try-actions">
      <button class="btn btn-primary" type="button" data-goto="practice">Practice more questions</button>
    </div>`;
}
