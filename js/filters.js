// FlipTheSAA — Practice setup: dropdowns, filters, session keys, mode rules
import { SECTION_FAMILIES, sectionTopic } from './config.js';
import { difficultyLabel, difficultyPanel, difficultyTrigger, domainAllCheck, domainLabel, domainPanel, domainTrigger, hintText, modeLabel, modePanel, modeTrigger, sectionAllCheck, sectionLabel, sectionPanel, sectionTrigger } from './dom.js';
import { S } from './state.js';
import { escapeHtml, normalizeMode } from './util.js';

// ============================================================================
// MULTI-SELECT DROPDOWN HELPERS
// ============================================================================

export function getSelectedValues(panel) {
  return Array.from(panel.querySelectorAll('.ms-check:not([value="ALL"]):checked'))
    .map(cb => cb.value);
}

export function updateTriggerLabel(labelEl, values, allText, singular, plural) {
  labelEl.textContent = values.length === 0 ? allText
    : values.length === 1 ? `1 ${singular} selected`
    : `${values.length} ${plural} selected`;
}

/**
 * WHAT IT DOES: Returns the practice topic of a question ("DR (Select TWO)" → "Disaster recovery")
 *
 * WHY: Filters and session keys work on topics, not on the raw `section`
 * strings. The result is cached on the question object.
 */
export function topicOf(q) {
  if (!q._topic) q._topic = sectionTopic(q.section).topic;
  return q._topic;
}

export function openDropdown(trigger, panel) {
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
}

