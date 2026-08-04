# Initial API contract

All endpoints require an access token. Pagination uses `cursor` and `limit`; all write endpoints record an audit event.

## Employee

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/v1/jobs/recommended` | Personalized matches, with explanation factors |
| `PATCH` | `/v1/me/profile` | Update profile, preferences and visibility |
| `POST` | `/v1/jobs/:jobId/applications` | Submit an application |
| `GET` | `/v1/me/applications` | Track application status |
| `GET` | `/v1/me/trust-profile` | View data visible to employers |
| `POST` | `/v1/feedback/:feedbackId/disputes` | Challenge feedback |

## Employer

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v1/companies/:companyId/jobs` | Create vacancy |
| `GET` | `/v1/jobs/:jobId/candidates` | Ranked candidates with visible reasons |
| `PATCH` | `/v1/applications/:applicationId` | Update human-reviewed workflow status |
| `GET` | `/v1/companies/:companyId/trust-profile` | Employer trust indicators |

## Example recommendation response

```json
{
  "jobId": "job_123",
  "score": 96,
  "confidence": 0.88,
  "factors": [
    { "label": "Figma and design-system experience", "weight": "strong" },
    { "label": "Prefers hybrid work in Kuala Lumpur", "weight": "strong" },
    { "label": "Two required skills need confirmation", "weight": "review" }
  ],
  "modelVersion": "matching-2026-08-01",
  "notice": "This recommendation supports human review and does not determine eligibility."
}
```

## Authorization rules

- Employees can access only their own profile, recommendations, applications and feedback response.
- Recruiters access candidates only for a job in their verified company and only fields consented for hiring.
- Platform admins use separate, audited moderation roles; they cannot silently alter feedback.
