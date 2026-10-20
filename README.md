# ScholarTrack

Scholarship and fellowship deadline tracker with a React/Vite dashboard, Express API, and persistent SQLite database powered by WebAssembly SQLite (no native C++ build required).

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL printed by the dev server (normally `http://localhost:5173`). The API runs at `http://localhost:3001/api`.

For a single-process local production preview, run `npm run build` followed by `npm start`; Express serves the built frontend and API at `http://127.0.0.1:3001`.

The database is created and demo records are seeded automatically at `data/scholartrack.sqlite`. `npm run db:init` initializes the schema without deleting existing records. All seeded opportunities are visibly identified as demo data; they are not scraped or represented as live announcements.

The API binds to `127.0.0.1` by default. Change `HOST` only when intentionally exposing the service; add authentication and authorization before any non-local deployment.

## Sources and collection

Public collection is disabled by default. The source adapter interface supports approved HTML sources with configurable selectors, robots.txt checks, timeouts, bounded retries, rate limiting, and diagnostic run records. Review each source's robots.txt, terms, access permissions, and crawl policy before enabling it. Set `ENABLE_PUBLIC_SCRAPING=true` only after explicit source approval and adapter configuration. The starter source records are unapproved examples and are not contacted by the scheduler.

Use [docs/source-approval.md](docs/source-approval.md) to document source rights, fields, schedule, risks, and alternatives before adding a source in the monitoring page.

Unknown deadlines are stored as SQL `NULL`. Source data can never silently replace an unknown deadline with an invented date. Deadline changes and withdrawals are persisted as history and deduplicated alerts.

## Tests

```powershell
npm test
```

Tests use temporary SQLite databases and HTML fixtures. The test suite does not contact external websites.

## Database

The schema is applied on server start and by `npm run db:init`. SQLite tables cover sources, scholarships, deadline/status history, collection runs, and alerts. Keep the local database out of version control; it is already ignored.

## API overview

- `GET /api/dashboard` - summary counts, deadlines, updates, and refresh freshness
- `GET /api/scholarships` - search, filter, and sort opportunities from all configured sources
- `GET /api/scholarships/filters` - available filter values and sources with scholarship records
- `GET /api/scholarships/:id` - detail and change history
- `GET /api/alerts` - deduplicated alert feed
- `GET /api/admin/status` - sources, refresh history, and errors
- `POST /api/admin/refresh` - manually request a refresh
- `POST /api/admin/retry/:sourceId` - retry one approved source

The Explorer combines notices collected from every configured source and can filter by source, study level, programme, category, discipline, region, notice status, and deadline range. The source monitor includes a dedicated adapter for the National Scholarship Portal's public scheme list at `https://scholarships.gov.in/All-Scholarships`. Add and approve it only after reviewing its access permissions and crawl policy; collection remains disabled until `ENABLE_PUBLIC_SCRAPING=true`. The project does not access student login, application, payment, or status routes.

The admin routes are intended for local development and are not authentication-hardened for public deployment. Add authentication and authorization before exposing them beyond localhost.