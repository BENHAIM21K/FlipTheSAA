# FlipTheSAA

**A free platform to help you pass the AWS Solutions Architect Associate (SAA-C03) exam**

[flipthesaa.com](https://www.flipthesaa.com)

---

## What is FlipTheSAA?

FlipTheSAA is a community-built, completely free AWS SAA-C03 preparation platform. It combines structured live study group cohorts with a realistic practice exam simulator, a performance dashboard, and a curated resource hub — all in one place.

No login required. No paywall. All your data stays in your browser.

---

## 🚀 v2.0 — The Overhaul

FlipTheSAA v2.0 is a full redesign of the site, covering every tab, the code underneath, and the content. It is still free, needs no login, and keeps your progress in your browser. Your existing history carries over untouched.

**Design**
- New look across the whole site: one calm workspace layout, IBM Plex type and a single accent colour
- Light and dark themes with a toggle; the site follows your system setting until you pick one
- One consistent outline icon set in place of emoji and Font Awesome
- Keyboard-friendly everywhere: visible focus rings, real buttons, 44px touch targets on phones

**Practice**
- An exam workstation: the question on the left and a side panel on the right (clock, Pause/Resume, progress, question map, End exam). On phones it becomes a bottom bar and a slide-up map
- Cross out answers to rule out distractors; the cross-outs are saved with your session
- Review before submitting: End exam lists your unanswered and flagged questions first, like the real exam
- A Pause/Resume button that is always visible, with a frozen "Paused" clock
- A section filter covering every topic: 74 topics grouped by service family, with question counts and a search box (it used to show only 16 sections)
- Your difficulty choice is restored with the session, and setup errors are shown instead of failing silently

**Performance**
- A new score-trend chart against the 720 pass line, with hover details, arrow-key navigation and a table view
- Readiness by domain: your accuracy next to each domain's weight, naming the domain that costs you the most points
- **Mistake drill:** turn every question you last got wrong into a practice session
- Export your progress to a file and import it on another device (it merges, never overwrites)
- Reset moved out of the main menu into a "Your data" panel, behind a confirmation

**Study groups**
- An in-page lesson player: watch the recording, read the AI summary or flip through the slides without leaving the site
- Recording previews: each lesson shows a still frame before you press Play
- "Practice this lesson" starts a session on exactly that lesson's topics; mock-exam lessons offer a timed exam
- Lesson quizzes and Quizlet flashcards
- Study Group #5: all 14 sessions, including the hands-on labs and mock exams

**Resources**
- Courses and channels first, plus an "On this page" sidebar on the long page
- Platform and brand logos on every link, and the FlipTheScript AWS SAA playlist at the top
- Cheat-sheet cards open a side drawer with every keyword and a "Practice this service" button
- **Commonly confused:** 8 side-by-side comparisons (SQS vs SNS vs EventBridge vs Kinesis, ALB vs NLB vs GWLB, …) with exam traps

**Share your pass**
- Pass a timed mock exam and share it on LinkedIn or WhatsApp. Your post shows a certificate-style card with your score and links people to FlipTheSAA

**Under the hood**
- The single 3,700-line `app.js` was split into 20 native ES modules in `js/`, still with no framework and no build step
- All data shown on the page is escaped, and links are checked before they are used
- In-page dialogs replace the browser's `alert()` / `confirm()` pop-ups
- Link previews (Open Graph) for the site and for every share card

---

## 📚 Study Groups

Study groups are the heart of FlipTheSAA. Each cohort runs for 11–14 sessions over roughly two months, covering all SAA-C03 exam domains together with a group of students: teaching lessons, hands-on labs and mock-exam sessions.

Each lesson can include:

- **Recording** — Full session recording, played right on the site, so you never miss a class and can rewatch at your own pace
- **AI Summary** — An AI-generated summary of the session covering the key points discussed
- **Slides** — Lesson presentation slides
- **Quiz** — A practice quiz or Quizlet flashcards to reinforce the material
- **Practice this lesson** — A practice session on that lesson's topics (or a timed mock exam for mock-exam sessions)

Past cohort recordings and materials remain accessible to everyone on the Study groups page after the cohort ends, so you can go through any previous cohort independently at your own pace.

To join the next live cohort, DM on [LinkedIn](https://www.linkedin.com/in/ben-haim-/).

---

## 📝 Practice Exams

A self-contained quiz simulator you can use independently of study groups.

### Two Modes

**Review Mode** — for learning
- Instant feedback after each answer
- Detailed explanation of the correct answer
- No time pressure, no score tracking
- Best for learning new topics or reviewing weak areas

**Timed Exam Mode** — for readiness testing
- 130 minutes, 65 questions (50 scored + 15 unscored pretest, mirroring real AWS exam structure)
- No feedback until you submit
- 1000-point scoring scale, passing at 720
- Question flagging system identical to the real AWS exam interface
- Timer with automatic submission when time runs out

### Smart Filtering

Narrow questions by:

- **Domain** — D1: Design Secure Architectures, D2: Design Resilient Architectures, D3: Design High-Performing Architectures, D4: Design Cost-Optimized Architectures
- **Section** — Any of 74 topics (EC2, S3, ElastiCache, Secrets Manager, CloudTrail, disaster recovery, …), grouped by service family, with question counts and a search box
- **Difficulty** — Easy, Medium, Hard, or All

### Exam Workstation

- **Layout:** on desktop the question sits on the left and a side panel stays in view on the right. The panel holds the clock, Pause/Resume, progress, the question map and End exam. On phones a bottom bar holds Prev / Map / Next, and the map slides up as a sheet.
- **Question map:** shows current, answered, flagged and correct/incorrect at a glance. Filter it to Unanswered, Flagged or Incorrect, and click any cell to jump there.
- **Cross out answers:** rule out distractors with the strike button next to each choice (or right-click it). It's saved with your session.
- **Review before submitting (Timed):** End exam lists your unanswered and flagged questions and lets you go back to them first, like the real exam's review screen.
- **Folded setup:** while a session runs, the setup panel folds into one line ("Timed exam · 65 questions · All difficulties"), with a Change button.

### Share Your Pass

After a timed mock exam scored 720 or above, **Share your pass** opens a share dialog. It shows a certificate-style card with your score, and the post text, which you can edit. One click opens LinkedIn or WhatsApp, and the link in the post shows the card as its preview and brings people to FlipTheSAA.

---

## 📊 Performance Dashboard

Tracks your progress across all completed sessions:

- Total attempts, average score, pass rate, and change (last 3 vs first 3)
- **Score trend** chart of your last 20 sessions against the 720 pass line. Timed mocks are filled dots and review sessions hollow rings. Hover or tap for details, use the arrow keys with the keyboard, or open it as a table.
- **Readiness by domain:** your accuracy (answered questions only) next to each domain's share of the exam, with a tick at 72%. It names the domain losing you the most points.
- **Mistake drill:** one button turns every question you last answered wrong into a practice session, most-missed first. Get one right and it leaves the drill. Drills don't count towards your scores.
- Top 10 most-missed questions
- **Your data:** export your progress to a file and import it on another device (it merges, never overwrites), or reset everything

Data is stored locally in `localStorage` and persists across browser sessions. Nothing is sent to any server.

---

## 🔗 Resources

A curated reference hub in three sections, with an "On this page" sidebar to jump between them.

### Courses and Channels

Categorized links to the best external SAA-C03 study materials, starting with the FlipTheScript AWS SAA playlist:

- **YouTube** — Channels with exam-focused video content
- **LinkedIn** — People to follow for AWS insights and tips
- **GitHub** — Repositories with practical AWS guides
- **Platforms** — Practice exam and learning platforms

Filter by type to quickly find what you need.

### AWS Service Cheat Sheet

A searchable, filterable quick-reference for every AWS service tested on the SAA-C03 exam (117 services).

- **Service cards** — Icon, category, one-line description and top keywords; click to open a side drawer with every keyword, a "Practice this service" button and related comparisons
- **Live search** — Type a service name or any keyword (e.g. "DDoS", "NoSQL", "serverless") to filter cards instantly
- **Category filter** — Filter by service family: Compute, Storage, Database, Networking, Security, Integration, Analytics, Serverless, Management, Migration, Containers, Cost, Machine Learning, Media, Frontend, Developer Tools

Both filters work together — search narrows the active category, and selecting a category narrows the current search.

### Commonly Confused

8 side-by-side comparisons of the services the exam mixes up (SQS vs SNS vs EventBridge vs Kinesis, ALB vs NLB vs GWLB, Secrets Manager vs Parameter Store, …), each with "pick it when" rules, exam traps and a button to practise those services.

---

## 💾 Persistent State

- Auto-saves after every answer and navigation action
- Resume an interrupted session exactly where you left off, including timer state
- Deterministic shuffle: the same question order is preserved if you refresh mid-session
- Last 50 completed sessions kept in history

---

## 🛠️ How to Use

### Learning a new topic
1. Go to **Practice**
2. Select **Review (instant feedback)**
3. Filter to the domain or topic you want to focus on
4. Work through questions and read every explanation

### Testing exam readiness
1. Go to **Practice**
2. Select **Timed Exam** (always the full 65 questions)
3. Click **Start fresh (new shuffle)** and treat it like the real thing
4. After submitting, review every question, then go to **Performance** to see your trend, your weakest domain and your mistake drill
5. Passed? Press **Share your pass**

### Catching up on a study group
1. Go to **Study groups**
2. Select a cohort: the newest lesson with materials opens in the player
3. Switch between Recording, AI summary and Slides without leaving the site, pick another lesson from the list, and press **Practice this lesson** to drill that lesson's topics

### Studying AWS services
1. Go to **Resources**
2. Open the **AWS Service Cheat Sheet**
3. Use the search bar or category filters to find a service
4. Click any card to open its notes: every exam keyword, a button to practice that service's questions, and links to the comparisons it appears in
5. Check **Commonly confused** for side-by-side tables (SQS vs SNS vs EventBridge vs Kinesis, ALB vs NLB vs GWLB, …) with exam traps

---

## 🏆 Readiness Benchmarks

Before booking the real exam:

- At least 5 consecutive Timed Exam scores of 720 or above
- No domain below 70% on the Performance Dashboard
- Finishing Timed Exams with 30 or more minutes remaining

---

## 🛠️ Technical Details

- Pure frontend — no backend, no server, no database
- Vanilla JavaScript as native ES modules in `js/` (entry point `js/main.js`), no frameworks, dependencies or build step
- Data files served as static JSON from S3: `questions.json`, `studygroups.json`, `resources.json`
- Share cards are pre-built static pages and images in `share/` (one per passing score, 720–1000), because link previews are read without running JavaScript
- All session data stored in browser `localStorage`:
  - `saa_practice_state_v1` — current session state, answers, timer, shuffle seed
  - `saa_practice_history_v1` — last 50 completed sessions with domain and section breakdowns
  - `saa_active_tab_v1` — the last open tab
  - `saa_theme_v1` — light or dark theme choice (absent = follow the operating system)
- Reset all progress lives at the bottom of the Performance tab ("Your data")
- Responsive design, tested on desktop and mobile (Chrome, Firefox, Safari, Edge)

---

## 📞 Contact

For bug reports, feature requests, question quality issues, or to join the next study group cohort:

[Ben Haim on LinkedIn](https://www.linkedin.com/in/ben-haim-/)
