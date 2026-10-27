# Job-description analysis and hybrid matching

The applicant interface has since been simplified to a single analysis action
and highlighted CV review. Scores, weighting controls and model details are no
longer shown in the interface. See [applicant review](applicant-review.md).

## Implemented

The browser now supports extraction → job advert → requirement analysis → CV
comparison. The frontend and backend remain separate. No paid AI dependency,
LLM API, authentication, or database has been added.

- `backend/job_analyser.py`: English rules extract catalogue skills/aliases,
  explicit numeric years, degree/recognised field, qualification statements,
  responsibilities, and otherwise unrecognised requirements in relevant sections.
  Every item retains its source wording, category, and required/preferred/
  unspecified priority. Duplicated skill mentions use the strongest priority.
  Simple alternatives such as “Python or Java” form one skill requirement.
  Benefits/about-company sections and explicitly non-required clauses are excluded.
- `backend/skills_catalog.py`: the editable skill catalogue and conservative
  matching boundaries for Java/JavaScript, SQL/MySQL, C++, C#, .NET, etc.
- `backend/matching.py`: explicit checks, verbatim CV evidence, related evidence,
  weighted scores, configurable settings, and grounded review suggestions.
- `backend/semantic.py`: CPU-only FastEmbed with the MiniLM sentence embedding
  model. It loads cached files with `local_files_only=True`; no document text
  is sent over the network and no embeddings/documents are persisted.
- `frontend/app/page.tsx` and `components/cv-review.tsx`: one analysis action,
  highlighted CV preview, practical recommendations, separate gaps and safe
  applicant edits. Input changes clear old results and preserve the advert.
- JSON validation errors omit Pydantic's echoed input values to avoid exposing
  submitted CV text in diagnostics.

## Local model setup

Install `backend/requirements-dev.txt`, then run from `backend/`:

```powershell
.\.venv\Scripts\python.exe prepare_semantic_model.py
```

The script downloads public model files and performs a synthetic readiness
check. It never accepts a CV. Cache: `backend/.models/` (ignored). Override with
`CAREERPILOT_MODEL_CACHE` before preparing and launching the backend. Set
`SEMANTIC_ENABLED=false` before launch to use rules only deliberately.
Model failure/unavailability produces an explicit rules-only report, never a
fabricated semantic score. Restart the backend after changing model settings.

