# Evidence-first review and company recommendations

The applicant interface replaces `/100` scores with actual requirement checks.
Legacy numerical fields remain in the original comparison API for compatibility;
they are not interview probabilities and are no longer shown in the applicant UI.

## Visual requirement badges

The role review and CV-ranked job cards include **What they're looking for**.
Each badge shows found, listed only, related evidence or not shown in this CV.
Actions that establish a capability count even without its keyword. A skill
name alone stays listed, including in Gemini-assisted reports. Selecting a badge
opens its exact advert source, CV passage and factual next step. Missing skills
open the relevant recommendation, including when multiple skills share one
advert sentence. Update CV opens the existing input controls. Long lists use
progressive disclosure and badges wrap on phones. Status text accompanies icons.

## CV first

`POST /api/cvs/review` accepts CV text and an optional advert. Without an advert,
the local engine identifies named skills, work examples and a reviewed set of
activity-based capabilities. For example, querying PostgreSQL can establish SQL,
and creating dashboards can establish data visualisation. It does not identify
an unmentioned branded tool such as Tableau from generic dashboard work.

Demonstrated work takes precedence over an earlier skills list. Listed skills,
activity-inferred capabilities, related passages and missing evidence are shown
separately. Negative/learning statements do not establish proficiency. Education
duration is not treated as professional experience. Written-out years are parsed.
CV evidence has a verbatim quotation and a line in the extracted text preview.

## Exact edits

Recommendations name the preview line and action: replace, delete, clarify or
check. Spelling fixes, repeated words and duty-statement rewrites show the exact
before and replacement text. Obvious generic filler and adjacent duplicate work
lines can be removed individually, with undo. Unrelated experience is not removed
merely for lacking a job keyword.

Where facts are missing, a three-field builder asks what the applicant did, the
tool actually used in that specific work, and its real purpose/outcome. Its preview
uses only those inputs. A skills-list recommendation preserves the list and adds
the applicant's example under Projects; other examples replace the selected
passage. Uploaded PDF/DOCX files are not rewritten.

## Job matching

With CV text, a role keyword is optional. The backend compares connected public
listings with CV evidence, filters location and selected career stage, and checks
each advert's requested skills. Alternative skills count as one requirement.
Role-family filtering prevents a data-project CV from becoming a sales shortlist
because it mentions sales data. Student mode excludes senior titles, unestablished
three-plus-year requirements and explicitly expert requirements. The user can
choose any seniority instead.

Cards show fit labels, counts of core requirements found, exact CV/job excerpts
and further qualification/experience checks. No result is manufactured when CV
evidence is insufficient. Source totals and the number of relevant adverts whose
requirements were compared are separate. This covers configured public feeds,
not every company/platform. Sponsorship policies are assessed separately and
cannot establish personal eligibility. Selecting a role opens a full CV comparison.

CV text is held in React session memory for navigation from review to jobs. It is
not placed in local storage. Reloading the site clears that CV session. Saved job
links/notes continue to use the existing separate browser board.

## Optional Gemini

The local `/connections/` page accepts a Gemini API key in a password input and
sends it only to the local backend. A synthetic JSON review verifies the same schema used by real reviews. The key
stays in backend process memory, is not returned to the browser or written to
files/logs, and is cleared by disconnect/restart. Public-demo mode rejects key
configuration. Requests from other browser origins are rejected.

Gemini document review requires `provider=gemini` and `external_ai_consent=true`.
The frontend requires an explicit checkbox. Local review remains available.
The generateContent REST integration uses `store=false`, bounded output, structured JSON,
verbatim source validation and conservative rewrite guards. New metrics and
unproven tool names are not automatically inserted. Unclear edits become questions.
Google's own retention/training and billing terms still apply; `store=false` is
not a promise that free-tier data is excluded from product improvement.

Gemini Plus app benefits do not replace developer API access. Select a Free Tier
project in AI Studio for free-tier testing and verify your project's quota/billing.
CareerPilot does not enable billing and cannot determine a key's billing tier.
Live Gemini review is not claimed verified until the user connects a valid key.
The integration's transport, privacy, consent and invalid-output tests use mocks.

Connection failures distinguish invalid/blocked keys, project access, quota,
model availability, rejected request parameters, Google outages and local
network timeouts. Google may return an invalid key as HTTP 400 in an RPC error
array; this is handled as a key error, rather than a generic model error.
Only an allowlisted code, HTTP status and our own instructions reach the UI.
The latest sanitized connection error is available in `/api/ai/status` until
successful connection, disconnect or restart. Provider messages, key values,
project identifiers and document text are never included. Pasted surrounding
whitespace is trimmed; embedded whitespace is rejected before a network call.
Exposed keys must be replaced in AI Studio; enter replacements only in the
local form. See Google's [error reference](https://ai.google.dev/gemini-api/docs/api-errors).

The synthetic check uses `thinkingConfig.thinkingLevel=LOW` and a 1,024-token ceiling including
thought tokens. Both connection and review use the same inline JSON schema;
length and item limits remain enforced by Pydantic after generation. The default
model is Gemini 3.5 Flash-Lite, with local choices for 3.7/3.8 Flash. A transient
500/502/503/504 gets at most one retry; key, billing, quota and timeout errors do not. The transport test guards these settings against
regression. See the [model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
and [thinking token limits](https://ai.google.dev/gemini-api/docs/thought-signatures).

Official references: [API keys](https://ai.google.dev/gemini-api/docs/api-key),
[pricing](https://ai.google.dev/gemini-api/docs/pricing),
[structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[generateContent REST](https://ai.google.dev/api/generate-content).

## Student platforms

Connections includes official LinkedIn and Indeed links and the
[ARU Handshake route](https://aru.joinhandshake.com/) verified against
[ARU's careers guidance](https://www.aru.ac.uk/student-life/support-and-facilities/careers-and-employability/find-work-and-develop-skills/gaining-graduate-employment).
These are external sign-ins, not fake account-sync connections. Private adverts
can be copied into CV review by their authorised viewer. LinkedIn/Indeed APIs
need approved access; Handshake restricts API access to career-services partners.

## Verification on 27 October 2026

The backend suite passed 231 tests with the cached local model enabled. The
browser suite passed 50 tests, including CV-only analysis, exact deletion/undo,
factual line building, shared CV-to-job flow, evidence instead of arbitrary scores,
Gemini key non-persistence, cloud consent and mobile platform links. ESLint,
TypeScript and the local production build passed. Screenshots were inspected.
A live browser-to-backend-to-Google probe with an invalid synthetic key verified
the HTTP 400 RPC-array diagnosis and cleared input. A subsequent user connection
passed the real synthetic inference check (`configured=true`, `verified=true`).
However, three live synthetic CV reviews produced one provider timeout and two
Google HTTP 503 errors. A completed live Gemini CV review remains unverified.
The key is kept connected; no restart or key extraction was used for these tests.
Those attempts preceded the compact generateContent transport. Its live structured review remains to be verified. Provider error/retry cases also have automated tests. The hosted frontend export passed access/session/header, lock, secret non-persistence and mobile checks with synthetic responses.

A synthetic student-CV live probe checked 2,123 public listings across twelve
available feeds. After filtering it compared seventeen relevant adverts and
returned one reporting/data role with explicitly partial evidence and gaps.
This is a point-in-time diagnostic, not a claim about the user's actual CV,
exhaustive platform coverage, current availability or interview likelihood.
