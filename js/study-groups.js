// FlipTheSAA — Study groups tab: cohort list → lesson theater
import { topicOf } from './filters.js';
import { S } from './state.js';
import { escapeHtml, fetchJson, icon, safeUrl } from './util.js';

// The lesson theater keeps its own view state (only this module changes it)
let currentCohort = null;   // the cohort object being shown
let currentLesson = null;   // the selected lesson object
let currentMedia = null;    // 'recording' | 'summary' | 'presentation'

const MEDIA = [
  { key: 'recording', label: 'Recording', icon: 'video' },
  { key: 'summary', label: 'AI summary', icon: 'file-text' },
  { key: 'presentation', label: 'Slides', icon: 'presentation' }
];

/**
 * WHAT IT DOES: Renders the study groups section (two-level: cohort list → lesson theater)
 */
export async function renderStudyGroups() {
  if (!S.studyGroupsCache) {
    const cohortListEl = document.querySelector('.sg-cohort-list');
    if (cohortListEl) cohortListEl.innerHTML = '<p class="hint sg-state">Loading study groups…</p>';
    try {
      S.studyGroupsCache = await fetchJson('studygroups.json');
    } catch (e) {
      if (cohortListEl) cohortListEl.innerHTML = '<p class="hint sg-state">Couldn\'t load the study groups. Check your connection and open this tab again.</p>';
      console.warn('[SAA Warning] Could not load studygroups.json', e);
      return;
    }
  }
  // Coming back to the tab keeps the cohort you were watching
  if (currentCohort) showStudyGroupDetail(currentCohort, currentLesson);
  else showStudyGroupsList();
}

export function showStudyGroupsList() {
  const listView = document.querySelector('.sg-list-view');
  const detailView = document.querySelector('.sg-detail-view');
  if (!listView || !detailView) return;

  stopPlayback();
  currentCohort = null;
  currentLesson = null;
  listView.style.display = '';
  detailView.style.display = 'none';

  const cohortListEl = document.querySelector('.sg-cohort-list');
  const cohorts = S.studyGroupsCache.studyGroups || [];

  cohortListEl.innerHTML = cohorts.map(cohort => {
    const recorded = (cohort.lessons || []).filter(hasMaterials).length;
    const total = (cohort.lessons || []).length;
    return `
    <div class="sg-cohort-card" data-cohort="${escapeHtml(cohort.number)}">
      <div class="sg-cohort-info">
        <div class="sg-cohort-title">${escapeHtml(cohort.name)}</div>
        <div class="sg-cohort-meta">${escapeHtml(cohort.dateRange || '')}${total ? ` · ${total} lessons` : ''}${total ? ` · ${recorded ? `${recorded} with materials` : 'materials added as lessons run'}` : ''}</div>
        ${cohort.description ? `<p class="sg-cohort-desc" dir="auto">${escapeHtml(cohort.description)}</p>` : ''}
      </div>
      <button class="btn sg-cohort-btn" type="button">${recorded ? 'Watch lessons' : 'View lessons'} ${icon('arrow-right')}</button>
    </div>`;
  }).join('');

  cohortListEl.querySelectorAll('.sg-cohort-card').forEach(card => {
    card.addEventListener('click', () => {
      const cohortNum = parseInt(card.dataset.cohort, 10);
      const cohort = (S.studyGroupsCache.studyGroups || []).find(c => c.number === cohortNum);
      if (cohort) showStudyGroupDetail(cohort);
    });
  });

  console.info('[SAA Info] Rendered', cohorts.length, 'study group cohorts');
}

/**
 * WHAT IT DOES: Opens a cohort in the theater: the player on the left, its
 * lessons on the right. Starts on the given lesson, or on the newest lesson
 * that has materials.
 */
