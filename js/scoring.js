// FlipTheSAA — Point values for the scored questions of a timed exam (pure: no DOM, so it can be tested in Node)
//
// A timed exam has 65 questions; 15 are unscored and the other 50 share exactly 1000 points. The 50 are not worth
// the same: every question is worth more or less than the average (20) depending on how demanding it is.
// The values are computed from the exam's own questions (nothing is stored on a question), so the same exam
// always gives the same values, and they always add up to the total.
import { POINT_CLAMP, SCORE_FEATURES, TIMED_TOTAL_POINTS } from './config.js';

const tokenSet = (text) => new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) || []);

/** How alike the choices are (0 = nothing in common, 1 = identical). Look-alike options make a question harder. */
export function lookAlike(choices) {
  const sets = choices.map(tokenSet);
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const inter = [...sets[i]].filter(w => sets[j].has(w)).length;
      const union = new Set([...sets[i], ...sets[j]]).size;
      sum += union ? inter / union : 0;
      pairs++;
    }
  }
  return pairs ? sum / pairs : 0;
}

export function features(q) {
  return {
    stem: Math.max(1, String(q.question).length),
    choices: Math.max(1, q.choices.reduce((n, c) => n + String(c).length, 0)),
    look: lookAlike(q.choices),
    multi: Array.isArray(q.answer) ? 1 : 0
  };
}

/**
 * Rounds fractional shares to whole numbers that add up to exactly `total` (largest remainder first).
 * Ties are broken by question id, so the result does not depend on the order the questions are listed in.
 */
function roundToTotal(shares, total, ids) {
  const floors = shares.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const frac = (s) => Math.round((s - Math.floor(s)) * 1e9) / 1e9;
  const order = shares.map((s, i) => [frac(s), String(ids[i])]).map((x, i) => [...x, i])
    .sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  for (let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k][2]] += 1;
  return floors;
}

/**
 * WHAT IT DOES: Returns Map(questionId -> whole points) for the scored questions of one exam.
 * The values add up to exactly `total` (1000). A question that is longer than the exam's average, has longer or
 * more look-alike options, or needs two answers is worth more; a short plain one is worth less. Each question's raw
 * weight is kept within POINT_CLAMP of the average, so no single question decides the exam (roughly 12-36 points).
 */
export function examPoints(questions, total = TIMED_TOTAL_POINTS) {
  const n = questions.length;
  const result = new Map();
  if (!n) return result;

  const f = questions.map(features);
  const mean = (key) => f.reduce((s, x) => s + x[key], 0) / n;
  const meanStem = mean('stem');
  const meanChoices = mean('choices');
  const meanLook = mean('look');

  const raw = f.map(x => {
    const r = 1
      + SCORE_FEATURES.stem * Math.log(x.stem / meanStem)
      + SCORE_FEATURES.choices * Math.log(x.choices / meanChoices)
      + SCORE_FEATURES.lookalike * (x.look - meanLook)
      + SCORE_FEATURES.multi * x.multi;
    return Math.min(POINT_CLAMP.max, Math.max(POINT_CLAMP.min, r));
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  const points = roundToTotal(raw.map(r => (total * r) / sum), total, questions.map(q => q.id));
  questions.forEach((q, i) => result.set(q.id, points[i]));
  return result;
}
