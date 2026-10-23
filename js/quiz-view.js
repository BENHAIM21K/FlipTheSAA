// FlipTheSAA — Rendering the question, the question map and the results
import { isChoiceSelected, isCorrectAnswer, isMultiAnswer } from './answers.js';
import { PASSING_SCORE } from './config.js';
import { jumpGrid, metaText, nextBtn, prevBtn, progressText, questionBox, quizCard, resultBox, scoreMini, submitBtn, timerEl } from './dom.js';
import { computeScore, ensureTimer, getCurrentQuestion, persistRuntimeState, setPauseButton, stopTimer, toggleFlag, updateTimerUI } from './exam.js';
import { recordSessionToHistory } from './history.js';
import { canShare } from './share.js';
import { S } from './state.js';
import { escapeHtml, icon } from './util.js';

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
export function renderJumpGrid(state) {
  const { session } = state;

  // Ensure flaggedQuestions exists (backward compatibility)
  const flagged = Array.isArray(session.flaggedQuestions) ? session.flaggedQuestions : [];

  // Check if paused for disabling jump buttons
  const isPaused = S.quizPausedState !== null;

  // Map filter: which questions to show. The options depend on the mode.
  const filters = mapFiltersFor(session);
  if (!filters.some(f => f.id === S.mapFilter)) S.mapFilter = 'all';
  const statusOf = (qid) => questionStatus(session, qid, flagged);
  const matches = (qid) => filters.find(f => f.id === S.mapFilter).test(statusOf(qid));

  renderMapFilter(session, filters, statusOf);

  let shown = 0;
  jumpGrid.innerHTML = session.questionIds
    .map((qid, idx) => {
      const ans = session.answers[qid];
      const answered = isAnswered(ans);
      const isFlagged = flagged.includes(qid);
      const visible = matches(qid);
      if (visible) shown++;

      const cls = ["jump", idx === session.currentIndex ? "current" : "", answered ? "answered" : ""];

      // Add flagged class for styling
      if (isFlagged) {
        cls.push("flagged");
      }

      // REVIEW only: color green if correct, red if wrong (only after checking or completing)
      if (session.mode !== "timed" && answered) {
        const isQuestionChecked = session.checkedQuestions?.has(qid);
        const shouldReveal = session.completed || isQuestionChecked;

        if (shouldReveal) {
          const q = S.QMAP.get(qid);
          cls.push(isCorrectAnswer(ans, q.answer) ? "correct" : "wrong");
        }
      }

      // Add flag icon for flagged questions in Timed mode
      const flagBadge = (session.mode === "timed" && isFlagged) ? `<span class="flag-badge">${icon("flag")}</span>` : '';

      // Disable button if paused
      const disabled = isPaused ? 'disabled' : '';

      // Accessible name: "Question 12, answered, flagged"
      const label = [`Question ${idx + 1}`, answered ? "answered" : "unanswered", isFlagged ? "flagged" : ""]
        .filter(Boolean).join(", ");
      const current = idx === session.currentIndex ? 'aria-current="true"' : '';

      return `<button type="button" ${disabled} ${current} ${visible ? '' : 'hidden'} class="${cls.filter(Boolean).join(" ")}" data-idx="${idx}" aria-label="${label}">${idx + 1}${flagBadge}</button>`;
    })
    .join("");

  // Empty filter: say so, in the frame of the map
  const empty = document.getElementById('mapEmpty');
  if (empty) {
    const active = filters.find(f => f.id === S.mapFilter);
    empty.hidden = shown > 0;
    empty.textContent = shown > 0 ? '' : active.empty;
  }

  renderMapLegend(session);

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
      closeMapSheet();  // phone: picking a question closes the sheet
      renderQuiz(state);
    }
  };

  // Attach listener and save reference for cleanup
  jumpGrid.addEventListener("click", clickListener);
  jumpGrid._clickListener = clickListener;
}

/**
 * WHAT IT DOES: True when a question has an answer (a multi-answer question
 * with every choice deselected counts as unanswered)
 */
export function isAnswered(ans) {
  return ans !== undefined && !(Array.isArray(ans) && ans.length === 0);
}

/**
 * WHAT IT DOES: Summarises one question for the map filter
 */