export function showStudyGroupDetail(cohort, lesson) {
  const listView = document.querySelector('.sg-list-view');
  const detailView = document.querySelector('.sg-detail-view');
  if (!listView || !detailView) return;

  currentCohort = cohort;
  listView.style.display = 'none';
  detailView.style.display = '';

  detailView.querySelector('.sg-detail-title').textContent = cohort.name;
  detailView.querySelector('.sg-detail-meta').textContent = cohort.dateRange || '';
  detailView.querySelector('.sg-detail-desc').textContent = cohort.description || '';

  const lessons = cohort.lessons || [];
  const start = (lesson && lessons.includes(lesson) && lesson) || lessons.find(hasMaterials) || lessons[0] || null;

  const backBtn = detailView.querySelector('.sg-back-btn');
  if (backBtn) backBtn.onclick = showStudyGroupsList;

  selectLesson(start);
  console.info('[SAA Info] Showing theater for', cohort.name, '—', lessons.length, 'lessons');
}

/**
 * WHAT IT DOES: Shows one lesson in the theater and marks it in the lesson list
 */
function selectLesson(lesson) {
  stopPlayback();
  currentLesson = lesson;
  const available = lesson ? MEDIA.filter(m => lesson[m.key] && lesson[m.key].url) : [];
  currentMedia = available.length ? available[0].key : null;

  renderLessonList();
  renderTheater();
}

