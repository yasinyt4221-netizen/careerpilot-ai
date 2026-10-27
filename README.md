# CareerPilot AI

A CV workspace with a separate Next.js frontend and FastAPI backend. The home
page follows the supplied emerald-and-white design. The workspace extracts
PDF/DOCX text, shows a simple role-alignment score, and highlights passages
with visual before/after suggestions. Formula details stay out of the applicant
screen. Missing evidence is shown separately; achievements are never invented.

Public source: [careerpilot-ai](https://github.com/yasinyt4221-netizen/careerpilot-ai).
The GitHub Pages workflow publishes a **sample-only preview** at
[CareerPilot AI](https://yasinyt4221-netizen.github.io/careerpilot-ai/).
Check the workflow status before assuming a particular commit is deployed.
Personal document upload is disabled in that preview. Full extraction and
reanalysis run locally using the setup below.

## Show it to a friend

Open the [demo workspace](https://yasinyt4221-netizen.github.io/careerpilot-ai/dashboard/).
Try a sample CV review, find and save a public job, move it across the application
board, then prepare an interview answer or download an application draft.
**Show me around** opens a short tour. **Load example board** adds clearly
labelled fictional roles without replacing saved real jobs.

- `/dashboard/`: actual board counts, next-action dates and a sample CV preview.
- `/workspace/`: highlighted CV edits, undo, text download and print review.
- `/jobs/`: public listings, sponsorship evidence and save-to-board controls.
- `/applications/`: board/list views, stages, notes, dates, manual job links and CSV export.
- `/prepare/`: role-based practice prompts, a STAR answer builder, cover-letter
  drafts and follow-up email drafts made from entered facts.
- `/help/`: demo limitations, browser storage, export and deletion controls.

Saved roles use this browser's local storage; there is no account or cross-device
sync. Drafts and CV text are not persisted by the app. Blocked storage falls
back to tab-only state with an explicit message. No application or email is sent.
See [showcase notes](docs/showcase.md) for research, behavior and verification.

## Requirements

- Node.js 20.9+ and npm (verified locally with Node 24).
- Python 3.11+ (verified locally with Python 3.14).
- Two terminals for development. No AI API key or database is required.

## Setup and run

Start in the repository root (`Y:\Websites\JobHelper` in this workspace).

### Backend — terminal 1

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe prepare_semantic_model.py
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

macOS/Linux: use `.venv/bin/python` instead of `.\.venv\Scripts\python.exe`.
`requirements.txt` contains the runtime dependencies;
`requirements-dev.txt` adds pytest and the API test client.
`requirements-lock.txt` records all packages in the verified Windows environment
and can be installed instead for an exact development dependency set.

`prepare_semantic_model.py` downloads public model files once into the ignored
`backend/.models/` directory. No account, paid service, or API token is required.
Request handling loads only cached files and embeds document text locally.
Without the prepared model, comparison still works in clearly labelled
**rules-only** mode. Restart the backend after preparing/changing the model.

- Health: <http://127.0.0.1:8000/api/health>
- API docs: <http://127.0.0.1:8000/docs>

### Frontend — terminal 2

```powershell
cd frontend
npm ci
Copy-Item .env.local.example .env.local
npm run dev
```

macOS/Linux: use `cp .env.local.example .env.local` for the copy command.
Open <http://localhost:3000>. The server binds to the loopback interface.
Open **My workspace**, choose a synthetic PDF or DOCX, paste the job advert,
then click **Analyse my CV**.
Extraction and review happen together. Click a highlighted passage to see
what to change and where. **Apply change** accepts a precise spelling/repeated-word
fix; **Edit this passage** lets the applicant supply their own revised wording.
The preview is rechecked after each change, and the last ten edits can be undone.
Copy the reviewed text into the original CV; the uploaded PDF/DOCX is not rewritten.
Changing either input clears the old review; replacing the CV preserves the advert.
See [the applicant review notes](docs/applicant-review.md) for scope and limitations.

The optional `frontend/.env.local` sets:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

This is also the default. Restart the frontend after changing it; rebuild for
production because `NEXT_PUBLIC_` values are embedded in the browser bundle.
The API URL is public configuration: never put secrets in `NEXT_PUBLIC_` values.

The backend permits `http://localhost:3000` and `http://127.0.0.1:3000` by default.
For another frontend port, set `CORS_ORIGINS` in the backend terminal before
starting Uvicorn, for example:

```powershell
$env:CORS_ORIGINS = 'http://localhost:3001,http://127.0.0.1:3001'
```

`backend/.env.example` documents this setting; it is not loaded automatically.
Keep both services on their configured ports, or update their settings together.

## Automated checks

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pip check
```

To also exercise the real cached embedding model with network access blocked:

```powershell
$env:RUN_SEMANTIC_TESTS = '1'
.\.venv\Scripts\python.exe -m pytest -q
```

The standard suite uses deterministic embedding test doubles for arithmetic
and error cases; the opt-in test requires the model preparation step above.
On macOS/Linux use `RUN_SEMANTIC_TESTS=1 .venv/bin/python -m pytest -q`.

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Set `$env:REQUIRE_HYBRID = '1'` before browser tests to require real hybrid
matching, rather than allowing the documented rules-only fallback.

Playwright generates synthetic documents automatically, starts any missing
local services, and tests real browser-to-backend uploads. If services are
already running on ports 3000/8000, it reuses them. `CAREERPILOT_PYTHON` can
override the default backend virtualenv interpreter path. In CI, occupied ports
are treated as an error to prevent accidentally testing an unrelated service.

To try the production frontend, stop the development frontend and run
`npm run build` followed by `npm start`. The backend stays separate.

## API

`POST /api/cvs/extract` accepts multipart form data with one `file` field.
A successful response contains:

```json
{
  "filename": "synthetic.pdf",
  "extracted_text": "Python SQL",
  "word_count": 2,
  "character_count": 10
}
```

Invalid uploads return a JSON `detail` message: 400 for invalid documents,
413 for size limits, and 422 for a missing file. The frontend shows errors
and supports retrying without a page refresh.

`POST /api/jobs/analyse` accepts `{"job_description":"..."}` and returns
requirements with priorities and source excerpts.

`POST /api/matches/compare` accepts:

```json
{
  "cv_text": "Extracted CV text...",
  "job_description": "The job advert, at least 30 characters...",
  "settings": { "rules_weight": 0.6, "semantic_weight": 0.4, "related_threshold": 0.5 }
}
```

It returns per-requirement evidence, explicit/related/not-found statuses,
score components, requested/effective settings, model/mode, and limitations.
Its `review` field contains applicant recommendations, missing-requirement checks,
covered requirements, and browser-compatible UTF-16 highlight offsets. The
applicant interface renders that practical review, a simple alignment score,
and the role title. The score is not an interview or hiring prediction.
Weights must total 1. Required requirements weigh 2, unspecified 1, preferred
0.5. Default overall weighting is 60% rules and 40% semantic similarity;
these settings are available through the API only. Rules-only fallback uses 100% rules.
These are unvalidated text-alignment heuristics, not hiring probabilities.
No identifiable requirements means no score. See
[analysis and matching notes](docs/milestone-2.md) for exact scoring and limits.

## Limits and privacy

- PDF or DOCX, at most 5 MiB per file; PDFs at most 30 pages.
- DOCX cached page counts and explicit page breaks are limited to 30. Exact
  DOCX pagination requires a renderer and is not established by this parser.
- Scanned/image-only PDFs need OCR, which is not included. Password-protected
  and damaged documents are rejected.
- Document tables, nested tables, headers, and footers are included where
  available; complex layouts may have imperfect reading order.
- ZIP expansion and text limits protect the local parser. See
  [Milestone 1 notes](docs/milestone-1.md) for the limits and architecture.
- No document persistence or external AI service calls are implemented.
  Multipart handling can use temporary files, which are closed after parsing.
  CV text is displayed in the browser session and is not written to app logs.
- Matching accepts up to 50,000 CV characters (400 excerpts), 20,000 advert
  characters, and 80 extracted requirements. The analyser uses English rules
  and a curated skill catalogue; review sources for missed/ambiguous wording.
- Semantic similarity suggests related evidence; it does not verify experience,
  qualifications, or proficiency. Missing years/degree/credential requirements
  receive no semantic score credit. Suggestions never invent CV achievements.
- Use synthetic documents only. Authentication, Supabase RLS, private storage,
  retention/deletion controls, and privacy disclosures are needed before real use.
- `.env` files, local environments, test fixtures, and test outputs are ignored.
  No secrets or real CVs belong in this repository.

## Repository layout

```text
frontend/              Next.js App Router, TypeScript, Tailwind, Playwright
backend/               FastAPI, local parsers, pytest
database/schema.sql    Proposed schema only; not connected
docs/milestone-1.md     Implementation boundaries and verification guidance
docs/milestone-2.md     Job analysis, local model setup, scoring and evaluation
docs/applicant-review.md Highlighted review, practical instructions and text edits
CODEX_INSTRUCTIONS.md  Original project guidance
```

Remaining: expand/evaluate requirement extraction and matching, then add
authentication, private persistence, retention/deletion controls, and deployment
hardening before handling real users' CVs.
