// FlipTheSAA — Resources tab: comparisons, cheat sheet (cards + drawer), links
import { serviceTopic } from './config.js';
import { topicOf } from './filters.js';
import { S } from './state.js';
import { escapeHtml, fetchJson, icon, safeUrl } from './util.js';

// ============================================================================
// RESOURCES TAB
// ============================================================================


export async function renderResources() {
  if (S.resourcesCache) {
    renderExternalLinks(S.resourcesCache.externalLinks || []);
    renderCheatSheet(S.resourcesCache.cheatsheet || []);
    renderComparisons(S.resourcesCache.comparisons || []);
    updateResourcesToc();
    return;
  }
  try {
    S.resourcesCache = await fetchJson('resources.json');
  } catch (e) {
    console.warn('[SAA Warning] Could not load resources.json', e);
    const message = '<p class="hint">Couldn\'t load resources. Check your connection and open this tab again.</p>';
    const grid = document.getElementById('resLinksGrid');
    if (grid) grid.innerHTML = message;
    const csGrid = document.getElementById('cheatsheetGrid');
    if (csGrid) csGrid.innerHTML = message;
    return;
  }
  renderExternalLinks(S.resourcesCache.externalLinks || []);
  renderCheatSheet(S.resourcesCache.cheatsheet || []);
  renderComparisons(S.resourcesCache.comparisons || []);
  updateResourcesToc();
}

// ============================================================================
// ON THIS PAGE - the mini sidebar for the long Resources page
// ============================================================================

const TOC_SECTIONS = ['resLinks', 'resCheatsheet', 'resCompare'];

/**
 * WHAT IT DOES: Puts each section's item count next to its link, then marks
 * the section currently in view
 */
function updateResourcesToc() {
  const data = S.resourcesCache || {};
  const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n ? String(n) : ''; };
  setCount('tocLinksCount', (data.externalLinks || []).length);
  setCount('tocCsCount', (data.cheatsheet || []).length);
  setCount('tocCmpCount', (data.comparisons || []).length);
  syncResourcesToc();
}

/**
 * WHAT IT DOES: Highlights the section you're reading: the last one whose
 * heading has scrolled past the top third of the screen (the last section
 * wins once you reach the bottom of the page)
 */
function syncResourcesToc() {
  const toc = document.getElementById('resToc');
  if (!toc || !document.querySelector('#resourcesSection.active')) return;

  const line = window.innerHeight * 0.33;
  let current = TOC_SECTIONS[0];
  TOC_SECTIONS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= line) current = id;
  });
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  if (atBottom) current = TOC_SECTIONS[TOC_SECTIONS.length - 1];

  toc.querySelectorAll('.res-toc-link').forEach(a => {
    const on = a.dataset.toc === current;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });

  // Phones: the links are a sideways-scrolling row; keep the highlighted one in it
  if (toc.scrollWidth > toc.clientWidth && current !== toc.dataset.shown) {
    const link = toc.querySelector(`.res-toc-link[data-toc="${current}"]`);
    if (link) toc.scrollTo({ left: Math.max(0, link.offsetLeft - toc.offsetLeft - 16), behavior: 'smooth' });
  }
  toc.dataset.shown = current;
}

