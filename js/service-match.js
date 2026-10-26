// FlipTheSAA — Which questions are about a cheat-sheet service (pure: no DOM, so it can be tested in Node)

/** A stem this short is about its subject ("When would you use Amazon MQ?"); a long scenario only mentions services in passing */
export const STEM_MAX_CHARS = 130;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * WHAT IT DOES: The names a question may use for a cheat-sheet service
 *
 * An entry's optional `match` list REPLACES its service name when the plain name is wrong for matching:
 * too generic ("Config", "RAM"), or not what questions say ("Amazon Quick" for QuickSight, "Snowball" for Snow Family).
 */
export function serviceNames(entry) {
  const names = Array.isArray(entry.match) && entry.match.length ? entry.match : [entry.service];
  return names.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());
}

/** Every place a service name occurs in `text`: [{ service, start, end }]. Whole words only, and case matters ("RAM" is not "ram"). */
function spansIn(text, matchers) {
  const spans = [];
  for (const { service, re } of matchers) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length;
      spans.push({ service, start, end: start + m[2].length });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return spans;
}

/**
 * WHAT IT DOES: The set of services a piece of text is about
 *
 * A name inside a longer service name does not count: in "Amazon ECS Anywhere" the text is about ECS Anywhere, not ECS;
 * in "Kinesis Data Firehose" about Data Firehose, not Kinesis.
 */
function servicesIn(text, matchers) {
  const spans = spansIn(text, matchers);
  const kept = spans.filter((a) => !spans.some((b) => b.service !== a.service && b.start <= a.start && b.end >= a.end && b.end - b.start > a.end - a.start));
  return new Set(kept.map((s) => s.service));
}

/**
 * WHAT IT DOES: For each cheat-sheet service, the ids of the questions about it
 *
 * A question is about a service when the service is named in a CORRECT answer, or in a short stem. A service that
 * only shows up as a wrong choice does not count.
 *
 * PARAMETERS:
 * - entries: resources.json → cheatsheet
 * - questions: the question bank
 *
 * RETURNS: Map<service name, question id[]> with an entry for every service (an empty list when nothing matches)
 */
export function questionsByService(entries, questions) {
  const matchers = [];
  for (const entry of entries) {
    for (const name of serviceNames(entry)) {
      matchers.push({ service: entry.service, re: new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(name)})(?![A-Za-z0-9])`, 'g') });
    }
  }
  const index = new Map(entries.map((e) => [e.service, []]));
  for (const q of questions) {
    const correct = (Array.isArray(q.answer) ? q.answer : [q.answer]).map((i) => q.choices[i]).filter(Boolean);
    const texts = q.question.length <= STEM_MAX_CHARS ? [q.question, ...correct] : correct;
    const found = new Set();
    for (const text of texts) for (const service of servicesIn(text, matchers)) found.add(service);
    for (const service of found) index.get(service).push(q.id);
  }
  return index;
}
