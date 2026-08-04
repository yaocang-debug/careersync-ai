# Render deployment

1. Push this folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render reads `render.yaml`, creates the web service and PostgreSQL database, and provides the public URL.
4. Add the Gemini, SendGrid, and Twilio secrets in the Render Environment tab.
5. Set `DATABASE_URL` to the Render PostgreSQL connection string after migrating the JSON data to PostgreSQL.

The health check is `/api/health`. The local JSON store is suitable for demonstration only; production deployment should run the migration in `docs/migrations/001_production_foundation.sql` before accepting real users.
