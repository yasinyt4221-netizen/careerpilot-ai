# A usable showcase

The expanded workspace keeps the supplied landing-page direction and connects
the core CV review to job discovery, applications and preparation. Its public
URL is <https://yasinyt4221-netizen.github.io/careerpilot-ai/dashboard/>.

## Product research

The design uses public product patterns, not copied source code, branding,
screenshots, testimonials or success statistics:

- [Teal's job-tracker guide](https://help.tealhq.com/en/articles/9525013-leveraging-your-job-tracker-tools):
  job stages, per-role notes and actionable next steps.
- [Huntr's tracker](https://help.huntr.co/en/articles/9883324-job-tracker) and
  [interview-preparation guide](https://help.huntr.co/en/articles/10697703-ai-interview-questions):
  a board view and preparation connected to saved roles.
- [Grammarly's resume guide](https://support.grammarly.com/hc/en-us/articles/45441636399117-Resume-Builder-user-guide):
  inline suggestions, reviewing individual changes and exporting reviewed text.
- [Jobscan's scanner](https://www.jobscan.co/resume-scanner): a role-specific
  alignment view. CareerPilot does not adopt hiring-probability claims or
  universal ATS-pass thresholds.

## Working features

The responsive app shell provides an overview, CV review, job finder, application
board, preparation tools and help. Desktop sidebar and mobile bottom navigation
use the same five destinations. A keyboard-accessible native-dialog tour offers
working links into the flow. Share demo copies the workspace URL without jobs
or notes. The home page stays close to the supplied reference.

The overview derives statistics, opportunities and dates from the actual browser
board. Empty states explain the next action. Fictional example companies are
explicitly labelled and never receive job-advert links. The sample CV score is
read from the actual backend-generated synthetic report.

Job results can be saved once per URL. The application board supports manual
HTTPS job links, five stages, board/list views, keyword search, notes, next-action
dates, editing, removal and CSV download. Browser storage is validated and bounded
to 100 jobs. Invalid saved records are ignored; blocked storage uses memory for
the current tab and reports that limitation. CSV cells guard formula prefixes,
including leading whitespace. Moving a job does not submit an application.

The preparation page supplies role-category practice questions and a four-part
STAR form. Each question has its own draft. Completion counts indicate fields
filled, not answer quality. Cover letters and follow-up emails assemble only
the facts entered into visible fields. They are templates, not LLM generation.
Fictional practice content is marked in its exports. Copy and text-download
actions do not send an email or application. Drafts are not persisted by the app.

The CV workspace also supports a direct `?sample=1` link, a working sample mode
locally and publicly, text downloads and a print layout. Sample edits adjust
the existing highlights and support undo but do not recalculate the score.
Actual local uploads continue to use FastAPI extraction and reanalysis.

Help explains storage and product limits, exports the browser board, and clears
all saved roles only after an explicit delete choice with a cancel option.
No account, cloud-sync promise, real CV fixture or paid AI service was added.
Public personal CV processing remains disabled pending separate hosting and
the required authentication/privacy controls.

## Verification

On 27 October 2026, the full local Chromium suite passed **39 tests** with the
real local matching model required. Nine additional end-to-end cases cover
stage persistence and dashboard counts; HTTPS link validation; editing notes
and dates; formula-safe CSV exports; deletion/cancel; saving a public job;
direct-link sample edits/download/undo without document POSTs; per-question
answers; factual preparation drafts; labelled practice exports; corrupt/blocked
storage; clearing browser data; tour focus/Escape; and mobile routes.

ESLint, TypeScript and a production build passed. Desktop and phone screenshots
of the overview, board, job details, preparation and CV review were inspected.
The static export is separately tested at the GitHub Pages base path before
the Actions workflow publishes it. The backend suite remains part of that
required release workflow.
