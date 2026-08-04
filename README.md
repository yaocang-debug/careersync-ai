# CareerSync AI

A working local MVP for an ethical AI job-matching platform. It includes a persistent API, employee job matches and application tracking, plus an employer posting and candidate-review dashboard.

Production deployment scaffolding is included in `docker-compose.yml`, `.env.production.example`, and `docs/production-runbook.md`.

## Included modes

- **User portal** (`/`): employee job matching/applications and employer job posting/candidate review. It has no platform-administration controls.
- **Admin console** (`/admin.html`): company verification, job moderation, application oversight, and activity audit trail.

## Run locally

From this folder, run:

```powershell
& 'C:\Users\HP\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

Then visit `http://localhost:3000`.

On this computer, use `start-careersync.cmd` to launch the current build on `http://localhost:3013` with one double-click.

The user portal is also installable as an app (PWA). Open it in Chrome or Edge, open the browser menu, and choose **Install CareerSync AI** or **Add to Home screen**.

## Gemini AI integration

Both the user AI assistant and Admin Copilot call the server endpoint `/api/assistant`. If `GEMINI_API_KEY` is set, the server sends the request to Gemini using the `generateContent` REST API. If it is not set or Gemini is unavailable, the app uses the local CareerSync guidance layer instead.

PowerShell example:

```powershell
$env:GEMINI_API_KEY = "your-key-from-Google-AI-Studio"
$env:GEMINI_MODEL = "gemini-2.5-flash"
& 'C:\Users\HP\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

The API key stays on the server and is never sent to the browser.

Registration supports a profile photo, age, region, phone, gender, marital status, and optional workplace accommodation information. These are sensitive profile details, private by default, and excluded from job matching and ranking.

The app saves local demo activity in `data/store.json`. To reset it, restore that file from source control.

## Contents

- `index.html`, `styles.css`, `app.js` — responsive employee and employer UI.
- `server.js`, `data/store.json` — dependency-free Node API and development data store.
- `docs/architecture.md` — production architecture, ethical AI boundaries and roadmap.
- `docs/database-schema.sql` — PostgreSQL starting schema.
- `docs/api-contract.md` — proposed production API surface.

## Product principles

- Explain recommendations; never use a hidden blacklist.
- Employee feedback and employer signals require a right to respond, review, and appeal.
- Sensitive traits are excluded from matching, scoring and employer views.
- AI ranks candidates to assist reviewers; it does not make final hiring decisions.

## MVP limitations

This is a local development MVP with fixed demo employee and employer identities. Before public launch, add managed authentication, PostgreSQL, secure file uploads, server-side authorization, rate limiting, privacy/legal review, automated tests, and monitored production infrastructure.

Admin mode is intentionally open in this local demo. It must be protected with authenticated, role-based access control before deployment.
