# Source Approval Record

ScholarTrack does not treat a public URL as permission to collect it. No real sources are pre-approved in this starter project. The two `example.org` source rows are placeholders and are never requested.

## Review Before Registration

For each source, record:

| Review field | Required evidence |
| --- | --- |
| Owner and official URL | The organization that publishes the announcement and the exact listing/feed URL |
| Access permission | Terms of use, public-data conditions, written permission if required, and review date |
| Robots policy | `robots.txt` response, matching user-agent decision, and any crawl-delay guidance |
| Collection method | Prefer an official API or RSS/Atom feed; otherwise document the approved HTML selectors |
| Data fields | Only public notice fields needed by ScholarTrack; never private applicant data |
| Schedule and rate limit | Refresh interval, per-host delay, timeout, retry ceiling, and contact details |
| Retention and attribution | Original source URL, capture time, citation behavior, and source-specific retention limits |
| Risks and fallback | Layout changes, access denial, stale cache behavior, manual review, and an approved alternative |
| Decision | Reviewer, approval date, conditions, and next review date |

## Source Register

| Candidate | URL | Status | Reason |
| --- | --- | --- | --- |
| Example source A | `https://example.org/source-a` | Not approved | Placeholder URL; no review performed |
| Example source B | `https://example.org/source-b` | Not approved | Placeholder URL; no review performed |
| National Scholarship Portal (NSP) | `https://scholarships.gov.in/All-Scholarships` | Candidate; not registered or approved | Public scheme-list adapter is available; complete the source-rights review before enabling collection |

## Operational Policy

- Keep `ENABLE_PUBLIC_SCRAPING=false` until a reviewer has completed this record and registered an approved source.
- The admin source form requires an explicit rights and crawl-policy confirmation and an HTTPS URL. Adding a source does not contact it.
- Collection checks `robots.txt` before fetching the configured URL. A denied or unavailable robots policy is logged as a failed run; there is no login, CAPTCHA, or access-control bypass.
- Each page request has a timeout, bounded exponential retry, and a descriptive user agent. Multiple approved sources are separated by a delay; scheduled runs do not overlap.
- Prefer official API/RSS when offered. If no permitted machine-readable route exists, use manual curation instead of scraping.
- The NSP adapter reads only the public `All-Scholarships` scheme listing and its public specifications links. It does not access student login, application, payment, or status routes. Register and approve it only after reviewing the portal's terms and collection policy.
- Preserve the original URL and capture/verification timestamps. Keep unknown deadlines `NULL`; show stale cached records as stale.
- Re-review permission and selectors when terms, robots rules, or page structure change. Remove approval and disable collection if permission becomes unclear.