function questionStatus(session, qid, flagged) {
  const ans = session.answers[qid];
  const answered = isAnswered(ans);
  const revealed = session.completed || (session.mode !== 'timed' && session.checkedQuestions?.has(qid));
  const q = S.QMAP.get(qid);
  return {
    answered,
    flagged: flagged.includes(qid),
    incorrect: revealed && (!answered || !isCorrectAnswer(ans, q.answer))
  };
}

/**
 * WHAT IT DOES: The map filters that make sense for this session
 *
 * - Timed, running: All / Unanswered / Flagged (the real exam's review screen)
 * - Review, or any finished session: All / Unanswered / Incorrect (+ Flagged if timed)
 */
function mapFiltersFor(session) {
  const all = { id: 'all', label: 'All', test: () => true, empty: '' };
  const unanswered = { id: 'unanswered', label: 'Unanswered', test: s => !s.answered, empty: 'Every question has an answer.' };
  const flaggedF = { id: 'flagged', label: 'Flagged', test: s => s.flagged, empty: 'No questions flagged for review.' };
  const incorrect = { id: 'incorrect', label: 'Incorrect', test: s => s.incorrect, empty: session.completed ? 'No incorrect answers.' : 'No incorrect answers among the questions you checked.' };

  if (session.mode === 'timed') return session.completed ? [all, incorrect, flaggedF] : [all, unanswered, flaggedF];
  return [all, unanswered, incorrect];
}

/**
 * WHAT IT DOES: Draws the filter buttons above the map, each with its count
 */
function renderMapFilter(session, filters, statusOf) {
  const el = document.getElementById('mapFilter');
  if (!el) return;
  const statuses = session.questionIds.map(statusOf);
  el.innerHTML = filters.map(f => {
    const count = statuses.filter(f.test).length;
    const pressed = f.id === S.mapFilter;
    return `<button type="button" class="map-filter-btn${pressed ? ' active' : ''}" data-map-filter="${f.id}" aria-pressed="${pressed}">${f.label} <span class="num">${count}</span></button>`;
  }).join('');
}

/**
 * WHAT IT DOES: A one-line key to the map's marks for the current mode
 */
function renderMapLegend(session) {
  const el = document.getElementById('mapLegend');
  if (!el) return;
  const item = (cls, text) => `<span class="legend-item"><span class="legend-swatch ${cls}"></span>${text}</span>`;
  const items = [item('is-current', 'Current'), item('is-answered', 'Answered')];
  if (session.mode === 'timed' && !session.completed) {
    items.push(`<span class="legend-item"><span class="legend-flag">${icon('flag')}</span>Flagged</span>`);
  } else {
    items.push(item('is-correct', 'Correct'), item('is-wrong', 'Incorrect'));
  }
  el.innerHTML = items.join('');
}

/**
 * WHAT IT DOES: The timed exam's review step before submitting, like the real
 * exam's review screen: says what's unanswered and flagged, and offers to go
 * back to those questions before submitting
 *
 * RETURNS: Promise of "submit" | "flagged" | "unanswered" | "cancel"
 */
export function submitReviewDialog(session) {
  const total = session.questionIds.length;
  const flagged = (session.flaggedQuestions || []).length;
  const unanswered = session.questionIds.filter(id => !isAnswered(session.answers[id])).length;

  const dialog = document.getElementById('submitDialog');
  if (!dialog || typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(`Submit the exam? ${unanswered} unanswered, ${flagged} flagged.`) ? 'submit' : 'cancel');
  }

  const facts = [`You've answered ${total - unanswered} of ${total} questions.`];
  if (unanswered) facts.push(`${unanswered} ${unanswered === 1 ? 'is' : 'are'} unanswered.`);
  if (flagged) facts.push(`${flagged} ${flagged === 1 ? 'is' : 'are'} flagged for review.`);
  facts.push("After you submit you can't change any answers.");
  document.getElementById('submitBody').textContent = facts.join(' ');

  const flaggedBtn = document.getElementById('submitReviewFlagged');
  flaggedBtn.hidden = flagged === 0;
  flaggedBtn.innerHTML = `${icon('flag')} Review flagged <span class="num">${flagged}</span>`;
  const unansweredBtn = document.getElementById('submitReviewUnanswered');
  unansweredBtn.hidden = unanswered === 0;
  unansweredBtn.innerHTML = `${icon('circle-minus')} Review unanswered <span class="num">${unanswered}</span>`;
  document.getElementById('submitReview').hidden = flagged === 0 && unanswered === 0;

  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue || 'cancel'), { once: true });
  });
}

