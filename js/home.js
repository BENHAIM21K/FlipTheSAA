// FlipTheSAA — Home tab
import { isMultiAnswer } from './answers.js';
import { correctPositions, layoutFor } from './choice-order.js';
import { DOMAIN_WEIGHTS, PASSING_SCORE } from './config.js';
import { getDomainPerformance, getSessionHistory } from './history.js';
import { S } from './state.js';
import { loadChoiceLayouts, loadState, recordShownLayout } from './storage.js';
import { embedUrl, thumbnailUrl } from './study-groups.js';
import { escapeHtml, fetchJson, icon, safeOperation, safeUrl } from './util.js';

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
  }

  try {
    if (!S.studyGroupsCache) S.studyGroupsCache = await fetchJson('studygroups.json');
    renderHomeStudyGroups();
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
 * WHAT IT DOES: Finds the newest recorded lesson: the highest-numbered lesson with a
 * recording, in the highest-numbered cohort that has one. Null when nothing is recorded.
 */
function latestRecordedLesson(cohorts) {
  const withRecording = (c) => (c.lessons || []).filter(l => l.recording && l.recording.url);
  const cohort = [...cohorts].sort((a, b) => b.number - a.number).find(c => withRecording(c).length);
  if (!cohort) return null;
  const lesson = withRecording(cohort).sort((a, b) => b.number - a.number)[0];
  return { cohort, lesson };
}

/**
 * WHAT IT DOES: Fills the Home "Study groups" card: the newest recording with its
 * still frame, and buttons that open it or the whole list
 *
 * WHY: Recordings are the course's main value, so Home asks the visitor to watch one.
 * The still frame is only an image: the video loads when they press Play in the theater.
 */
export function renderHomeStudyGroups() {
  const box = document.getElementById('homeStudyGroups');
  if (!box || !S.studyGroupsCache) return;

  const latest = latestRecordedLesson(S.studyGroupsCache.studyGroups || []);
  if (!latest) {
    box.innerHTML = `
      <p class="home-sg-pitch">Recordings from our study groups are added as lessons run.</p>
      <div class="home-sg-actions"><button class="btn" type="button" data-goto="studygroups">View study groups ${icon('arrow-right')}</button></div>`;
    return;
  }

  const { cohort, lesson } = latest;
  const thumb = thumbnailUrl(embedUrl(safeUrl(lesson.recording.url)));
  const target = `${cohort.number}:${lesson.number}`;
  box.innerHTML = `
    <p class="home-sg-pitch">Watch past study-group recordings to help you master the exam.</p>
    <div class="home-sg-latest">
      <button class="home-sg-thumb${thumb ? ' has-thumb' : ''}" type="button" data-goto="studygroups" data-sg-lesson="${escapeHtml(target)}" aria-label="Watch lesson ${escapeHtml(lesson.number)}: ${escapeHtml(lesson.topic || 'recording')}">
        ${thumb ? `<img class="home-sg-thumb-img" src="${escapeHtml(thumb)}" alt="" decoding="async" loading="lazy" referrerpolicy="no-referrer" />` : ''}
        <svg class="home-sg-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6v14.8a1 1 0 0 0 1.52.85l12.1-7.4a1 1 0 0 0 0-1.7L8.52 3.75A1 1 0 0 0 7 4.6z" fill="currentColor"/></svg>
      </button>
      <div class="home-sg-text">
        <span class="home-sg-label">Latest lesson</span>
        <span class="home-sg-lesson" dir="auto">Lesson ${escapeHtml(lesson.number)}${lesson.topic ? ` · ${escapeHtml(lesson.topic)}` : ''}</span>
        <span class="home-sg-meta">${escapeHtml(cohort.name)}${lesson.date ? ` · ${escapeHtml(lesson.date)}` : ''}</span>
      </div>
    </div>
    <div class="home-sg-actions">
      <button class="btn btn-primary" type="button" data-goto="studygroups" data-sg-lesson="${escapeHtml(target)}">Watch the latest lesson</button>
      <button class="btn btn-quiet" type="button" data-goto="studygroups">Browse all recordings ${icon('arrow-right')}</button>
    </div>`;

  // Some recordings have no thumbnail (Drive answers 404): keep the plain tile with the play mark
  const img = box.querySelector('.home-sg-thumb-img');
  img?.addEventListener('load', () => img.classList.add('is-loaded'));
  img?.addEventListener('error', () => {
    img.remove();
    box.querySelector('.home-sg-thumb')?.classList.remove('has-thumb');
  });
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
    const p = perf[id];
    const yours = p && p.total ? `${Math.round(p.percentage)}%` : '<span class="muted-dash">—</span>';
    return `<div class="ready-domain"><span>${escapeHtml(id)} · ${escapeHtml(names[id] || id)}</span><span class="num">${DOMAIN_WEIGHTS[id]}%</span><span class="num">${yours}</span></div>`;
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

  // Same rule as in a session: a question seen before shows its correct answer somewhere else
  S.tryOrder = layoutFor(q, `try::${Date.now()}::${q.id}`, loadChoiceLayouts()[q.id]);
  recordShownLayout(q.id, correctPositions(q, S.tryOrder));

  const choices = S.tryOrder.map((i, pos) => `
    <button type="button" class="choice try-choice" data-i="${i}">
      <span class="choice-key" aria-hidden="true">${String.fromCharCode(65 + pos)}</span>
      <span class="choice-text">${escapeHtml(q.choices[i])}</span>
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
    : `${icon('circle-x')} Not quite. The answer is ${String.fromCharCode(65 + (S.tryOrder ? S.tryOrder.indexOf(q.answer) : q.answer))}.`;

  document.getElementById('tryResult').innerHTML = `
    <div class="feedback ${isCorrect ? 'good' : 'bad'}">
      <div class="status">${status}</div>
      <div class="exp">${escapeHtml(q.explanation)}</div>
    </div>
    <div class="try-actions">
      <button class="btn btn-primary" type="button" data-goto="practice">Practice more questions</button>
    </div>`;
}
