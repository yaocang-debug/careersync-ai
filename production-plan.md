# CareerSync production implementation plan

The current browser MVP is intentionally dependency-free. The following is the production boundary: PostgreSQL, object storage, a real identity provider, background jobs, and a model gateway replace the local JSON/demo services.

## Release 1 — platform foundation

- Next.js/React web portal and React Native mobile app share the same versioned API.
- Auth service issues short-lived access tokens and rotating refresh tokens. Roles are `employee`, `employer_admin`, `recruiter`, and `platform_admin`; every route checks both role and tenant/company scope.
- Email/SMS verification is handled by a provider (Resend/SendGrid + Twilio/MessageBird). Never return verification codes from production APIs.
- PostgreSQL is the source of truth; object storage holds profile photos and resumes; a queue handles reminders, email, scoring, and exports.
- Rate limits, lockout, audit events, backups, point-in-time recovery, Sentry, and OpenTelemetry are mandatory before public launch.

## Release 2 — trust and hiring operations

- Admin risk queue: critical/high/medium/low priority, assignee, evidence, escalation, resolution and immutable audit history.
- Employer pipeline: drag-and-drop stages, private candidate notes, scorecards, interview feedback, decisions, and offer letters.
- Employee Career Passport: verified skills, certificates, portfolio, experience, references, and profile completeness.
- Notification centre: applications, interviews, security events, employer messages and admin alerts, with read state and preferences.

## Release 3 — intelligence and accessibility

- Match explanations include factors, confidence, model version, and a report-correction path. Protected traits never enter matching.
- Gemini runs behind a server-side model gateway with retrieval context from the current user/job/application and a citation/source field. A human must confirm moderation or hiring actions.
- Skills-gap plans, salary/work-condition comparison, job quality checks, safe interview checks, offer comparisons and application-health reminders are separate audited services.
- Keyboard navigation, screen-reader labels, high contrast, larger type, and localization are acceptance criteria, not post-launch polish.

## Explicit product rules

- Health, gender, age, marital status and other protected/sensitive profile fields are private, excluded from ranking, and visible only with explicit consent where lawful.
- An employee can withdraw before interviewing or an offer; after that, the application becomes locked and requires employer/admin review.
- AI can recommend, summarize and explain. It cannot publish, reject, suspend, hire, or change an offer without a human action.

## Operational acceptance criteria

Every write has an actor, tenant, timestamp, reason and audit event. Every high-risk action has a confirmation step. Every export is scoped, logged, and expires. Every reminder is idempotent. Every model response records model version, prompt context class, confidence and fallback reason.
