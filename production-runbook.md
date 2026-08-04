# CareerSync production runbook

## 1. Start PostgreSQL

```powershell
docker compose up -d postgres
```

Set a real password in `docker-compose.yml` or use a secret manager. Never use the sample password outside local development.

## 2. Apply migrations

Run `docs/migrations/001_production_foundation.sql` through a migration runner against `DATABASE_URL`. The migration is intentionally separate from the local JSON MVP so rollback and review remain possible.

## 3. Configure providers

- Email: configure a transactional provider for verification, password reset, interview reminders, and offers.
- SMS: configure a provider for phone verification and login codes.
- Storage: configure a private bucket for profile photos, resumes, certificates, and portfolios. Return short-lived signed URLs only.
- Gemini: set `GEMINI_API_KEY` on the server. Never put it in frontend code.

## 4. Production gates before public access

- Replace in-memory sessions and rate-limit maps with Redis/PostgreSQL-backed state.
- Require authenticated role and company-scope checks on every admin/recruiter endpoint.
- Add CSRF protection, secure cookies, HTTPS, request validation, and structured audit logging.
- Enable database backups and perform a restore drill.
- Add error tracking, metrics, uptime checks, and alert routing.
- Run security, accessibility, load, and model-safety tests in CI.

## 5. Data migration

Export `data/store.json` only once into a reviewed import script. Do not copy password hashes or profile images into a public bucket. Validate every imported company, user, job and application before enabling writes.
