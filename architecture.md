# CareerSync AI — Architecture and Roadmap

## Product scope

CareerSync AI connects employees with suitable opportunities and gives employers a structured, explainable applicant shortlist. The product comprises an employee mobile app, employer web portal, admin console, and shared platform services.

## System architecture

```text
Employee mobile app (React Native)     Employer portal / Admin (Next.js)
                 │                                  │
                 └──────────── API gateway ─────────┘
                                      │
       ┌──────────────────────────────┼─────────────────────────────┐
       │              │               │              │               │
 Identity & consent  Profile/jobs  Application   Trust & review  Notifications
       │              │               │              │               │
       └──────────────┴───────────────┴──────────────┴───────────────┘
                                      │
                 PostgreSQL + object storage + audit log
                                      │
             Matching service / feature store / model registry
```

### Suggested stack

| Area | First production choice |
|---|---|
| Web | Next.js, TypeScript, Tailwind, accessible component library |
| Mobile | React Native + Expo, TypeScript |
| API | NestJS or FastAPI, REST/OpenAPI |
| Data | PostgreSQL with `pgvector`; Redis for queues/cache; S3-compatible storage |
| AI | Embedding retrieval plus rules-based eligibility; LLM only for coaching, parsing and explanations |
| Operations | Docker, managed database, Sentry, OpenTelemetry, CI/CD |

## Matching service

The match score is an aid for discovery and recruiter review, not an automatic hiring decision. Score only job-relevant, user-consented information:

```text
match = 0.40 × skills similarity
      + 0.20 × relevant experience
      + 0.15 × location/work-mode fit
      + 0.15 × stated preferences
      + 0.10 × profile completeness / verification
```

1. Parse a job description into required/preferred skills and constraints.
2. Map resume and portfolio evidence to a maintained skills taxonomy.
3. Retrieve candidates/jobs with vector similarity, then apply hard eligibility rules.
4. Produce a score, confidence, and 3–5 human-readable reasons.
5. Log the model/rules version and factors used for every recommendation.
6. Measure acceptance, interview conversion, employer override, and fairness metrics by consented/legally appropriate audit cohorts.

Never include protected attributes, medical information, religion, ethnicity, age, gender, union status, criminal-history assumptions, or inferred personality traits in matching. Do not use a hidden employee “bad record.”

## Trust and reputation design

Use two separate, visible trust profiles—not a single opaque score.

- **Employer:** verification status, offer acceptance, response time, salary transparency, retention, and moderated employee feedback.
- **Employee:** identity/work verification, skills evidence, attendance/reliability feedback only where lawful and relevant, endorsements, and a response/appeal history.
- Feedback must be from a verified relationship, linked to defined categories and evidence where applicable; it should expire or be re-reviewed over time.
- Before any adverse signal is shown, notify the person, allow a response, and route disputes to trained human reviewers. Employers see status and job-relevant context, never raw accusations or medical/criminal data.

## Key user journeys

**Employee:** sign up → consent choices → profile/resume → skills extraction review → match feed → explanation → apply → interview preparation → application updates.

**Employer:** company verification → post structured vacancy → candidate shortlist → open match explanation → human review → interview → outcome + timely feedback.

**Admin:** verify company → moderate reports/disputes → review flagged model outputs → audit access and decisions.

## Delivery roadmap

### Phase 1 — MVP (6–8 weeks)

- Authentication, employee profiles, employer verification and job posting.
- Skills-based search/match prototype, saved jobs, applications, recruiter pipeline.
- Match explanations, consent controls, audit logging and basic moderation.

### Phase 2 — Hiring workflow (4–6 weeks)

- Interview scheduling, notifications, offer workflow and employer analytics.
- Resume feedback, interview practice, multilingual accessibility improvements.
- Verified two-way feedback with review and disputes.

### Phase 3 — Intelligence and scale (ongoing)

- Better skills taxonomy and retrieval evaluation, experiment framework.
- Bias/fairness monitoring, model registry, security review, disaster recovery.
- Mobile native polish and integrations with calendars/ATS providers.

## Success metrics

- Employee: application completion, interview conversion, qualified-match save rate, explanation helpfulness.
- Employer: time to shortlist, time to response, interview-to-offer rate, candidate satisfaction.
- Safety: appeal resolution time, recommendation override rate, report rate, subgroup parity monitoring.
