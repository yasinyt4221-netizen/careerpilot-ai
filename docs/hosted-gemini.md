# Publish the Gemini workspace

The frontend is a static Next.js export on GitHub Pages. FastAPI runs separately
on Render. API keys belong only in Render's private environment settings.
The existing public sample stays live until the backend is configured and checked.

## Backend

Connect the Render plugin in Codex, or deploy the repository's `render.yaml`
as a Render Blueprint. The blueprint requests a **free** Python web service.
Review the selected plan before creating it; CareerPilot does not enable paid
Gemini billing. Free Render services can sleep and take time to wake up.

The blueprint sets:

| Setting | Purpose |
| --- | --- |
| `HOSTED_MODE=true` | Require private access before document processing. |
| `APP_ACCESS_CODE` | Generated private access code; view/share privately in Render. |
| `GEMINI_API_KEY` | Enter a replacement Google AI Studio key in Render, never GitHub source or chat. |
| `GEMINI_MODEL=gemini-3.5-flash-lite` | Default model for lower-latency CV review. |
| `PUBLIC_DEMO_ONLY=false` | Enable the authenticated workspace. |
| `CORS_ORIGINS=https://yasinyt4221-netizen.github.io` | Permit the frontend origin. |
| `SEMANTIC_ENABLED=false` | Avoid loading an embedding model on a small free instance. Local rule checks still run; Gemini supplies the requested cloud review. |

Use an eligible Gemini Free Tier project if you want free-tier API usage.
A Gemini app subscription does not establish API eligibility or billing status.
The backend health check fails closed until its access code and Gemini key are set.
Check `/api/health` at the actual HTTPS service URL; do not guess a Render URL.

## Frontend

After backend health and a private synthetic review have been verified, set these
GitHub repository **variables**, not secrets containing any API key:

```text
CAREERPILOT_API_URL=https://<actual-service>.onrender.com
CAREERPILOT_HOSTED=true
```

Run **Verify and publish CareerPilot** in GitHub Actions. The workflow builds the
private workspace and tests its access gate before publishing. If no backend is
configured, leave `CAREERPILOT_HOSTED` unset: the sample-only public preview works.
Unset it and rerun the workflow to return to the public sample.

Visitors enter the workspace access code, choose a test CV and explicitly consent
to Gemini review. They never enter or receive the owner's Gemini API key. The
access code and signed one-hour session token stay out of browser storage.
**Lock workspace** clears the token and CV session. Reloading requires access again.

## What is protected

All hosted API routes except health and access-code login require a signed session.
Login attempts are limited. The private demo shares a limit of 30 reviews per hour;
a transient Google 500/502/503/504 gets at most one retry. Invalid keys, payment
errors, quota errors and timeouts are not automatically resubmitted. CV text and
keys are not included in diagnostic responses. Server-side key management is
disabled for hosted visitors, including visitors with a workspace session.

Documents are parsed in memory/closed temporary upload files and are not retained
by this app. Saved application notes remain in that browser's existing board.
Gemini receives CV/advert text only after explicit consent. Google's data-use terms
apply, including free-tier product improvement. This is a private friend showcase,
not a public multi-user service: per-user accounts, database RLS and account-level
data controls remain future work if private persistence is introduced.

## Verification limits

Automated provider tests use synthetic responses. Hosted frontend smoke checks
mock login/status and verify the access flow; they do not prove a live Gemini
review. Report the actual Render deployment and real review result separately.

References: [Render FastAPI](https://render.com/docs/deploy-fastapi),
[Render free services](https://render.com/docs/free),
[Gemini model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite),
[Gemini retries](https://ai.google.dev/gemini-api/docs/troubleshooting),
[Gemini pricing/data terms](https://ai.google.dev/gemini-api/docs/pricing).