export function closeDropdown(trigger, panel) {
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

export function closeAllDropdowns() {
  closeDropdown(modeTrigger, modePanel);
  closeDropdown(domainTrigger, domainPanel);
  closeDropdown(sectionTrigger, sectionPanel);
  closeDropdown(difficultyTrigger, difficultyPanel);
}

export const MODE_LABELS = {
  review: 'Review (instant feedback)',
  timed:  'Timed Exam (130 min, no instant feedback)'
};

export function syncModeUI() {
  modeLabel.textContent = MODE_LABELS[S.selectedMode] || S.selectedMode;
  modePanel.querySelectorAll('.ms-option').forEach(el => {
    el.classList.toggle('ms-option--selected', el.dataset.value === S.selectedMode);
  });
}

export function syncDifficultyUI() {
  difficultyLabel.textContent = S.selectedDifficulty === 'ALL' ? 'All difficulties' : S.selectedDifficulty;
  difficultyPanel.querySelectorAll('.ms-option').forEach(el => {
    el.classList.toggle('ms-option--selected', el.dataset.value === S.selectedDifficulty);
  });
}

// ============================================================================
// FILTER AND SESSION KEY FUNCTIONS - Handle quiz filtering and session identity
// ============================================================================

/**
 * WHAT IT DOES: Reads the current filter selections from the UI dropdowns
 *
 * WHY WE NEED IT: Centralizes reading UI state so we don't have to access
 * the dropdowns directly throughout the code.
 *
 * RETURNS: Object with mode, domainId, and section from dropdown values
 *
 * EXAMPLE:
 * getFiltersFromUI() → { mode: "review", domainId: "D1", section: "ALL" }
 */
export function getFiltersFromUI() {
  return {
    mode: normalizeMode(S.selectedMode),
    domainIds: [...S.selectedDomains],
    sections:  [...S.selectedSections],
    difficulty: S.selectedDifficulty
  };
}

/**
 * WHAT IT DOES: Creates a unique key string for a quiz session
 *
 * WHY WE NEED IT: We need to identify sessions uniquely so we can resume
 * the correct quiz. Different filter combinations = different sessions.
 *
 * RULES:
 * - Timed mode: Always "timed::ALL::ALL" (no filtering allowed)
 * - Review mode: "review::domainId::section" (e.g., "review::D1::EC2")
 *
 * PARAMETERS:
 * - filters: Object with mode, domainId, section
 *
 * RETURNS: String key identifying this unique session
 *
 * EXAMPLE:
 * sessionKeyFor({mode: "review", domainId: "D1", section: "IAM"})
 *   → "review::D1::IAM"
 */
/**
 * WHAT IT DOES: Returns the difficulty a saved session was started with
 *
 * WHY WE NEED IT: Sessions saved before the difficulty field existed only
 * carry it as the last part of their session key ("review::D1::ALL::Hard"),
 * so resuming one used to fall back to "All difficulties".
 */
export function sessionDifficulty(state) {
  if (!state || !state.session) return "ALL";
  if (state.session.difficulty) return state.session.difficulty;
  const fromKey = typeof state.sessionKey === "string" ? state.sessionKey.split("::")[3] : null;
  return ["Easy", "Medium", "Hard"].includes(fromKey) ? fromKey : "ALL";
}

export function sessionKeyFor(filters) {
  const mode = normalizeMode(filters.mode);

  // Timed mode sessions are identified by difficulty filter
  // (domain and section are always ALL in timed mode)
  if (mode === "timed") return `timed::ALL::ALL::${filters.difficulty || "ALL"}`;

  // Review mode sessions are identified by domain(s) + section(s) + difficulty
  const d = (filters.domainIds && filters.domainIds.length > 0) ? [...filters.domainIds].sort().join(',') : 'ALL';
  const s = (filters.sections  && filters.sections.length  > 0) ? [...filters.sections].sort().join(',')  : 'ALL';
  return `review::${d}::${s}::${filters.difficulty || "ALL"}`;
}

/**
 * WHAT IT DOES: Filters the question list based on user selections
 *
 * WHY WE NEED IT: In Review mode, users can choose to practice only
 * certain domains or sections. This returns only the matching questions.
 *
 * RULES:
 * - Timed mode: NO filtering, always all questions
 * - Review mode: Filter by domain and/or section if not "ALL"
 *
 * PARAMETERS:
 * - filters: Object with mode, domainId, section
 *
 * RETURNS: Array of question objects that match the filters
 *
 * EXAMPLE:
 * filteredQuestions({mode: "review", domainId: "D1", section: "IAM"})
 *   → [all IAM questions from Domain 1]
 */
export function filteredQuestions(filters) {
  let list = S.QUESTIONS;

  // Apply difficulty filter for both timed and review modes
  if (filters.difficulty && filters.difficulty !== "ALL") {
    list = list.filter((q) => q.difficulty === filters.difficulty);
  }

  // Review mode: Also filter by domain and section
  if (filters.mode !== "timed") {
    // Filter by domain(s) if any selected
    if (filters.domainIds && filters.domainIds.length > 0) {
      list = list.filter((q) => filters.domainIds.includes(q.domainId));
    }
    // Filter by section(s) if any selected
    if (filters.sections && filters.sections.length > 0) {
      list = list.filter((q) => filters.sections.includes(topicOf(q)));
    }
  }

  return list;
}

// ============================================================================
// UI BUILDER FUNCTIONS - Populate dropdown menus dynamically
// ============================================================================

/**
 * WHAT IT DOES: Populates the domain dropdown with all available domains
 *
 * WHY WE NEED IT: Domains are loaded from questions.json dynamically, so
 * we build the dropdown options from the actual question data instead of
 * hardcoding them.
 *
 * HOW IT WORKS:
 * 1. Extracts unique domains from all questions (D1, D2, D3, D4)
 * 2. Adds "All domains" as first option
 * 3. Generates <option> HTML for each domain
 * 4. Updates the domain dropdown
 *
 * SIDE EFFECTS: Modifies domainSelect.innerHTML
 */
export function buildDomainOptions() {
  const domains = Array.from(
    new Map(S.QUESTIONS.map((q) => [q.domainId, q.domain])).entries()
  ).map(([id, name]) => ({ id, name }));

  // Remove previously injected dynamic options (keep the "All" label)
  domainPanel.querySelectorAll('.ms-option:not(.ms-option-all)').forEach(el => el.remove());

  domains.forEach(({ id, name }) => {
    const label = document.createElement('label');
    label.className = 'ms-option';
    label.innerHTML = `<input type="checkbox" class="ms-check" value="${escapeHtml(id)}"><span>${escapeHtml(name)}</span>`;
    domainPanel.appendChild(label);
  });

  syncDomainCheckboxes();
}

export function syncDomainCheckboxes() {
  const allSelected = S.selectedDomains.length === 0;
  domainAllCheck.checked = allSelected;
  domainPanel.querySelectorAll('.ms-check:not([value="ALL"])').forEach(cb => {
    cb.checked = !allSelected && S.selectedDomains.includes(cb.value);
  });
  updateTriggerLabel(domainLabel, S.selectedDomains, 'All domains', 'domain', 'domains');
}

/**
 * WHAT IT DOES: Fills the Section dropdown with every topic in the selected
 * domains, grouped by service family, each with its question count
 *
 * WHY WE NEED IT: The old list showed 16 hand-picked sections, so most of the
 * bank (ElastiCache, Secrets Manager, CloudTrail, ...) could only be reached
 * through "All sections". Topics come from SECTION_FAMILIES in config.js.
 *
 * PARAMETERS:
 * - domainIds: Selected domain IDs ([] = all domains)
 *
 * EXAMPLE:
 * buildSectionOptions(["D1"]) → only topics that have Domain 1 questions
 */
export function buildSectionOptions(domainIds) {
  let list = S.QUESTIONS;
  if (domainIds && domainIds.length > 0) {
    list = list.filter((q) => domainIds.includes(q.domainId));
  }

  // topic → question count, for the questions in scope
  const counts = new Map();
  list.forEach(q => counts.set(topicOf(q), (counts.get(topicOf(q)) || 0) + 1));

  // Families in config order, topics by count (most questions first); unknowns go last under "Other"
  const groups = Object.entries(SECTION_FAMILIES).map(([family, topics]) => ({
    family,
    topics: Object.keys(topics).filter(t => counts.has(t)).sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))
  }));
  const known = new Set(groups.flatMap(g => g.topics));
  const other = [...counts.keys()].filter(t => !known.has(t)).sort();
  if (other.length) groups.push({ family: 'Other', topics: other });

  // Remove previously injected groups/options (keep the search box and the "All" label)
  sectionPanel.querySelectorAll('.ms-group, .ms-empty').forEach(el => el.remove());

  groups.filter(g => g.topics.length).forEach(({ family, topics }) => {
    const group = document.createElement('div');
    group.className = 'ms-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', family);
    group.innerHTML = `<div class="ms-group-title">${escapeHtml(family)}</div>` + topics.map(t => `
      <label class="ms-option" data-search="${escapeHtml(t.toLowerCase())} ${escapeHtml(family.toLowerCase())}">
        <input type="checkbox" class="ms-check" value="${escapeHtml(t)}">
        <span class="ms-option-text">${escapeHtml(t)}</span>
        <span class="ms-count num">${counts.get(t)}</span>
      </label>`).join('');
    sectionPanel.appendChild(group);
  });

  const empty = document.createElement('p');
  empty.className = 'ms-empty';
  empty.hidden = true;
  empty.textContent = 'No topic matches that search.';
  sectionPanel.appendChild(empty);

  // Keep any search the user typed applied to the rebuilt list
  filterSectionOptions();

  // Prune S.selectedSections to only those still available
  S.selectedSections = S.selectedSections.filter(s => counts.has(s));
  syncSectionCheckboxes();
}

