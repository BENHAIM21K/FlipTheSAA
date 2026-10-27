// FlipTheSAA — Performance tab
import { DOMAIN_WEIGHTS, PASSING_SCORE } from './config.js';
import { analyzeWeakAreas, getDomainPerformance, getDrillQuestions, getScoreTrend, getSessionHistory, hasAnsweredQuestions } from './history.js';
import { S } from './state.js';
import { escapeHtml, icon, safeOperation } from './util.js';

// ============================================================================
// PERFORMANCE DASHBOARD UI - Visualization and rendering
// ============================================================================

/**
 * WHAT IT DOES: Renders the performance dashboard with all statistics and visualizations
 *
 * WHY WE NEED IT: Displays comprehensive analytics including summary stats,
 * the mistake drill, the score trend, domain readiness and the weak-areas list.
 *
 * HOW IT WORKS:
 * 1. Load session history from localStorage
 * 2. Calculate summary statistics
 * 3. Offer the mistake drill
 * 4. Draw the score trend chart
 * 5. Render domain readiness
 * 6. Display weak areas list
 */
export function renderPerformanceDashboard() {
  safeOperation('Render Performance Dashboard', () => {
    const history = getSessionHistory();

    // If no history, show empty state
    const emptyState = document.getElementById('perfEmptyState');
    const perfContent = document.getElementById('perfContent');
    if (!history.sessions || history.sessions.length === 0) {
      if (emptyState) emptyState.style.display = '';
      if (perfContent) perfContent.style.display = 'none';
      console.info('[SAA Info] Performance dashboard shown (empty state)');
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    if (perfContent) perfContent.style.display = '';

    // Score figures leave out mistake drills: a drill is your hardest questions on
    // purpose, so scoring it like an exam would punish practising weak spots.
    // Its answers still count for domain accuracy, most-missed and the drill itself.
    const scored = history.sessions.filter(s => !s.drill);
    const totalAttempts = scored.length;
    const avgScore = totalAttempts ? Math.round(scored.reduce((sum, s) => sum + s.points, 0) / totalAttempts) : null;
    const passRate = totalAttempts ? Math.round((scored.filter(s => s.passed).length / totalAttempts) * 100) : null;

    // Calculate improvement trend (compare last 3 to first 3)
    let improvement = 0;
    if (totalAttempts >= 4) {
      const firstThree = scored.slice(0, 3);
      const lastThree = scored.slice(-3);
      const firstAvg = firstThree.reduce((sum, s) => sum + s.points, 0) / 3;
      const lastAvg = lastThree.reduce((sum, s) => sum + s.points, 0) / 3;
      improvement = Math.round(lastAvg - firstAvg);
    }

    // Update summary stats (a dash when there's nothing scored yet)
    document.getElementById('totalAttempts').textContent = totalAttempts;
    document.getElementById('avgScore').textContent = avgScore === null ? '—' : avgScore;
    document.getElementById('passRate').textContent = passRate === null ? '—' : `${passRate}%`;

    // Fewer than 4 attempts: there is nothing to compare yet, so show a dash
    const improvementEl = document.getElementById('improvement');
    improvementEl.classList.remove('is-positive', 'is-negative');
    if (totalAttempts < 4) {
      improvementEl.textContent = '—';
    } else {
      improvementEl.textContent = improvement > 0 ? `+${improvement}` : improvement < 0 ? `−${-improvement}` : '0';
      if (improvement > 0) improvementEl.classList.add('is-positive');
      if (improvement < 0) improvementEl.classList.add('is-negative');
    }

    renderDrillStrip(history);
    renderScoreTrend(history);
    renderDomainBars(history);
    renderWeakAreas(history);

    console.info('[SAA Info] Performance dashboard rendered successfully');
  }, undefined);
}

// ============================================================================
// MISTAKE DRILL - the questions you last answered wrong
// ============================================================================

/**
 * WHAT IT DOES: Shows how many open mistakes there are, with the button that
 * starts the drill (the click is handled in main.js via [data-drill])
 */
function renderDrillStrip(history) {
  const el = document.getElementById('drillStrip');
  if (!el) return;

  if (!hasAnsweredQuestions(history)) {
    el.hidden = true;
    return;
  }
  el.hidden = false;

  const mistakes = getDrillQuestions(history);
  if (!mistakes.length) {
    el.innerHTML = `
      <div class="drill-text">
        <p class="drill-title">No open mistakes</p>
        <p class="drill-sub">Every question you've answered wrong, you've since answered right.</p>
      </div>`;
    return;
  }

  const shown = Math.min(mistakes.length, 50);
  const repeat = mistakes.filter(m => m.missCount > 1).length;
  el.innerHTML = `
    <div class="drill-text">
      <p class="drill-title"><span class="num">${mistakes.length}</span> question${mistakes.length === 1 ? '' : 's'} you last answered wrong</p>
      <p class="drill-sub">${repeat ? `${repeat} of them missed more than once. ` : ''}The drill puts the most-missed first${mistakes.length > 50 ? `, ${shown} at a time` : ''}. Get one right and it leaves the drill.</p>
    </div>
    <button class="btn btn-primary" type="button" data-drill>${icon('target')} Drill my mistakes</button>`;
}

// ============================================================================
// DOMAIN READINESS - accuracy against each domain's share of the exam
// ============================================================================

/**
 * WHAT IT DOES: One row per exam domain: its share of the exam, accuracy on
 * answered questions as a bar, a tick at the 72% pass ratio, and the finding
 * (the domain where the most points are being lost) above the rows
 */
export function renderDomainBars(history) {
  const domainPerf = getDomainPerformance(history);
  const domainBarsEl = document.getElementById('domainBars');
  const findingEl = document.getElementById('domainFinding');
  const passPct = PASSING_SCORE / 10;
  const names = {};
  S.QUESTIONS.forEach(q => { if (!names[q.domainId]) names[q.domainId] = q.domain; });
  const domainName = (id) => String(names[id] || id);

  // Biggest weighted gap below the pass ratio = where the most points are lost
  let focus = null;
  Object.keys(DOMAIN_WEIGHTS).forEach(id => {
    const p = domainPerf[id];
    if (!p || !p.total) return;
    const gap = Math.max(0, passPct - p.percentage) * DOMAIN_WEIGHTS[id];
    if (gap > 0 && (!focus || gap > focus.gap)) focus = { id, gap, pct: Math.round(p.percentage) };
  });
  if (findingEl) {
    const answeredAny = Object.values(domainPerf).some(p => p.total);
    findingEl.textContent = !answeredAny ? ''
      : focus ? `Focus on ${focus.id} ${domainName(focus.id)}: it's ${DOMAIN_WEIGHTS[focus.id]}% of the exam and you're at ${focus.pct}%, ${passPct - focus.pct} points under the 72% pass ratio.`
      : 'Every domain you have answered is at or above the 72% pass ratio.';
  }

  domainBarsEl.innerHTML = Object.keys(DOMAIN_WEIGHTS).map(id => {
    const p = domainPerf[id];
    const has = p && p.total > 0;
    const pct = has ? Math.round(p.percentage) : 0;
    const below = has && pct < passPct;
    const stat = has
      ? `<strong>${pct}%</strong> · ${p.correct} of ${p.total}${below ? ` <span class="below-pass">${icon('triangle-alert')}below 72%</span>` : ''}`
      : '<span class="muted-dash">No answers yet</span>';
    return `
      <div class="domain-bar">
        <div class="domain-bar-header">
          <div class="domain-bar-name">${escapeHtml(id)} · ${escapeHtml(domainName(id))} <span class="domain-weight">${DOMAIN_WEIGHTS[id]}% of the exam</span></div>
          <div class="domain-bar-stat">${stat}</div>
        </div>
        <div class="domain-bar-track" role="img" aria-label="${escapeHtml(id)}: ${has ? `${pct}% correct` : 'no answers yet'}, pass ratio 72%">
          <div class="domain-bar-fill" style="width: ${pct}%;"></div>
          <span class="domain-bar-tick" style="left: ${passPct}%;"></span>
        </div>
      </div>`;
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
export function renderWeakAreas(history) {
  const weakAreas = analyzeWeakAreas(history, 10);
  const weakAreasEl = document.getElementById('weakAreas');

  if (weakAreas.length === 0) {
    weakAreasEl.innerHTML = '<p class="perf-empty-line">No question has been missed more than once yet.</p>';
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
          <div class="weak-item-id"><span class="qid">${escapeHtml(question.id)}</span><span>${escapeHtml(question.section)}</span><span>${escapeHtml(question.domainId)}</span></div>
          <div class="weak-item-q">${escapeHtml(question.question)}</div>
        </div>
        <div class="weak-item-stats">
          <span>${area.attempts} attempt${area.attempts === 1 ? '' : 's'}</span>
          <span class="weak-item-badge">${area.missCount} missed · ${missRate}%</span>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// SCORE TREND - SVG line chart (dataviz skill: one 2px series, markers >= 8px
// with a 2px surface ring, hairline solid grid, crosshair + tooltip, table view)
// ============================================================================

const TREND_MAX = 20;          // sessions shown
const SVG_NS = 'http://www.w3.org/2000/svg';
let trendPoints = [];          // the points on screen (only this module changes it)
let trendObserver = null;

const fmtDate = (ms, withYear) => new Date(ms).toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
const modeName = (p) => p.mode === 'timed' ? 'Timed mock' : p.drill ? 'Mistake drill' : 'Review session';

/**
 * WHAT IT DOES: Draws the last 20 sessions as a line on the 0–1000 scale with
 * the 720 pass line; timed mocks are filled dots, review sessions hollow rings
 * (shape, not colour, tells them apart). Redraws itself when its width changes.
 */
export function renderScoreTrend(history) {
  const el = document.getElementById('scoreTrend');
  const meta = document.getElementById('trendMeta');
  if (!el) return;

  trendPoints = getScoreTrend(history).slice(-TREND_MAX);
  if (meta) meta.textContent = trendPoints.length > 1 ? `last ${trendPoints.length} sessions, oldest to newest` : '';

  if (!trendPoints.length) {
    el.innerHTML = '<p class="perf-empty-line">No scored sessions yet.</p>';
    return;
  }

  el.innerHTML = `
    <div class="trend-legend" id="trendLegend"></div>
    <div class="trend-plot" id="trendPlot"></div>
    <details class="chart-table">
      <summary>Show as a table</summary>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Date</th><th scope="col">Session</th><th scope="col" class="num">Score</th><th scope="col">Result</th></tr></thead>
        <tbody id="trendTableBody"></tbody>
      </table></div>
    </details>`;

  // Legend: only the marks that are on the chart, each drawn as the mark itself
  const modes = new Set(trendPoints.map(p => p.mode));
  const legend = [];
  if (modes.has('timed')) legend.push('<span class="legend-item"><svg class="legend-mark" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" class="tr-dot is-timed"/></svg>Timed mock</span>');
  if (modes.has('review')) legend.push('<span class="legend-item"><svg class="legend-mark" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" class="tr-dot is-review"/></svg>Review session</span>');
  legend.push('<span class="legend-item"><svg class="legend-mark legend-line" viewBox="0 0 18 12" aria-hidden="true"><line x1="0" y1="6" x2="18" y2="6" class="tr-pass"/></svg>Pass mark 720</span>');
  document.getElementById('trendLegend').innerHTML = legend.join('');

  // Table view: every value without hovering (built with textContent: data, not markup)
  const body = document.getElementById('trendTableBody');
  [...trendPoints].reverse().forEach(p => {
    const tr = document.createElement('tr');
    [fmtDate(p.date, true), modeName(p), String(p.score), p.passed ? 'Passed' : `Below 720 by ${PASSING_SCORE - p.score}`].forEach((text, i) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (i === 2) td.className = 'num';
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });

  drawTrend();

  // Redraw on resize (the chart is measured, not stretched)
  if (!trendObserver && 'ResizeObserver' in window) {
    let lastWidth = 0;
    let frame = 0;
    trendObserver = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (!w || w === lastWidth) return;
      lastWidth = w;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(drawTrend);
    });
    trendObserver.observe(el);
  }
}

function svgEl(name, attrs, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function drawTrend() {
  const plot = document.getElementById('trendPlot');
  if (!plot || !trendPoints.length) return;
  const width = plot.clientWidth;
  if (!width) return;   // hidden tab: drawn when it is shown

  const n = trendPoints.length;
  const narrow = width < 520;
  const H = narrow ? 200 : 240;
  const pad = { l: 40, r: 44, t: 14, b: 28 };
  const pw = width - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const x = (i) => pad.l + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = (v) => pad.t + ph * (1 - v / 1000);

  plot.innerHTML = '';
  const svg = svgEl('svg', { width, height: H, viewBox: `0 0 ${width} ${H}`, class: 'tr-svg', tabindex: '0', role: 'img',
    'aria-label': `Score trend: ${n} session${n === 1 ? '' : 's'}, latest ${trendPoints[n - 1].score} of 1000. Use the left and right arrow keys to read each session.` }, plot);

  // Grid: 5 hairlines with round ticks; 0 is the baseline
  [0, 250, 500, 750, 1000].forEach(v => {
    svgEl('line', { x1: pad.l, x2: pad.l + pw, y1: y(v), y2: y(v), class: v === 0 ? 'tr-base' : 'tr-grid' }, svg);
    const t = svgEl('text', { x: pad.l - 8, y: y(v) + 4, class: 'tr-tick', 'text-anchor': 'end' }, svg);
    t.textContent = v === 1000 ? '1K' : String(v);
  });

  // The pass line, labelled at its left end (the right end holds the latest score)
  svgEl('line', { x1: pad.l, x2: pad.l + pw, y1: y(PASSING_SCORE), y2: y(PASSING_SCORE), class: 'tr-pass' }, svg);
  const passLabel = svgEl('text', { x: pad.l + 6, y: y(PASSING_SCORE) - 6, class: 'tr-pass-label' }, svg);
  passLabel.textContent = 'Pass 720';

  // X labels: up to 5 evenly spaced dates, first and last pulled inside
  const ticks = n <= 5 ? [...Array(n).keys()] : [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((3 * (n - 1)) / 4), n - 1];
  [...new Set(ticks)].forEach(i => {
    const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    const t = svgEl('text', { x: x(i), y: H - 8, class: 'tr-tick', 'text-anchor': anchor }, svg);
    t.textContent = fmtDate(trendPoints[i].date);
  });

  // The line (2px, round joins), then the markers on top
  if (n > 1) {
    svgEl('polyline', { points: trendPoints.map((p, i) => `${x(i)},${y(p.score)}`).join(' '), class: 'tr-line' }, svg);
  }
  trendPoints.forEach((p, i) => {
    svgEl('circle', { cx: x(i), cy: y(p.score), r: p.mode === 'timed' ? 4.5 : 4, class: `tr-dot ${p.mode === 'timed' ? 'is-timed' : 'is-review'}` }, svg);
  });

  // Direct label: the latest score, at the line's end
  const last = trendPoints[n - 1];
  const end = svgEl('text', { x: x(n - 1) + 10, y: y(last.score) + 4, class: 'tr-end' }, svg);
  end.textContent = String(last.score);

  // Hover / focus layer: a crosshair that snaps to the nearest session
  const cross = svgEl('line', { y1: pad.t, y2: pad.t + ph, class: 'tr-cross', visibility: 'hidden' }, svg);
  const halo = svgEl('circle', { r: 7, class: 'tr-halo', visibility: 'hidden' }, svg);
  const hit = svgEl('rect', { x: pad.l - 12, y: 0, width: pw + 24, height: H, fill: 'transparent' }, svg);

  let tip = plot.querySelector('.tr-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tr-tip'; tip.hidden = true; plot.appendChild(tip); }
  plot.style.position = 'relative';

  let active = -1;
  const show = (i) => {
    active = Math.max(0, Math.min(n - 1, i));
    const p = trendPoints[active];
    const px = x(active), py = y(p.score);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    halo.setAttribute('cx', px); halo.setAttribute('cy', py); halo.setAttribute('visibility', 'visible');

    // Value leads, labels follow (textContent: data, not markup)
    tip.replaceChildren();
    const v = document.createElement('div'); v.className = 'tr-tip-value'; v.textContent = `${p.score} / 1000`;
    const l1 = document.createElement('div'); l1.textContent = `${modeName(p)} · ${fmtDate(p.date, true)}`;
    const l2 = document.createElement('div'); l2.className = 'tr-tip-result';
    l2.textContent = p.passed ? 'Passed' : `Below 720 by ${PASSING_SCORE - p.score}`;
    tip.append(v, l1, l2);
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const left = Math.min(Math.max(px - tw / 2, 0), width - tw);
    const top = py - tip.offsetHeight - 14 < 0 ? py + 14 : py - tip.offsetHeight - 14;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => {
    active = -1;
    cross.setAttribute('visibility', 'hidden');
    halo.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  const nearest = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const mx = clientX - rect.left;
    let best = 0;
    trendPoints.forEach((_, i) => { if (Math.abs(x(i) - mx) < Math.abs(x(best) - mx)) best = i; });
    return best;
  };

  hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(n - 1));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      show((active < 0 ? n - 1 : active) + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'Escape') {
      hide();
    }
  });
}