/**
 * WHAT IT DOES: Filters the map to "flagged" or "unanswered" and jumps to the
 * first such question (used by the review step before submitting)
 */
export function reviewQuestions(state, filter) {
  const { session } = state;
  const flagged = Array.isArray(session.flaggedQuestions) ? session.flaggedQuestions : [];
  const wanted = (qid) => filter === 'flagged' ? flagged.includes(qid) : !isAnswered(session.answers[qid]);
  const first = session.questionIds.findIndex(wanted);

  S.mapFilter = filter;
  if (first >= 0) session.currentIndex = first;
  persistRuntimeState(state);
  if (window.matchMedia('(max-width: 960px)').matches) openMapSheet();  // phones: the map is a sheet
  renderQuiz(state);
}

/**
 * WHAT IT DOES: Opens / closes the question map as a bottom sheet (phones only;
 * on wider screens the map is always visible in the side panel)
 */
export function openMapSheet() {
  document.getElementById('wsMap')?.classList.add('open');
  document.getElementById('wsBackdrop').hidden = false;
  document.getElementById('mapToggleBtn')?.setAttribute('aria-expanded', 'true');
}

export function closeMapSheet() {
  const map = document.getElementById('wsMap');
  if (!map || !map.classList.contains('open')) return;
  map.classList.remove('open');
  document.getElementById('wsBackdrop').hidden = true;
  document.getElementById('mapToggleBtn')?.setAttribute('aria-expanded', 'false');
}

/**
 * WHAT IT DOES: Folds the setup panel into a one-line summary while a session
 * runs ("Timed exam · 65 questions · All difficulties   Change")
 */
function syncSetupPanel(session) {
  const summary = document.getElementById('setupSummary');
  const body = document.getElementById('setupBody');
  const changeBtn = document.getElementById('setupChangeBtn');
  if (!summary || !body) return;

  // Finished session: show the full setup so the next one can start; running: fold unless opened
  const collapsed = !session.completed && !S.setupExpanded;
  summary.hidden = session.completed;
  body.hidden = collapsed;
  changeBtn.textContent = collapsed ? 'Change' : 'Hide';
  changeBtn.setAttribute('aria-expanded', String(!collapsed));

  const parts = [session.mode === 'timed' ? 'Timed exam' : session.drill ? 'Mistake drill' : 'Review'];
  parts.push(`${session.questionIds.length} questions`);
  if (session.mode !== 'timed') {
    if (session.domainIds && session.domainIds.length) parts.push(session.domainIds.join(', '));
    if (session.sections && session.sections.length) {
      parts.push(session.sections.length <= 2 ? session.sections.join(', ') : `${session.sections.length} topics`);
    }
  }
  const diff = session.difficulty || 'ALL';
  parts.push(diff === 'ALL' ? 'All difficulties' : diff);
  document.getElementById('setupSummaryText').textContent = parts.join(' · ');
}

