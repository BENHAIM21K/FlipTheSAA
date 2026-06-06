# FlipTheSAA

**A free platform to help you pass the AWS Solutions Architect Associate (SAA-C03) exam**

[flipthesaa.com](https://www.flipthesaa.com)

---

## What is FlipTheSAA?

FlipTheSAA is a community-built, completely free AWS SAA-C03 preparation platform. It combines structured live study group cohorts with a realistic practice exam simulator, a performance dashboard, and a curated resource hub — all in one place.

No login required. No paywall. All your data stays in your browser.

---

## 📚 Study Groups

Study groups are the heart of FlipTheSAA. Each cohort runs for 11 lessons over roughly two months, covering all SAA-C03 exam domains together with a group of students.

**Lessons 1–8** include:

- **Recording** — Full session recording so you never miss a class and can rewatch at your own pace
- **AI Summary** — An AI-generated summary of the session covering the key points discussed
- **Slides** — Lesson presentation slides (PDF or Google Drive link)
- **Quiz** — A practice quiz to reinforce the material

**Lessons 9–11** (mock exam sessions) include:

- **Recording** — Full session recording
- **AI Summary** — AI-generated summary of the session

Past cohort recordings and materials remain accessible to everyone on the Study Groups page after the cohort ends, so you can go through any previous cohort independently at your own pace.

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
- **Section** — Specific AWS services: IAM, EC2, VPC, S3, RDS, DynamoDB, Lambda, SQS, CloudFront, Route 53, CloudWatch, ELB, Auto Scaling, EBS, EFS, KMS
- **Difficulty** — Easy, Medium, Hard, or All

### Jump Grid Navigation

A visual map of all questions shows answered, current, and flagged status at a glance. Click any cell to jump directly to that question.

---

## 📊 Performance Dashboard

Tracks your progress across all completed sessions:

- Total attempts, average score, pass rate
- Score trend across your last 10 sessions
- Per-domain accuracy bars, color-coded (green ≥80%, yellow 60–79%, red <60%)
- Top 10 most-missed questions with a direct link to retake each one

Data is stored locally in `localStorage` and persists across browser sessions. Nothing is sent to any server.

---

## 🔗 Resources

A curated reference hub with two sections.

### Study Resources

Categorized links to the best external SAA-C03 study materials:

- **YouTube** — Channels with exam-focused video content
- **LinkedIn** — People to follow for AWS insights and tips
- **GitHub** — Repositories with practical AWS guides
- **Platforms** — Practice exam and learning platforms

Filter by type to quickly find what you need.

### AWS Service Cheat Sheet

A searchable, filterable quick-reference for every AWS service tested on the SAA-C03 exam (~115 services).

- **Flip cards** — Front shows the service name and icon; click to flip and reveal the description and exam-relevant keywords
- **Live search** — Type a service name or any keyword (e.g. "DDoS", "NoSQL", "serverless") to filter cards instantly
- **Category filter** — Filter by service family: Compute, Storage, Database, Networking, Security, Integration, Analytics, Serverless, Management, Migration, Containers, Cost, Machine Learning, Media, Frontend, Developer Tools

Both filters work together — search narrows the active category, and selecting a category narrows the current search.

---

## 💾 Persistent State

- Auto-saves after every answer and navigation action
- Resume an interrupted session exactly where you left off, including timer state
- Deterministic shuffle: the same question order is preserved if you refresh mid-session
- Last 50 completed sessions kept in history

---

## 🛠️ How to Use

### Learning a new topic
1. Go to **Practice Questions**
2. Select **Review Mode**
3. Filter to the domain or AWS service you want to focus on
4. Work through questions and read every explanation

### Testing exam readiness
1. Go to **Practice Questions**
2. Select **Timed Exam Mode**
3. Set Domain and Section to ALL
4. Click "Start Fresh" and treat it like the real thing
5. After submitting, go to **Performance** to see your score and weak areas

### Catching up on a study group
1. Go to **Study Groups**
2. Select a cohort
3. Open any lesson accordion to access its recording, AI summary, slides, and quiz

### Studying AWS services
1. Go to **Resources**
2. Open the **AWS Service Cheat Sheet**
3. Use the search bar or category filters to find a service
4. Click any card to flip it and reveal the description and keywords

---

## 🏆 Readiness Benchmarks

Before booking the real exam:

- At least 5 consecutive Timed Exam scores of 720 or above
- No domain below 70% on the Performance Dashboard
- Finishing Timed Exams with 30 or more minutes remaining

---

## 🛠️ Technical Details

- Pure frontend — no backend, no server, no database
- Vanilla JavaScript, no frameworks or dependencies
- Data files served as static JSON from S3: `questions.json`, `studygroups.json`, `resources.json`
- All session data stored in browser `localStorage`:
  - `saa_practice_state_v1` — current session state, answers, timer, shuffle seed
  - `saa_practice_history_v1` — last 50 completed sessions with domain and section breakdowns
- Responsive design, tested on desktop and mobile (Chrome, Firefox, Safari, Edge)

---

## 📞 Contact

For bug reports, feature requests, question quality issues, or to join the next study group cohort:

[Ben Haim on LinkedIn](https://www.linkedin.com/in/ben-haim-/)