/**
 * WHAT IT DOES: Applies the Section dropdown's search box: hides topics (and
 * whole families) that don't match the typed text
 */
export function filterSectionOptions() {
  const input = document.getElementById('sectionSearch');
  const query = input ? input.value.trim().toLowerCase() : '';
  let shown = 0;

  sectionPanel.querySelectorAll('.ms-group').forEach(group => {
    let groupShown = 0;
    group.querySelectorAll('.ms-option').forEach(opt => {
      const match = !query || opt.dataset.search.includes(query);
      opt.hidden = !match;
      if (match) groupShown++;
    });
    group.hidden = groupShown === 0;
    shown += groupShown;
  });

  const empty = sectionPanel.querySelector('.ms-empty');
  if (empty) empty.hidden = shown > 0;
}

export function syncSectionCheckboxes() {
  const allSelected = S.selectedSections.length === 0;
  sectionAllCheck.checked = allSelected;
  sectionPanel.querySelectorAll('.ms-check:not([value="ALL"])').forEach(cb => {
    cb.checked = !allSelected && S.selectedSections.includes(cb.value);
  });
  // Name up to two topics on the trigger; past that, count them
  const n = S.selectedSections.length;
  sectionLabel.textContent = n === 0 ? 'All sections'
    : n <= 2 ? S.selectedSections.join(', ')
    : `${n} topics selected`;
}

