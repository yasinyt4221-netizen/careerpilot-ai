# CareerPilot AI — Instructions for Codex

You are building CareerPilot AI, a full-stack Smart Job Application Assistant.

## Product goal
Users upload a PDF or DOCX CV and paste a job description. The application extracts CV text, identifies job requirements, compares them using a hybrid rules + semantic approach, and produces an explainable report with matched skills, missing evidence, and truthful improvement suggestions.

## Work in small verified milestones
1. Inspect the repository and read README.md.
2. Make Milestone 1 work first: PDF/DOCX upload, text extraction, word/character counts, and a usable frontend.
3. Run the backend and frontend, test the flow, and fix errors before moving on.
4. Implement job-description analysis.
5. Implement hybrid matching: explicit rules plus semantic similarity. Make scoring explainable and configurable; initial weights 60% rules and 40% semantic are hypotheses to validate, not hiring predictors.
6. Add report UI with evidence, matches, related evidence, and "not found in CV" distinctions.
7. Add CV suggestions grounded only in user-provided experience. Never invent credentials, employers, achievements, dates, or skills.
8. Add tests, then authentication/database persistence and deployment preparation.

## Architecture
- Frontend: Next.js App Router, TypeScript, Tailwind CSS.
- Backend: Python, FastAPI, Uvicorn.
- Document parsing: PyMuPDF for PDF and python-docx for DOCX.
- Rules engine: Python.
- Semantic matching: Sentence Transformers or another documented embedding model.
- Database/auth (later milestone): Supabase PostgreSQL and Supabase Auth.
- Do not require an LLM API for the first milestone.
- Never put secrets in frontend code or commit .env files.

## Engineering requirements
- Keep frontend and backend separated.
- Use environment variables for API URLs.
- Validate file extension, size, content, and page count on the server. Treat file uploads as untrusted input.
- Explain that scanned PDFs require OCR.
- Add useful errors and loading states.
- Add tests for parsing and scoring.
- Do not log full CV text or expose it in server logs.
- Before using real users, implement authentication, Supabase Row Level Security, private file storage, retention/deletion controls, and privacy disclosures.
- Do not represent a match score as a probability of getting hired or a validated predictor of hiring success.
- Do not send CV data to an external AI provider without user consent and appropriate privacy handling.

## Expected result
A working local app, clear setup instructions, tests, and a concise list of remaining tasks. Do not claim tests passed unless you ran them.
