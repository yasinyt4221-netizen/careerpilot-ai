# Public preview and job discovery

The public repository is
[yasinyt4221-netizen/careerpilot-ai](https://github.com/yasinyt4221-netizen/careerpilot-ai).
The Pages URL is <https://yasinyt4221-netizen.github.io/careerpilot-ai/>.
GitHub Actions tests and publishes pushes to `main`, manual runs, and a daily
06:15 UTC refresh. A failed build leaves the previous deployment in place.

## What the public release does

- Home page based on the supplied design, with working navigation and preview tabs.
- A synthetic CV with a computed alignment score, clickable highlights,
  visual before/after structures, precise typo changes, and undo.
- A dated snapshot of public job feeds. Role/country/sponsorship filters run
  in the browser. Original adverts and source dates are linked.
- A dashboard, persistent browser application board, job notes and next-action
  dates, CSV export, interview practice and downloadable factual drafts. See
  [showcase.md](showcase.md) for the expanded release.

GitHub Pages serves static files; it cannot run FastAPI. Public CV upload and
personal reanalysis are disabled. Sample edits stay in the browser and do not
recalculate the sample score. Locally, uploads and every applied edit use the
real backend and recheck the score. Neither version rewrites the original file.

`prepare_public_preview.py` generates ignored `frontend/public/sample-review.json`
and `jobs-feed.json` from synthetic text and public listings during the build.
Generated job data, model binaries, local environments, and CVs are not committed.
The feed date is shown in results; verify availability in the original advert.

## Job coverage and ranking

`backend/jobs_catalog.json` configures nine direct company boards: Monzo, Wise,
Canonical, Deliveroo, Cloudflare, Datadog, Spotify, Linear, and Notion, using
[Greenhouse](https://docs.greenhouse.io/job-board.html),
[Lever](https://github.com/lever/postings-api), and
[Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api).
Additional feeds use the current public
[Arbeitnow UK/Europe API pages](https://www.arbeitnow.com/blog/job-board-api)
and [Remotive](https://remotive.com/remote-jobs/api).
Remotive listings are attributed, link back to Remotive, are at least 24 hours
delayed, and use a six-hour cache. This is not an exhaustive search of all
companies or platforms. LinkedIn and Indeed buttons open separate searches;
their listings are not imported or counted.

`POST /api/jobs/search` accepts role keywords, country, optional visa description,
stated sponsorship need, optional CV text, and a result limit. The local version
compares advertised skills with explicit CV skills. Ranking considers stated
sponsorship needs, title relevance, and skill overlap. It does not determine the
best employer or predict interviews. The static preview has no personal skill score.

UK licence evidence uses exact configured legal-entity matches against the
[official sponsor register](https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers).
Unavailable or more-than-seven-day-old register downloads are not accepted by
the backend. A licence is not an offer of sponsorship for a particular role.
Advert exclusions override positive licence evidence. Other countries do not
receive UK licence checks. Entering a visa name does not establish eligibility;
role, salary, permission conditions, and current rules still require verification.
The UI links to [official Skilled Worker guidance](https://www.gov.uk/skilled-worker-visa).

## Separate backend hosting

`render.yaml` prepares a free FastAPI service. It has not been deployed by the
local setup. Connect the repository to Render and review its build logs before
setting the repository variable `CAREERPILOT_API_URL` to its HTTPS URL and
rerunning the Pages workflow. The blueprint defaults to `PUBLIC_DEMO_ONLY=true`:
document extraction and personal CV matching are rejected server-side as well
as disabled in the public frontend. Public job searches can then use live feeds.

Authentication, private storage/RLS, retention/deletion controls, and privacy
disclosures are required before opening personal CV processing. Do not switch
off the public-demo guards as a substitute for those controls. No paid AI API
or secret is required by the current release.

## Verification on 27 October 2026

- Backend: 144 tests passed, including the real cached local model with network
  access blocked, public-demo restrictions, source adapters, sponsorship
  interpretation, ranking, and original document-upload regressions.
- Applicant browser suite: 39 tests passed in the expanded showcase release.
- ESLint, TypeScript, and the static production build passed.
- The exported site was exercised at its `/careerpilot-ai` base path: sample
  review, highlights, apply/undo, dated job results, saving jobs, persistent
  application stages, the tour, preparation drafts, desktop/mobile navigation,
  no horizontal overflow, no page errors, and no document POSTs.
- The live feed probe returned 2,121 URL-deduplicated listings across the twelve
  configured feeds. That is a point-in-time observation, not a coverage promise.

Run `npm run test:public-preview` in `frontend` against an exported site served
at `http://127.0.0.1:3100/careerpilot-ai/`. Set `RELEASE_URL` to exercise a deployed
URL. The Actions workflow runs this smoke check before publishing.