// Links scroll smoothly to their section without changing the address bar
document.getElementById('resToc')?.addEventListener('click', (e) => {
  const link = e.target.closest('.res-toc-link');
  if (!link) return;
  e.preventDefault();
  document.getElementById(link.dataset.toc)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// One scroll listener, throttled to the frame rate
let tocFrame = 0;
window.addEventListener('scroll', () => {
  if (tocFrame) return;
  tocFrame = requestAnimationFrame(() => { tocFrame = 0; syncResourcesToc(); });
}, { passive: true });

// ============================================================================
// SERVICE DRAWER - full exam notes for one cheat-sheet service
// ============================================================================

/** The service's official icon, with a neutral cloud if the image fails to load */
function serviceIconHtml(entry, size = '') {
  const fallback = `<span class="flip-icon ${size}"${entry.iconImg ? ' hidden' : ''}>${icon('cloud')}</span>`;
  return entry.iconImg
    ? `<img class="flip-icon-img ${size}" src="${escapeHtml(safeUrl(entry.iconImg))}" alt="" loading="lazy">${fallback}`
    : fallback;
}

/** Number of questions in the bank for a list of practice topics */
function questionCount(topics) {
  return S.QUESTIONS.filter(q => topics.includes(topicOf(q))).length;
}

/**
 * WHAT IT DOES: Opens the slide-over drawer for one service: what it is, every
 * keyword, a practice button for its questions, and the "commonly confused"
 * sets it belongs to
 */
export function openServiceDrawer(entry) {
  const drawer = document.getElementById('serviceDrawer');
  if (!drawer || !entry) return;

  const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
  const topic = serviceTopic(entry);
  const count = topic ? questionCount([topic]) : 0;
  const related = (S.resourcesCache.comparisons || []).filter(c => (c.cheatsheet || []).includes(entry.service));

  const practice = count
    ? `<button class="btn btn-primary" type="button" data-goto="practice" data-practice-topics="${escapeHtml(topic)}">${icon('list-checks')} Practice ${escapeHtml(topic)} <span class="num btn-count">${count} questions</span></button>`
    : `<p class="hint">No practice questions are tagged with ${escapeHtml(entry.service)} yet.</p>`;

  const relatedHtml = related.length ? `
    <section class="drawer-section">
      <h3>Commonly confused</h3>
      <div class="drawer-links">
        ${related.map(c => `<button class="btn" type="button" data-compare="${escapeHtml(c.id)}">${escapeHtml(c.title)} ${icon('arrow-right')}</button>`).join('')}
      </div>
    </section>` : '';

  document.getElementById('drawerBody').innerHTML = `
    <header class="drawer-head">
      ${serviceIconHtml(entry, 'is-large')}
      <div>
        <h2 id="drawerTitle">${escapeHtml(entry.service)}</h2>
        <p class="drawer-cat">${escapeHtml(entry.category)}</p>
      </div>
    </header>
    <p class="drawer-desc">${escapeHtml(entry.description)}</p>
    <section class="drawer-section">
      <h3>Exam keywords</h3>
      <p class="drawer-hint">When a question mentions these, think ${escapeHtml(entry.service)}.</p>
      <div class="chips">${keywords.map(kw => `<span class="chip">${escapeHtml(kw)}</span>`).join('')}</div>
    </section>
    ${relatedHtml}
    <section class="drawer-section drawer-practice">${practice}</section>`;

  drawer.querySelectorAll('.flip-icon-img').forEach(img => img.addEventListener('error', () => {
    img.hidden = true;
    if (img.nextElementSibling) img.nextElementSibling.hidden = false;
  }, { once: true }));

  if (!drawer.open) drawer.showModal();
  // Start reading at the top of the notes (not on the close button)
  const body = document.getElementById('drawerBody');
  body.scrollTop = 0;
  body.focus({ preventScroll: true });
}

export function closeServiceDrawer() {
  const drawer = document.getElementById('serviceDrawer');
  if (drawer && drawer.open) drawer.close();
}

// ============================================================================
// COMMONLY CONFUSED - side-by-side comparisons (resources.json → comparisons)
// ============================================================================

let activeComparison = null; // id of the comparison on screen (only this module changes it)

export function renderComparisons(comparisons) {
  const picker = document.getElementById('cmpPicker');
  if (!picker) return;
  if (!comparisons.length) {
    picker.closest('.res-block').hidden = true;
    return;
  }
  if (!comparisons.some(c => c.id === activeComparison)) activeComparison = comparisons[0].id;

  picker.innerHTML = comparisons.map(c => `
    <button type="button" role="tab" class="res-filter-btn${c.id === activeComparison ? ' active' : ''}" data-compare="${escapeHtml(c.id)}" aria-selected="${c.id === activeComparison}">${escapeHtml(c.title)}</button>`).join('');

  renderComparison(comparisons.find(c => c.id === activeComparison));
}

function renderComparison(c) {
  const view = document.getElementById('cmpView');
  if (!view || !c) return;

  const head = `<tr><td></td>${c.columns.map(col => `<th scope="col">${escapeHtml(col)}</th>`).join('')}</tr>`;
  const rows = c.rows.map(r => `<tr><th scope="row">${escapeHtml(r.label)}</th>${r.values.map(v => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('');
  const topics = c.practiceTopics || [];
  const count = topics.length ? questionCount(topics) : 0;

  view.innerHTML = `
    <p class="cmp-question">${escapeHtml(c.question || '')}</p>
    <div class="table-wrap">
      <table class="cmp-table">
        <caption class="visually-hidden">${escapeHtml(c.title)}</caption>
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="cmp-notes">
      <section>
        <h3>Pick it when</h3>
        <ul>${(c.pick || []).map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
      </section>
      <section>
        <h3>Exam traps</h3>
        <ul class="cmp-traps">${(c.traps || []).map(t => `<li>${icon('triangle-alert')}<span>${escapeHtml(t)}</span></li>`).join('')}</ul>
      </section>
    </div>
    ${count ? `<button class="btn btn-primary" type="button" data-goto="practice" data-practice-topics="${escapeHtml(topics.join('|'))}">${icon('list-checks')} Practice these <span class="num btn-count">${count} questions</span></button>` : ''}`;
}

/**
 * WHAT IT DOES: Shows one comparison (from the picker or a drawer link) and
 * scrolls it into view when asked
 */
export function showComparison(id, scroll) {
  const comparisons = (S.resourcesCache && S.resourcesCache.comparisons) || [];
  if (!comparisons.some(c => c.id === id)) return;
  activeComparison = id;
  renderComparisons(comparisons);
  if (scroll) document.getElementById('resCompare')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The three brands show the owner's logo PNGs (the sprite's vector mark is the
// fallback); platforms show their own `logo` from resources.json, else a screen icon
export const RES_TYPE_META = {
  youtube:  { label: 'YouTube',  logo: 'assets/resource-logos/youtube.png',  icon: 'brand-youtube',  cls: 'icon-fill brand-youtube' },
  linkedin: { label: 'LinkedIn', logo: 'assets/resource-logos/linkedin.png', icon: 'brand-linkedin', cls: 'icon-fill brand-linkedin' },
  github:   { label: 'GitHub',   logo: 'assets/resource-logos/github.png',   icon: 'brand-github',   cls: 'icon-fill brand-github' },
  platform: { label: 'Platform', logo: '',                                   icon: 'monitor',        cls: '' }
};

/** The mark shown on a link card: the link's own logo, the type's logo, or the type's icon */
function linkMarkHtml(link, meta) {
  const fallback = icon(meta.icon, `res-link-icon ${meta.cls}`);
  const logo = link.logo || meta.logo;
  if (!logo) return fallback;
  return `<img class="res-link-logo" src="${escapeHtml(safeUrl(logo))}" alt="" loading="lazy"><span class="res-link-fallback" hidden>${fallback}</span>`;
}

export function renderExternalLinks(links) {
  const grid = document.getElementById('resLinksGrid');
  if (!grid) return;

  if (!links.length) {
    grid.innerHTML = '<p class="hint">No resources yet.</p>';
    return;
  }

  grid.innerHTML = links.map(link => {
    const meta = RES_TYPE_META[link.type] || { label: link.type, icon: 'link', cls: '' };
    return `
      <div class="res-link-card" data-type="${escapeHtml(link.type)}">
        <div class="res-link-icon-wrap">
          ${linkMarkHtml(link, meta)}
          <span class="res-link-type">${escapeHtml(meta.label)}</span>
        </div>
        <div class="res-link-body">
          <span class="res-link-name">${escapeHtml(link.name)}</span>
          <p class="res-link-desc">${escapeHtml(link.description)}</p>
        </div>
        <a class="btn res-link-btn" href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">
          Visit ${icon('arrow-up-right')}
        </a>
      </div>`;
  }).join('');

  // A platform logo that fails to load falls back to the platform icon
  grid.querySelectorAll('.res-link-logo').forEach(img => img.addEventListener('error', () => {
    img.hidden = true;
    if (img.nextElementSibling) img.nextElementSibling.hidden = false;
  }, { once: true }));

  // Hide filter buttons for types that have no links (e.g. LinkedIn while empty)
  const filterBar = document.getElementById('resFilterBar');
  if (filterBar) {
    const types = new Set(links.map(l => l.type));
    filterBar.querySelectorAll('.res-filter-btn').forEach(btn => {
      btn.hidden = btn.dataset.filter !== 'all' && !types.has(btn.dataset.filter);
    });
  }

  filterExternalLinks();
}

// Filter bar wiring: one delegated listener, bound once (the bar is static HTML)
document.getElementById('resFilterBar')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.res-filter-btn');
  if (!btn) return;
  e.currentTarget.querySelectorAll('.res-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.resActiveFilter = btn.dataset.filter;
  filterExternalLinks();
});

export function filterExternalLinks() {
  const grid = document.getElementById('resLinksGrid');
  if (!grid) return;
  grid.querySelectorAll('.res-link-card').forEach(card => {
    const show = S.resActiveFilter === 'all' || card.dataset.type === S.resActiveFilter;
    card.style.display = show ? '' : 'none';
  });
}

export function renderCheatSheet(entries) {
  const grid = document.getElementById('cheatsheetGrid');
  const search = document.getElementById('csSearch');
  const catBar = document.getElementById('csCategoryBar');
  if (!grid) return;

  if (!entries.length) {
    grid.innerHTML = '<p class="hint">No cheat sheet entries yet.</p>';
    return;
  }

  // Build category filter bar dynamically from data
  if (catBar) {
    const categories = ['all', ...new Set(entries.map(e => e.category))].sort((a, b) =>
      a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)
    );
    catBar.innerHTML = categories.map(cat =>
      `<button type="button" class="res-filter-btn${cat === S.csActiveCategory ? ' active' : ''}" data-cat="${escapeHtml(cat)}">${cat === 'all' ? 'All' : escapeHtml(cat)}</button>`
    ).join('');

    catBar.querySelectorAll('.res-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        catBar.querySelectorAll('.res-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.csActiveCategory = btn.dataset.cat;
        filterCheatSheet();
      });
    });
  }

  // Cards show the essentials (icon, name, category, one line, three keywords);
  // a click opens the full notes in the side drawer
  grid.innerHTML = entries.map((entry, i) => {
    const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
    const topKeys = keywords.slice(0, 3).map(kw => `<span class="chip">${escapeHtml(kw)}</span>`).join('');
    return `
      <button type="button" class="service-card" data-entry="${i}"
           aria-label="${escapeHtml(entry.service)}: open exam notes"
           data-service="${escapeHtml(entry.service.toLowerCase())}" data-category="${escapeHtml(entry.category)}" data-keywords="${escapeHtml(keywords.join(' ').toLowerCase())}">
        <span class="sc-head">
          ${serviceIconHtml(entry)}
          <span class="sc-cat">${escapeHtml(entry.category)}</span>
        </span>
        <span class="sc-name">${escapeHtml(entry.service)}</span>
        <span class="service-desc">${escapeHtml(entry.description)}</span>
        <span class="chips sc-keys">${topKeys}</span>
      </button>`;
  }).join('');

  // One delegated listener for every card
  grid.onclick = (e) => {
    const card = e.target.closest('.service-card');
    if (card) openServiceDrawer(entries[Number(card.dataset.entry)]);
  };

  // Broken service icon → show the neutral fallback (replaces the old inline onerror)
  grid.querySelectorAll('.flip-icon-img').forEach(img => {
    img.addEventListener('error', () => {
      img.hidden = true;
      if (img.nextElementSibling) img.nextElementSibling.hidden = false;
    }, { once: true });
  });

  // Search wiring
  if (search) {
    search.removeEventListener('input', filterCheatSheet);
    search.addEventListener('input', filterCheatSheet);
  }

  filterCheatSheet();
}

export function filterCheatSheet() {
  const grid = document.getElementById('cheatsheetGrid');
  const search = document.getElementById('csSearch');
  const countEl = document.getElementById('csCount');
  if (!grid) return;

  const query = (search ? search.value.trim().toLowerCase() : '');
  let visible = 0;

  grid.querySelectorAll('.service-card').forEach(card => {
    const matchCat = S.csActiveCategory === 'all' || card.dataset.category === S.csActiveCategory;
    const matchSearch = !query ||
      card.dataset.service.includes(query) ||
      card.dataset.keywords.includes(query) ||
      card.querySelector('.service-desc').textContent.toLowerCase().includes(query);
    const show = matchCat && matchSearch;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  if (countEl) {
    const total = grid.querySelectorAll('.service-card').length;
    countEl.textContent = visible === total ? `${total} services` : `${visible} of ${total} services`;
  }
}