export function renderQuiz(state) {
  quizCard.hidden = false;

  // Only hide results during an active (not completed) session
  if (!state.session.completed) resultBox.hidden = true;

  const { session } = state;
  const q = getCurrentQuestion(state);
  const idx = session.currentIndex;

  progressText.textContent = `Question ${idx + 1} of ${session.questionIds.length} · ${session.mode === "timed" ? "Timed exam" : "Review"}`;

  metaText.textContent = ''; // Tags removed to increase difficulty

  // Score mini: REVIEW -> only show Answered; TIMED -> show Answered; show Final only when completed
  const s = computeScore(state);
  if (session.mode === "timed") {
    scoreMini.textContent = session.completed
      ? `Final ${s.points} / ${s.totalPoints} · ${s.passed ? "Passed" : "Below 720"}`
      : `${s.answeredTotal} of ${s.totalQuestions} answered`;
  } else {
    scoreMini.textContent = session.completed
      ? `Final ${s.points} / 1000 · ${s.passed ? "Passed" : "Below 720"}`
      : `${s.answeredTotal} of ${s.totalQuestions} checked`;
  }

  // Timer: running, frozen while paused, or hidden outside an unfinished timed exam
  const timedInProgress = session.mode === "timed" && !session.completed;
  if (timedInProgress && S.quizPausedState === null) {
    ensureTimer(state);  // starts once per session; later renders just hand it the latest state
  } else if (timedInProgress) {
    stopTimer();
    timerEl.hidden = false;
    updateTimerUI(state);  // shows the frozen time, labelled "Paused"
  } else {
    timerEl.hidden = true;
    stopTimer();
  }

  // Pause / Resume button: always visible during an unfinished timed exam, and its
  // label is set here from the real pause state so it can never say the opposite
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.hidden = !timedInProgress;
    if (timedInProgress) setPauseButton(S.quizPausedState !== null);
  }

  // Check if paused
  const isPaused = S.quizPausedState !== null;

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
  submitBtn.textContent = session.mode === "timed" ? "End exam" : "Finish";

  // Setup panel folds to one line while the session runs
  syncSetupPanel(session);

  // Question box
  const selected = session.answers[q.id];
  const hasAnswered = selected !== undefined;
  const isMulti = isMultiAnswer(q);

  // Reveal logic:
  // - timed: reveal only after exam submitted
  // - review: reveal after clicking "Check Answer" OR after completing entire review
  const revealAnswers = session.mode === "timed"
    ? session.completed
    : (session.completed || session.checkedQuestions?.has(q.id));

  const isPausedForChoices = S.quizPausedState !== null;
  const isChecked = session.mode !== "timed" && session.checkedQuestions?.has(q.id);
  const isDisabled = isPausedForChoices || isChecked;

  // Crossing out: rule a choice out without selecting it (saved per question).
  // Only while the question is still open; once answers are revealed it steps aside.
  const canStrike = !revealAnswers && !isDisabled && !session.completed;
  const eliminated = new Set((session.eliminated && session.eliminated[q.id]) || []);

  const choicesHtml = q.choices
    .map((c, i) => {
      let cls = "choice";
      const isOut = !revealAnswers && eliminated.has(i);

      // Check if this choice is selected (works for both single and multi-answer)
      if (isChoiceSelected(selected, i)) cls += " selected";
      if (isOut) cls += " eliminated";

      if (revealAnswers) {
        // Mark correct answers (may be multiple)
        if (isMulti) {
          if (q.answer.includes(i)) cls += " correct";
          if (hasAnswered && isChoiceSelected(selected, i) && !q.answer.includes(i)) cls += " wrong";
        } else {
          if (i === q.answer) cls += " correct";
          if (hasAnswered && selected === i && selected !== q.answer) cls += " wrong";
        }
      }

      // Add disabled class when paused OR checked
      if (isDisabled) cls += " disabled";

      // Add aria-disabled for accessibility
      const ariaDisabled = (session.completed || isDisabled) ? "aria-disabled='true'" : "";
      const pressed = isChoiceSelected(selected, i) ? "true" : "false";
      const key = String.fromCharCode(65 + i); // A, B, C, D, E

      const choiceHtml = `<div class="${cls}" data-choice="${i}" role="button" tabindex="${isDisabled ? -1 : 0}" aria-pressed="${pressed}" ${ariaDisabled}><span class="choice-key" aria-hidden="true">${key}</span><span class="choice-text">${escapeHtml(c)}${isOut ? '<span class="visually-hidden"> (crossed out)</span>' : ''}</span></div>`;
      const strikeHtml = canStrike
        ? `<button type="button" class="choice-strike${isOut ? ' active' : ''}" data-strike="${i}" aria-pressed="${isOut}" aria-label="${isOut ? 'Restore' : 'Cross out'} choice ${key}" title="${isOut ? 'Restore this choice' : 'Cross out this choice (or right-click it)'}">${icon('strikethrough')}</button>`
        : '';
      return `<div class="choice-row">${choiceHtml}${strikeHtml}</div>`;
    })
    .join("");

  // Check Answer button (review mode only)
  let checkButtonHtml = '';
  if (session.mode !== "timed") {
    const isChecked = session.checkedQuestions?.has(q.id);
    const canCheck = hasAnswered && !isChecked && !session.completed;

    checkButtonHtml = `
      <button
        id="checkAnswerBtn"
        class="check-answer-btn ${canCheck ? '' : 'disabled'}"
        ${!canCheck ? 'disabled' : ''}
      >
        ${isChecked ? `${icon("check")} Checked` : 'Check answer'}
      </button>
    `;
  }

  const feedbackHtml = revealAnswers
    ? (() => {
        const correctLabel = isMultiAnswer(q) ? "Correct answers:" : "Correct answer:";
        const correctValue = isMultiAnswer(q)
          ? q.answer.map(idx => q.choices[idx]).join(', ')
          : q.choices[q.answer];
        const correctLine = `<div class="exp"><span class="exp-label">${correctLabel}</span> ${escapeHtml(correctValue)}</div>`;

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
              <div class="status">${icon("circle-minus")} Unanswered</div>
              ${correctLine}
              <div class="exp">${escapeHtml(q.explanation)}</div>
              ${enhancedHtml}
            </div>
          `;
        }

        const isCorrect = isCorrectAnswer(selected, q.answer);
        const boxCls = `feedback ${isCorrect ? "good" : "bad"}`;
        const yourLabel = Array.isArray(selected) ? "Your answers:" : "Your answer:";
        const yourValue = Array.isArray(selected)
          ? selected.map(idx => q.choices[idx]).join(', ')
          : q.choices[selected];

        // Build choice explanations HTML for wrong answers
        let choiceExplanationsHtml = '';
        if (q.choiceExplanations) {
          const wrongChoices = [];
          Object.entries(q.choiceExplanations).forEach(([idx, explanation]) => {
            wrongChoices.push(`
              <div class="choice-exp">
                <strong>${escapeHtml(q.choices[idx])}:</strong> ${escapeHtml(explanation)}
              </div>
            `);
          });

          if (wrongChoices.length > 0) {
            choiceExplanationsHtml = `
              <div class="choice-explanations">
                <div class="choice-exp-title">Why other answers are incorrect:</div>
                ${wrongChoices.join('')}
              </div>
            `;
          }
        }

        return `
          <div class="${boxCls}">
            <div class="status">${isCorrect ? `${icon("circle-check")} Correct` : `${icon("circle-x")} Incorrect`}</div>
            <div class="exp"><span class="exp-label">${yourLabel}</span> ${escapeHtml(yourValue)}</div>
            ${correctLine}
            <div class="exp">${escapeHtml(q.explanation)}</div>
            ${choiceExplanationsHtml}
            ${enhancedHtml}
          </div>
        `;
      })()
    : "";

  // Flag button HTML (Timed mode only, hidden when completed)
  const flagged = Array.isArray(session.flaggedQuestions) && session.flaggedQuestions.includes(q.id);
  const isPausedForFlag = S.quizPausedState !== null;
  const disabledAttr = isPausedForFlag ? 'disabled' : '';
  const flagBtnHtml = (session.mode === "timed" && !session.completed)
    ? `<button id="flagBtn" type="button" class="btn btn-flag ${flagged ? 'flagged' : ''}" aria-pressed="${flagged}" ${disabledAttr}>
         ${icon("flag", "flag-icon")} ${flagged ? 'Flagged for review' : 'Flag for review'}
       </button>`
    : '';

  // "Choose two" questions: say how many are picked, so a third click doing nothing makes sense
  let multiHintHtml = '';
  if (isMulti && !revealAnswers) {
    const required = q.answer.length;
    const picked = Array.isArray(selected) ? selected.length : 0;
    multiHintHtml = `<p class="q-hint" aria-live="polite">Choose ${required}. <span class="num">${picked} of ${required}</span> selected${picked === required ? '. Click one again to change it.' : '.'}</p>`;
  }

  questionBox.innerHTML = `
    <div class="q-title">${escapeHtml(q.question)}</div>
    <div class="q-tags">${escapeHtml(q.domain)} · <span class="qid">${escapeHtml(q.id)}</span></div>
    ${multiHintHtml}
    ${flagBtnHtml}
    <div class="choices">${choicesHtml}</div>
    ${checkButtonHtml}
    ${feedbackHtml}
  `;

  // ✅ Event delegation: One listener on questionBox for all interactive elements
  // Remove old listener first to prevent duplicates
  const oldQuestionBoxListener = questionBox._questionBoxListener;
  if (oldQuestionBoxListener) {
    questionBox.removeEventListener("click", oldQuestionBoxListener);
  }

  // Cross out / restore a choice: saved in session.eliminated = { [questionId]: [choiceIndex, ...] }
  const toggleEliminated = (choiceIdx) => {
    if (!canStrike) return;
    if (!session.eliminated) session.eliminated = {};
    const out = new Set(session.eliminated[q.id] || []);
    if (out.has(choiceIdx)) out.delete(choiceIdx); else out.add(choiceIdx);
    if (out.size) session.eliminated[q.id] = [...out].sort(); else delete session.eliminated[q.id];
    state.session = session;
    persistRuntimeState(state);
    renderQuiz(state);
  };

  const questionBoxListener = (e) => {
    // Handle cross-out button clicks
    const strikeBtn = e.target.closest(".choice-strike");
    if (strikeBtn) {
      toggleEliminated(Number(strikeBtn.dataset.strike));
      return;
    }

    // Handle flag button clicks
    if (e.target.closest("#flagBtn")) {
      // Don't allow flagging when paused
      if (S.quizPausedState !== null) return;
      toggleFlag(state);
      return;
    }

    // Handle Check Answer button clicks (review mode only)
    if (e.target.closest("#checkAnswerBtn")) {
      // Only allow if answered and not already checked
      if (!hasAnswered || session.checkedQuestions?.has(q.id)) return;

      // Mark as checked
      if (!session.checkedQuestions) {
        session.checkedQuestions = new Set();
      }
      session.checkedQuestions.add(q.id);

      // Save and re-render to show feedback
      state.session = session;
      persistRuntimeState(state);
      renderQuiz(state);
      return;
    }

    // Handle choice clicks
    if (session.completed || S.quizPausedState !== null || isChecked) return;

    const choice = e.target.closest(".choice");
    if (!choice) return;

    const choiceIdx = Number(choice.getAttribute("data-choice"));
    if (!isNaN(choiceIdx)) {
      const isMulti = isMultiAnswer(q);
      const requiredCount = isMulti ? q.answer.length : 1;

      // Choosing a crossed-out choice restores it
      if (session.eliminated && Array.isArray(session.eliminated[q.id]) && session.eliminated[q.id].includes(choiceIdx)) {
        session.eliminated[q.id] = session.eliminated[q.id].filter(i => i !== choiceIdx);
        if (!session.eliminated[q.id].length) delete session.eliminated[q.id];
      }

      if (isMulti) {
        // Multi-answer: toggle selection
        let currentSelection = session.answers[q.id];

        // Initialize as empty array if not set
        if (!Array.isArray(currentSelection)) {
          currentSelection = [];
        }

        // Check if already selected
        const alreadySelected = currentSelection.includes(choiceIdx);

        if (alreadySelected) {
          // Deselect: remove from array
          currentSelection = currentSelection.filter(idx => idx !== choiceIdx);
        } else {
          // Select: add to array (only if under limit)
          if (currentSelection.length < requiredCount) {
            currentSelection = [...currentSelection, choiceIdx];
          } else {
            // Already at max selections, do nothing (ignore click)
            return;
          }
        }

        // Deselecting everything leaves the question unanswered, not answered-and-wrong
        if (currentSelection.length) session.answers[q.id] = currentSelection;
        else delete session.answers[q.id];
      } else {
        // Single-answer: overwrite selection (existing behavior)
        session.answers[q.id] = choiceIdx;
      }

      state.session = session;
      persistRuntimeState(state);
      renderQuiz(state);
    }
  };

  questionBox.addEventListener("click", questionBoxListener);
  questionBox._questionBoxListener = questionBoxListener;

  // Right-click a choice to cross it out (desktop shortcut for the strike button)
  const oldContextListener = questionBox._contextListener;
  if (oldContextListener) {
    questionBox.removeEventListener("contextmenu", oldContextListener);
  }
  const contextListener = (e) => {
    const choice = e.target.closest(".choice");
    if (!choice || !canStrike) return;
    e.preventDefault();
    toggleEliminated(Number(choice.dataset.choice));
  };
  questionBox.addEventListener("contextmenu", contextListener);
  questionBox._contextListener = contextListener;

  renderJumpGrid(state);
}

export function buildTimedReviewHtml(state) {
  const { session } = state;

  return session.questionIds
    .map((qid, idx) => {
      const q = S.QMAP.get(qid);
      const ans = session.answers[qid];

      const statusPill =
        ans === undefined
          ? '<span class="pill pill-neutral">Unanswered</span>'
          : isCorrectAnswer(ans, q.answer)
            ? '<span class="pill pill-positive">Correct</span>'
            : '<span class="pill pill-negative">Incorrect</span>';

      const yourAnswer = ans === undefined
        ? "—"
        : Array.isArray(ans)
          ? ans.map(idx => q.choices[idx]).join(', ')
          : q.choices[ans];

      const correctAnswer = isMultiAnswer(q)
        ? q.answer.map(idx => q.choices[idx]).join(', ')
        : q.choices[q.answer];

      // Build choice explanations HTML
      let choiceExpsHtml = '';
      if (q.choiceExplanations) {
        const wrongChoices = Object.entries(q.choiceExplanations)
          .map(([idx, exp]) => {
            const choiceText = q.choices[idx];
            return `<div><strong>${escapeHtml(choiceText)}:</strong> ${escapeHtml(exp)}</div>`;
          })
          .join('');

        if (wrongChoices) {
          choiceExpsHtml = `
            <div class="review-why">
              <div class="review-why-title">Why the other answers are wrong</div>
              ${wrongChoices}
            </div>
          `;
        }
      }

      return `
        <details class="review-item">
          <summary>
            <span class="review-num">Q${idx + 1}</span>
            <span class="review-section">${escapeHtml(q.section)}</span>
            ${statusPill}
          </summary>
          <div class="review-body">
            <div class="review-q">${escapeHtml(q.question)}</div>
            <div class="review-line"><span class="exp-label">Your answer:</span> ${escapeHtml(yourAnswer)}</div>
            <div class="review-line"><span class="exp-label">Correct answer:</span> ${escapeHtml(correctAnswer)}</div>
            <div class="review-line">${escapeHtml(q.explanation)}</div>
            ${choiceExpsHtml}
          </div>
        </details>
      `;
    })
    .join("");
}

export function showResults(state, autoEnded) {
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
      ? `<div class="result-flagged">
           <div class="result-flagged-title">${icon("flag")} You flagged ${flagged.length} question${flagged.length === 1 ? '' : 's'} for review</div>
           <div class="result-flagged-list">${flagged.map(qid => {
             const idx = session.questionIds.indexOf(qid) + 1;
             return `<span>Q${idx}</span>`;
           }).join('')}</div>
         </div>`
      : '';

    const gap = s.points - PASSING_SCORE;
    html = `
      <div class="result-head">
        <div class="result-kicker">${autoEnded ? "Time is up. The exam was submitted automatically." : "Exam submitted."}</div>
        <div class="result-score">
          <span class="num">${s.points}</span><span class="result-of">/ ${s.totalPoints}</span>
          ${s.passed ? '<span class="pill pill-positive">Passed</span>' : '<span class="pill pill-negative">Below 720</span>'}
        </div>
        <div class="result-meta">${gap >= 0 ? `${gap} points above` : `${-gap} points below`} the 720 pass mark · ${s.answeredTotal} of ${s.totalQuestions} answered</div>
        ${canShare(session, s) ? `<div class="result-actions"><button class="btn btn-primary" type="button" data-share="${s.points}">${icon("share")} Share your pass</button></div>` : ''}
      </div>
      ${flaggedHtml}
      <h3 class="result-review-title">Review every question</h3>
      ${buildTimedReviewHtml(state)}
    `;
  } else {
    html = `
      <div class="result-head">
        <div class="result-kicker">Session finished.</div>
        <div class="result-score">
          <span class="num">${s.points}</span><span class="result-of">/ 1000</span>
          ${s.passed ? '<span class="pill pill-positive">Passed</span>' : '<span class="pill pill-negative">Below 720</span>'}
        </div>
        <div class="result-meta">${s.correctTotal} of ${s.totalQuestions} correct · ${s.answeredTotal} of ${s.totalQuestions} answered</div>
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
