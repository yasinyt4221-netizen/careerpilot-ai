# Milestone 1: CV upload and extraction

## Scope

The Next.js browser app sends a multipart `file` field directly to the separate
FastAPI service at `POST /api/cvs/extract`. The service returns the filename,
extracted text, whitespace-separated word count, and Unicode character count.
Extraction uses PyMuPDF and python-docx locally; it requires no AI API key.

## Starter issues addressed

- The frontend had only `app/page.tsx`: package metadata, lockfile, root layout,
  styles, TypeScript, Tailwind/PostCSS, and lint configuration were missing.
- The starter had four parser tests, no PDF tests, API tests, or browser tests.
- Uploaded content needed signature checks, DOCX archive expansion limits,
  request-body limits, and consistent errors.
- Parsing ran inside an async endpoint. It now uses FastAPI's worker thread.
- CORS origins are configurable, and the example frontend environment file is
  allowed through `.gitignore`.

## Validation and boundaries

- Only `.pdf` and `.docx` extensions (case insensitive); signatures and document
  structure must also match. Client MIME types are not trusted as proof.
- 5 MiB per file (shown as 5 MB in the interface). Total multipart requests are
  bounded at 5 MiB plus 256 KiB for headers, including chunked requests.
- PDFs: maximum 30 pages; encrypted, damaged, and textless PDFs are rejected.
  Textless/scanned PDF errors explain the need for OCR. OCR is not implemented.
- DOCX: cached page metadata and explicit page breaks are checked against 30
  pages. **Actual DOCX pagination cannot be established without a renderer**;
  cached metadata may be absent or stale. Tables, nested tables, headers, and
  footers are included. Text boxes and complex layout reading order may vary.
- DOCX archives: maximum 1,000 entries and 20 MiB total uncompressed content.
  Duplicate entries and encrypted entries are rejected.
- Text extraction is capped at 500,000 characters to bound response sizes.
- API errors: 400 for invalid documents, 413 for oversized uploads, 422 for a
  missing multipart file. Parser diagnostics are not returned to the browser.
- The browser validates obvious file issues, handles API/network errors,
  prevents duplicate submissions while loading, and clears stale results.
- This remains a local development demo. No accounts, database persistence,
  storage, OCR, job analysis, or matching are implemented. Use synthetic CVs.
  Before real use, add authentication, private storage, Supabase RLS,
  retention/deletion controls, and privacy disclosures.

## Verification

See README for commands. Backend tests generate documents in memory. Browser
tests generate ignored files under `backend/.test-fixtures/` and use the real
frontend and backend for PDF/DOCX success and document validation. Only network
failures and malformed service responses are simulated in browser tests.
The test runner can start both services, or reuse local running services.

Run `npm run build` separately to verify the production bundle, then `npm start`
to run it; the browser suite can also test that running production server.
Playwright screenshots are written only for failing tests and are ignored.

Job-description analysis and hybrid rules/semantic matching are pending the
user's approval after Milestone 1 review.

## Verified on 27 October 2026

Working copy: `Y:\Websites\JobHelper`, copied from the supplied Downloads
starter. The Downloads files were left unchanged.

- Windows, Python 3.14.3, Node 24.15.0, npm 11.12.1.
- `python -m pytest -q`: **54 passed**. One upstream Starlette warning says
  its httpx test-client adapter is deprecated; no tests failed.
- `python -m pip check`: no broken requirements.
- Runtime/development requirements installation and `npm ci`: successful.
- `npm run lint`, `npm run typecheck`, `npm run build`: successful.
- `npm run test:e2e`: **17 passed** against the production Next.js server
  and actual FastAPI service. The earlier 16-test suite also passed against
  the Next.js development server before the additional drag/drop case.
- `npm audit`: zero reported vulnerabilities at verification time.
- Inspected full-page desktop empty/result and mobile result screenshots;
  no clipped content, mobile horizontal overflow, or browser page errors found.
- Health returned `{"status":"ok"}`. Both services were confirmed listening
  on loopback only: frontend port 3000 and backend port 8000.

The screenshots, generated synthetic fixtures, process information, and
runtime logs are local ignored artifacts. No real CV data or secrets were
used, and no commits were made. The application is left running locally.

Development tooling currently pins ESLint 9 because Next's React/import/
accessibility plugins still declare ESLint 9 peer compatibility. npm reports
that ESLint version as deprecated; linting passes. Upgrade that toolchain
together when its plugins declare support for ESLint 10.
