# Applicant-focused CV review

This documents the earlier highlighted-review milestone. The current local
workflow uses [evidence-first review](evidence-review.md), CV-only analysis,
exact line edits and deletions, and optional consent-based Gemini assistance.
That newer workflow supersedes the score display described below.

The screen now has one action: upload a CV, paste the job advert, and click
**Analyse my CV**. Extraction is automatic. Results show the CV on the left and
recommendations on the right. A simple CV-to-role score is visible, with an
explicit explanation that it is not an interview prediction. Model names,
rule credits, formula details, and settings stay out of the applicant screen.
Before/after panels show the selected passage and a structure to fill with
the applicant's own facts. Detailed instructions are collapsed by default.

## Recommendations and highlights

- Amber highlights identify passages that could better explain the applicant's
  experience. The selected recommendation names the CV section, shows the
  current passage, gives concrete numbered steps and an optional writing structure.
- Pink highlights identify common dictionary typos and selected adjacent repeated
  words. The recommendation shows the original and proposed replacement, with
  **Apply change**. These checks are deliberately limited, not a complete spelling
  or grammar engine. Legitimate repetitions such as “had had” are excluded.
- A skill listed without a clear work/project example prompts the applicant to
  show how they actually used it. Skills from one list are grouped into one edit.
- Strong supporting work examples are tucked under **Already clear in your CV**.
- Missing skills, years, qualifications and other unproven requirements are
  separate checks. They have no invented highlight or automatic replacement.
  Instructions say to add them only when the applicant can support the claim.
- Writing structures contain bracketed prompts, not invented accomplishments.
  Applicant-authored passage edits cannot be submitted with bracketed prompts
  still present. Generic headings are excluded from supporting evidence.

`backend/cv_review.py` builds the plan deterministically from the existing match
results and original CV. `MatchReport.review` adds `changes`, `gaps`, `covered`
and plain-language `notices`; the existing matching API remains compatible.
Up to 40 changes are shown per review, with a notice to fix and recheck if capped.
Requirement extraction and local model limitations from Milestone 2 still apply.

Each anchored edit includes its exact excerpt and UTF-16 start/end offsets to
match JavaScript indexing, including CVs containing emoji/non-BMP characters.
The browser checks that every excerpt equals the original slice before rendering
or editing. Overlapping ranges are segmented rather than duplicating CV text.
Repeated typo occurrences get separate offsets.

## Editing behavior

**Apply change** replaces only the highlighted typo or repeated word. **Edit this
passage** opens the actual current text for the applicant to revise. Changes are
sent to the local comparison API for a new review before committing them to
the preview, preventing stale offsets. A failed request leaves the old preview
and undo history intact. **Undo last edit** rechecks the previous text; history
is limited to ten entries and is not persisted.

Edits affect the browser's text preview only. The original PDF/DOCX formatting
and file are not modified. **Copy text** uses the browser Clipboard API, with a
fallback instruction if clipboard access fails. The screen tells the applicant
to transfer changes to their original document before applying.

Only one recommendation is expanded at a time. Input controls collapse after
analysis; **Change CV or job** reopens them. Edits to input invalidate the review.
Loading requests can be cancelled, stale responses are ignored, and mobile
highlights scroll to the corresponding recommendation.

No new paid service, external CV transfer, document persistence, or dependency
was added. Continue to use synthetic CVs for this local demo.

## Verified on 27 October 2026

- Backend suite with the real cached model enabled: **126 passed**. New cases
  cover grouped, specific instructions; missing evidence; strong existing
  examples; section attribution; precise typo/repetition fixes; repeated typo
  locations; UTF-16 offsets after emoji; and the annotation cap.
- Production browser suite: **26 passed**, with actual local-model comparison
  required. It covers one-action PDF/DOCX analysis, upload failure regressions,
  absence of technical scoring text, clicking highlights, practical instructions,
  applying and undoing a spelling fix after emoji, applicant-authored passage
  edits, rejecting bracket prompts, separate gaps, cancellation, stale-result
  invalidation, malformed offsets, and mobile layout. A failed edit was verified
  to preserve the original text and allow retry.
- ESLint, TypeScript checks and the production build passed.
- Initial, spelling, detailed-recommendation and mobile screenshots were inspected.
  No browser page errors or horizontal overflow were observed.
- Frontend returned HTTP 200, health returned `{"status":"ok"}`, and application
  logs were checked for submitted synthetic CV text and tracebacks; none found.
- Both services are left running on loopback ports 3000 and 8000.

The existing upstream Starlette/httpx test-client deprecation warning remains.
The later public-preview release is documented in [deployment.md](deployment.md).
No real CV data or secrets are included.