function renderLessonList() {
  const listEl = document.getElementById('lessonList');
  if (!listEl || !currentCohort) return;

  listEl.innerHTML = (currentCohort.lessons || []).map((l, i) => {
    const selected = l === currentLesson;
    const ready = hasMaterials(l);
    const status = l.recording && l.recording.url
      ? `<span class="lesson-status">${icon('video')}<span class="visually-hidden">Recording available</span></span>`
      : ready ? '' : '<span class="pill pill-neutral">Upcoming</span>';
    return `
      <button type="button" class="lesson-row${selected ? ' active' : ''}" data-lesson="${i}" ${selected ? 'aria-current="true"' : ''}>
        <span class="lesson-num num">${escapeHtml(l.number)}</span>
        <span class="lesson-text">
          <span class="lesson-topic" dir="auto">${escapeHtml(l.topic || `Lesson ${l.number}`)}</span>
          <span class="lesson-date">${escapeHtml(l.date || '')}</span>
        </span>
        ${status}
      </button>`;
  }).join('');

  listEl.onclick = (e) => {
    const row = e.target.closest('.lesson-row');
    if (!row) return;
    selectLesson(currentCohort.lessons[Number(row.dataset.lesson)]);
    // On a phone the player sits above the list: bring it into view
    if (window.matchMedia('(max-width: 960px)').matches) {
      document.querySelector('.theater-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
}

function renderTheater() {
  const titleEl = document.getElementById('theaterTitle');
  const metaEl = document.getElementById('theaterMeta');
  const tabsEl = document.getElementById('theaterTabs');
  const actionsEl = document.getElementById('theaterActions');
  const lesson = currentLesson;
  if (!titleEl) return;

  if (!lesson) {
    titleEl.textContent = 'No lessons yet';
    metaEl.textContent = '';
    tabsEl.innerHTML = '';
    renderStage();
    actionsEl.innerHTML = '';
    return;
  }

  titleEl.textContent = `Lesson ${lesson.number}`;
  metaEl.innerHTML = `<span dir="auto">${escapeHtml(lesson.topic || '')}</span>${lesson.date ? ` · ${escapeHtml(lesson.date)}` : ''}`;

  // Tabs: only the media this lesson has
  const available = MEDIA.filter(m => lesson[m.key] && lesson[m.key].url);
  tabsEl.innerHTML = available.map(m => `
    <button type="button" role="tab" class="theater-tab${m.key === currentMedia ? ' active' : ''}" data-media="${m.key}" aria-selected="${m.key === currentMedia}">
      ${icon(m.icon)} ${m.label}
    </button>`).join('');
  tabsEl.hidden = available.length === 0;
  tabsEl.onclick = (e) => {
    const tab = e.target.closest('.theater-tab');
    if (!tab || tab.dataset.media === currentMedia) return;
    stopPlayback();
    currentMedia = tab.dataset.media;
    renderTheater();
  };

  renderStage();
  actionsEl.innerHTML = lessonActionsHtml(lesson);
}

/**
 * WHAT IT DOES: Fills the stage: a click-to-play poster for recordings, the
 * document itself for summaries and slides, or an empty state
 *
 * WHY click-to-play: a Drive video player is heavy and third-party; only the
 * poster's still frame (one image) loads from Google until you press Play.
 */
function renderStage() {
  const stage = document.getElementById('theaterStage');
  const openEl = document.getElementById('theaterOpen');
  if (!stage) return;
  const lesson = currentLesson;
  const item = lesson && currentMedia ? lesson[currentMedia] : null;

  stage.className = 'theater-stage';
  if (!item) {
    stage.classList.add('is-empty');
    stage.innerHTML = `
      <div class="stage-empty">
        ${icon('video', 'icon-lg')}
        <p class="stage-empty-title">${lesson ? 'No recording yet' : 'No lessons yet'}</p>
        <p>${lesson && lesson.date ? `The recording, AI summary and slides are added after this lesson runs on ${escapeHtml(lesson.date)}.` : 'Materials are added after each lesson runs.'}</p>
      </div>`;
    if (openEl) openEl.innerHTML = '';
    return;
  }

  const url = safeUrl(item.url);
  const embed = embedUrl(url);
  const isVideo = currentMedia === 'recording';
  stage.classList.add(isVideo ? 'is-video' : 'is-doc');

  if (openEl) {
    const where = /drive\.google|docs\.google/.test(url) ? 'Open in Google Drive' : 'Open in a new tab';
    openEl.innerHTML = `<a class="card-link-ext" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${where} ${icon('arrow-up-right')}</a>`;
  }

  if (!embed) {
    stage.classList.add('is-empty');
    stage.innerHTML = `
      <div class="stage-empty">
        ${icon('link', 'icon-lg')}
        <p class="stage-empty-title">${escapeHtml(item.label || 'This file')} opens outside the site</p>
        <p><a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open ${icon('arrow-up-right')}</a></p>
      </div>`;
    return;
  }

  if (isVideo) {
    // The poster names the lesson and offers a real, labelled button (the whole stage is the hit area).
    // Behind it, a frame from the recording; without one the poster stays plain dark.
    const where = /drive\.google/.test(url) ? 'Plays from Google Drive' : /youtube/.test(embed) ? 'Plays from YouTube' : 'Plays in the page';
    const thumb = thumbnailUrl(embed);
    stage.innerHTML = `
      <button type="button" class="stage-poster${thumb ? ' has-thumb' : ''}" id="stagePlayBtn" aria-label="Play the lesson ${escapeHtml(lesson.number)} recording">
        ${thumb ? `<img class="stage-poster-img" src="${escapeHtml(thumb)}" alt="" decoding="async" referrerpolicy="no-referrer" />` : ''}
        <span class="stage-poster-title" dir="auto">Lesson ${escapeHtml(lesson.number)}${lesson.topic ? ` · ${escapeHtml(lesson.topic)}` : ''}</span>
        ${lesson.date ? `<span class="stage-poster-date">${escapeHtml(lesson.date)}</span>` : ''}
        <span class="stage-play-btn"><svg class="stage-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6v14.8a1 1 0 0 0 1.52.85l12.1-7.4a1 1 0 0 0 0-1.7L8.52 3.75A1 1 0 0 0 7 4.6z" fill="#0b0c0e"/></svg>Play recording</span>
        <span class="stage-poster-sub">${where}</span>
      </button>`;
    const poster = document.getElementById('stagePlayBtn');
    poster.onclick = () => mountFrame(stage, embed, item.label || 'Lesson recording', true);
    // The frame fades in when it arrives. Some recordings have no thumbnail (Drive answers 404): keep the plain poster
    const img = poster.querySelector('.stage-poster-img');
    img?.addEventListener('load', () => img.classList.add('is-loaded'));
    img?.addEventListener('error', () => {
      img.remove();
      poster.classList.remove('has-thumb');
    });
  } else {
    mountFrame(stage, embed, item.label || (currentMedia === 'summary' ? 'AI summary' : 'Slides'), false);
  }
}

function mountFrame(stage, src, title, autoplay) {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = title;
  iframe.loading = 'lazy';
  iframe.allow = autoplay ? 'autoplay; fullscreen; picture-in-picture' : 'fullscreen';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  stage.innerHTML = '';
  stage.appendChild(iframe);
}

/** Removes a playing video so it stops when you change lesson, tab or screen */
function stopPlayback() {
  const stage = document.getElementById('theaterStage');
  if (stage && stage.querySelector('iframe')) stage.innerHTML = '';
}

/**
 * WHAT IT DOES: Turns a share link into a URL that can be shown in a frame,
 * or null when the link can't be embedded
 *
 * EXAMPLES:
 * drive.google.com/file/d/ID/view?usp=… → drive.google.com/file/d/ID/preview
 * docs.google.com/document/d/ID/edit    → docs.google.com/document/d/ID/preview
 * youtube.com/watch?v=ID, youtu.be/ID   → youtube-nocookie.com/embed/ID
 * assets/presentations/x.pdf            → unchanged (served by this site)
 */
export function embedUrl(url) {
  if (!url || url === '#') return null;
  let m = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  m = url.match(/^https:\/\/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]+)/);
  if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
  m = url.match(/^https:\/\/(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/) || url.match(/^https:\/\/youtu\.be\/([\w-]{6,})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  if (!/^[a-z]+:/i.test(url) && /\.pdf($|[?#])/i.test(url)) return url;
  return null;
}

/**
 * WHAT IT DOES: A still frame for a recording's poster, from its embed URL, or null
 *
 * EXAMPLES:
 * drive.google.com/file/d/ID/preview   → drive.google.com/thumbnail?id=ID&sz=w960
 * youtube-nocookie.com/embed/ID         → i.ytimg.com/vi/ID/hqdefault.jpg
 */
export function thumbnailUrl(embed) {
  let m = (embed || '').match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\/preview$/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w960`;
  m = (embed || '').match(/^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]+)$/);
  if (m) return `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`;
  return null;
}

/**
 * WHAT IT DOES: The actions under the player: practise this lesson's topics,
 * the lesson quizzes, useful links
 */
function lessonActionsHtml(lesson) {
  const parts = [];

  const curriculum = (S.studyGroupsCache && S.studyGroupsCache.curriculum) || {};
  const topics = Array.isArray(lesson.practiceTopics) ? lesson.practiceTopics : (curriculum[lesson.topic] || []);
  if (topics.includes('TIMED')) {
    parts.push(`<button class="btn btn-primary" type="button" data-goto="practice" data-mode="timed">${icon('timer')} Take a timed mock exam</button>`);
  } else if (topics.length && S.QUESTIONS.length) {
    const count = S.QUESTIONS.filter(q => topics.includes(topicOf(q))).length;
    if (count) {
      parts.push(`<button class="btn btn-primary" type="button" data-goto="practice" data-practice-topics="${escapeHtml(topics.join('|'))}" title="${escapeHtml(topics.join(', '))}">${icon('list-checks')} Practice this lesson <span class="num btn-count">${count} questions</span></button>`);
    }
  }

  (lesson.quizzes || []).filter(q => q.url).forEach(q => parts.push(`
    <a class="btn" href="${escapeHtml(safeUrl(q.url))}" target="_blank" rel="noopener noreferrer">${icon('clipboard-check')} ${escapeHtml(q.label || 'Quiz')} ${icon('arrow-up-right')}</a>`));

  (lesson.links || []).filter(l => l.url).forEach(l => parts.push(`
    <a class="btn" href="${escapeHtml(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${icon(l.type === 'youtube' ? 'youtube' : 'link')} ${escapeHtml(l.label)} ${icon('arrow-up-right')}</a>`));

  return parts.join('');
}

function hasMaterials(lesson) {
  return MEDIA.some(m => lesson[m.key] && lesson[m.key].url);
}

/**
 * WHAT IT DOES: Stops a playing recording when you leave the Study groups tab
 * (a hidden iframe keeps playing sound), and puts the play button back
 */
export function leaveStudyGroups() {
  if (currentLesson && currentMedia === 'recording') {
    stopPlayback();
    renderStage();
  }
}