Model: `sentence-transformers/all-MiniLM-L6-v2`, 384-dimensional English sentence
embeddings, running through FastEmbed's supported ONNX model. References:
[model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2),
[FastEmbed documentation](https://qdrant.tech/documentation/embeddings/fastembed/),
[local-only loading API](https://github.com/qdrant/fastembed/blob/main/fastembed/text/text_embedding.py).

## What a match means

- **Explicit match**: the CV includes a recognised skill/alias, sufficient
  explicit numeric years in scope, a degree level/recognised field, or matching
  requirement wording. A text mention is not verified proficiency or a verified
  credential. Negated/learning-only evidence is excluded where recognised.
- **Related evidence**: no explicit rule match, but a CV excerpt exceeds the
  configured semantic threshold (default cosine 0.5). This is a review prompt;
  it never changes a requirement into an explicit match.
- **Not found in CV**: no supporting text was found. This does not mean the
  person lacks that skill. Suggestions ask for truthful evidence only, and never
  generate employers, achievements, credentials, or invented examples.

Dates, job durations, overlapping roles, numerical achievements and proficiency
are not inferred. Ambiguous multiple years claims in a single excerpt are left
for review. Degree alternatives and certifications/licences receive a separate
qualification check; simply mentioning AWS does not establish AWS certification.

## Exact score

Each requirement has priority weight `p`: required 2, unspecified 1, preferred
0.5. Each explicit match has `r=1`, otherwise `r=0`. For each requirement, the
largest non-negative cosine to an acceptable CV excerpt gives semantic credit
`s`. Unproven years, degree and credential requirements have `s=0` even when a
related excerpt is shown. Excerpts with recognised negation/learning-only claims
about the requested skill are excluded.

```text
rules_score    = 100 × sum(p × r) / sum(p)
semantic_score = 100 × sum(p × s) / sum(p)
overall_score  = rules_weight × rules_score + semantic_weight × semantic_score
```

Per-excerpt semantic credit is rounded to four decimals before aggregation;
displayed scores are rounded to one decimal. Default weights are 0.6/0.4,
configurable through the API; both must be finite and sum to 1.
The API also accepts `related_threshold` from 0.25 through 0.95. Fallback uses
effective weights 1/0 and returns a null semantic score. No requirements means
all scores are null. There is no hiring likelihood or validated hiring predictor.
The weights, threshold, and raw-cosine scaling are hypotheses to evaluate.

## Boundaries and remaining evaluation

- CV text: 1–50,000 characters and at most 400 contiguous excerpts. Each excerpt
  is at most 240 characters; all accepted excerpts are considered. Long job
  requirement labels use their first 240 characters for the semantic query;
  the full source remains visible. Model/token limits can still lose context.
- Advert: 30–20,000 characters; maximum 80 extracted requirements. Oversize
  inputs are rejected rather than silently truncating the document.
- This is a curated English rules parser. Unsupported headings, skills,
  qualifications, field names, complex alternatives, mixed priority sentences,
  negation scope, and unusual wording can be missed or misclassified. Source
  review is essential. Strong priority duplicates and compound responsibilities
  can affect weighting; the score is over extracted items, not every job criterion.
- Exact degrees/years checks deliberately prefer “not established” over inference.
  Qualification equivalences and free-text paraphrases require human review.
- Semantic similarities can be misleading. The threshold and scores have not
  been calibrated on real hiring outcomes or validated for fairness.
- Documents and text remain in local request/browser memory; model files persist
  in the cache. No user-document cache or storage is added. Keep using synthetic
  data until authentication/privacy controls from Milestone 1 are implemented.

Next engineering work: evaluate representative synthetic adverts and CVs,
expand the catalogue and requirement parser, and improve review/correction
controls. Production privacy/authentication and persistence remain separate work.

## Verification — 27 October 2026

- Model preparation downloaded the supported ONNX files and confirmed a
  384-dimensional synthetic embedding.
- `RUN_SEMANTIC_TESTS=1 python -m pytest -q`: **116 passed**. This includes the
  existing parser/upload regressions, analyser cases, exact score arithmetic,
  configurable weights, aliases, alternatives, negation, years/degree/credential
  handling, privacy validation, fallback, API and CORS tests. One existing
  upstream Starlette/httpx adapter deprecation warning remains.
- The real model integration test blocks socket connections and still produces
  a hybrid report with explicit matches, related evidence, and a missing skill.
- `REQUIRE_HYBRID=1 npm run test:e2e`: **25 passed**, against the updated actual
  FastAPI service and production Next.js frontend. The eight new browser cases
  cover advert analysis, hybrid comparison, filters, sources, settings, retries,
  stale responses, input changes, empty requirements, and mobile layout.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- `python -m pip check`: no broken requirements. `npm audit`: zero reported
  frontend dependency vulnerabilities at verification time.
- Desktop/mobile report screenshots were inspected. The synthetic report had
  two explicit matches, one related passage, and one requirement not found.
  No browser page errors or horizontal overflow were observed.
- The actual API returned hybrid mode and the expected model name. Runtime logs
  were checked for submitted synthetic text and tracebacks; neither was found.
- Frontend returned HTTP 200, API health returned `{"status":"ok"}`, and both
  services were left listening on loopback only (ports 3000 and 8000).

Only synthetic documents were used. No secrets or real CV data were added,
and no commits were made. Model files and screenshots remain ignored local
artifacts. The Downloads starter copy is unchanged.