/**
 * WHAT IT DOES: Populates the difficulty dropdown based on available difficulties
 * in the current domain/section filter
 *
 * WHY WE NEED IT: Shows only relevant difficulties for the selected domain/section,
 * similar to how sections update based on domain
 *
 * HOW IT WORKS:
 * 1. Filter questions by current domain and section selections
 * 2. Extract unique difficulty values from filtered questions
 * 3. Order them as Easy, Medium, Hard
 * 4. Add "All difficulties" as first option
 * 5. Populate the difficulty dropdown
 *
 * PARAMETERS:
 * - domainId: Current domain filter ("ALL" or "D1"-"D4")
 * - section: Current section filter ("ALL" or section name)
 */
export function buildDifficultyOptions(domainIds, sections) {
  let list = S.QUESTIONS;

  if (domainIds && domainIds.length > 0) {
    list = list.filter((q) => domainIds.includes(q.domainId));
  }

  if (sections && sections.length > 0) {
    list = list.filter((q) => sections.includes(topicOf(q)));
  }

  // Get unique difficulties from the filtered questions
  const present = new Set(
    list.map((q) => q.difficulty).filter(d => d)
  );

  // Order: Easy, Medium, Hard
  const ordered = ["Easy", "Medium", "Hard"].filter(d => present.has(d));

  // Add "ALL" as first option
  const difficulties = ["ALL", ...ordered];

  // Rebuild panel options
  difficultyPanel.innerHTML = '';
  difficulties.forEach(d => {
    const div = document.createElement('div');
    div.className = 'ms-option' + (d === S.selectedDifficulty ? ' ms-option--selected' : '');
    div.dataset.value = d;
    div.setAttribute('role', 'option');
    div.tabIndex = 0;
    div.textContent = d === "ALL" ? "All difficulties" : d;
    difficultyPanel.appendChild(div);
  });

  // If current S.selectedDifficulty is no longer available, reset to ALL
  if (!difficulties.includes(S.selectedDifficulty)) {
    S.selectedDifficulty = 'ALL';
  }
  syncDifficultyUI();
}

export function ensureModeRulesUI() {
  const mode = normalizeMode(S.selectedMode);

  if (mode === "timed") {
    // Reset selections to "all" and disable widgets
    S.selectedDomains = [];
    S.selectedSections = [];
    syncDomainCheckboxes();
    syncSectionCheckboxes();
    domainTrigger.disabled = true;
    sectionTrigger.disabled = true;
    difficultyTrigger.disabled = false;

    hintText.textContent =
      "Timed mode: random 65 questions from all domains and sections. Filter by difficulty if desired. Finish the exam to see results.";
  } else {
    // Review mode: all filters enabled
    domainTrigger.disabled = false;
    sectionTrigger.disabled = false;
    difficultyTrigger.disabled = false;
    buildSectionOptions(S.selectedDomains);
    buildDifficultyOptions(S.selectedDomains, S.selectedSections);

    hintText.textContent =
      "Review mode: filter by domain, section, and difficulty. Question order and answers persist on refresh.";
  }
}
