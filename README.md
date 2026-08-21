# Pyramid Backend

A NestJS application with PostgreSQL (Prisma) providing a REST API for task management, authentication, and real‑time updates.

## Authentication Logic

The backend issues **JWT access tokens** (15‑min expiry) and **refresh tokens** (7‑day expiry). Tokens are signed with separate secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`). The refresh token is stored in an `httpOnly` cookie (secure, `SameSite=None` for cross‑site) and also returned in the JSON response to allow the frontend to mirror it on its own domain. The cookie is sent only to `/auth/refresh`. On refresh, the backend validates the token, issues new `accessToken` and `refreshToken`, and sets a new cookie.

## Guest Cleanup

A cron job runs every 10 minutes, deleting expired guest accounts and their orphaned Cloudinary assets (projects, tasks, attachments) – with `Cascade` deletes on `Project.owner` to avoid foreign‑key conflicts.

## Data Model Highlights

- Tasks belong to projects or stand‑alone; subtasks are self‑referenced.
- Members and watchers per task/project.
- Comments with reactions, pinning, and mentions.
- Activities track all changes for the update feed.

## API Endpoints

All protected routes require Bearer token. Swagger documentation is available at `/api/docs`.

## Setup

```bash
# Install dependencies
npm install

# Create .env with:
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
GOOGLE_CLIENT_ID=...
CLOUDINARY_...=...
FRONTEND_URL=https://your-frontend.vercel.app

# Run migrations
npx prisma migrate dev

# Start development
npm run start:dev
```

Deploy to Render with environment variables set; the `refresh` cookie path and `secure: true` ensure proper cross‑site communication.
