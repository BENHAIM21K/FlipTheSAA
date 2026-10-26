// FlipTheSAA — The order a question's choices are shown in (pure: no DOM, so it can be tested in Node)
//
// WHY: the correct answer must not sit in the same place every time a person meets a question, or they can
// answer from memory of the position. Each session gets its own order per question, and a question the person
// has seen before is shown with its correct answer(s) in different position(s) than the last time.
//
// An "order" is an array: order[displayPosition] = original index into q.choices. Everything the site stores
// (answers, cross-outs, choiceExplanations keys) stays in ORIGINAL indexes, so scoring and history never change.
import { seededShuffle } from './util.js';

// Wording that points at the other choices must stay where the author put it, so it is pinned last.
const PINNED = /\b(all|none|neither) of the above\b/i;
const MAX_TRIES = 24;

export function identityOrder(q) {
  return q.choices.map((_, i) => i);
}

export function correctOf(q) {
  return Array.isArray(q.answer) ? q.answer : [q.answer];
}

/** True when `order` is a permutation of 0..n-1 (a saved order that fails this is ignored). */
export function isValidOrder(order, n) {
  return Array.isArray(order) && order.length === n && new Set(order).size === n && order.every(i => Number.isInteger(i) && i >= 0 && i < n);
}

/** The order to use for a question in a session: the saved one, or the original order for older sessions. */
export function orderFromSession(session, q) {
  const saved = session && session.choiceOrder && session.choiceOrder[q.id];
  return isValidOrder(saved, q.choices.length) ? saved : identityOrder(q);
}

/** Display positions (ascending) of the correct answer(s) under `order`. */
export function correctPositions(q, order) {
  const correct = new Set(correctOf(q));
  return order.map((orig, pos) => (correct.has(orig) ? pos : -1)).filter(p => p >= 0);
}

function sameSet(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

function sharesPosition(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.some(p => b.includes(p));
}

/**
 * WHAT IT DOES: Builds the display order of one question for one session.
 *
 * `seedStr` fixes the shuffle (the same session always rebuilds the same order). `lastPositions` is where the
 * correct answer(s) were the last time the person was shown this question; the new order puts them somewhere else.
 * For a "choose two" question the new positions share nothing with the old ones when that is possible, otherwise
 * they at least form a different pair. When no order can satisfy the rule (for example the correct choice is
 * pinned) the plain shuffle is used.
 */
export function layoutFor(q, seedStr, lastPositions) {
  const pinned = [];
  const free = [];
  q.choices.forEach((text, i) => (PINNED.test(text) ? pinned : free).push(i));

  let firstOrder = null;
  let differentPair = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const shuffled = seededShuffle(free, attempt ? `${seedStr}::try${attempt}` : seedStr);
    const order = [...shuffled, ...pinned];
    if (!firstOrder) firstOrder = order;
    if (!lastPositions || !lastPositions.length) return order;
    const positions = correctPositions(q, order);
    if (!sharesPosition(positions, lastPositions)) return order;                  // nothing in common with last time
    if (!differentPair && !sameSet(positions, lastPositions)) differentPair = order; // choose-two fallback
  }
  return differentPair || firstOrder;
}

/**
 * WHAT IT DOES: Builds the saved order for every question of a new session.
 * `lastSeen` is { [questionId]: [display positions of the correct answer(s) when last shown] }.
 */
export function layoutsForSession(questions, seed, lastSeen) {
  const out = {};
  for (const q of questions) {
    if (!q || !Array.isArray(q.choices)) continue;
    out[q.id] = layoutFor(q, `${seed}::choices::${q.id}`, lastSeen && lastSeen[q.id]);
  }
  return out;
}
