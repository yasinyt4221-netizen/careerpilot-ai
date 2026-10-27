import os

from typing import Annotated

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StringConstraints, SecretStr
from typing import Literal
from review_service import review_documents
import gemini_review
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from document_parser import MAX_FILE_SIZE, DocumentValidationError, extract_cv_text, safe_filename
from job_analyser import MAX_JOB_CHARACTERS, JobAnalysis, analyse_job
from matching import MAX_CV_CHARACTERS, MatchReport, MatchSettings, compare_cv
from job_search import JobSearchRequest, search_jobs

MAX_REQUEST_SIZE = MAX_FILE_SIZE + 256 * 1024


class UploadSizeLimit:
    """Bound multipart input even when the client omits Content-Length."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        messages: list[Message] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > MAX_REQUEST_SIZE:
                response = JSONResponse({"detail": "The upload is too large. Choose a file of 5 MB or smaller."}, status_code=413)
                return await response(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break
        iterator = iter(messages)

        async def replay() -> Message:
            return next(iterator, {"type": "http.request", "body": b"", "more_body": False})

        await self.app(scope, replay, send)


app = FastAPI(title="CareerPilot AI API", version="0.1.0")
app.add_middleware(UploadSizeLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Pydantic's default errors echo input values, potentially including CV text.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]})


@app.exception_handler(gemini_review.GeminiUnavailable)
async def gemini_error(request: Request, exc: gemini_review.GeminiUnavailable):
    return JSONResponse(status_code=400, content=exc.public_error())


class JobRequest(BaseModel):
    job_description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=30, max_length=MAX_JOB_CHARACTERS)] = Field(repr=False)


class MatchRequest(JobRequest):
    cv_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CV_CHARACTERS)] = Field(repr=False)
    settings: MatchSettings = Field(default_factory=MatchSettings)


class ReviewRequest(BaseModel):
    cv_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CV_CHARACTERS)] = Field(repr=False)
    job_description: str = Field(default='', max_length=MAX_JOB_CHARACTERS, repr=False)
    provider: Literal['local', 'gemini'] = 'local'
    external_ai_consent: bool = False


class GeminiConnection(BaseModel):
    api_key: SecretStr = Field(min_length=12, max_length=300)


def local_connection_only(request: Request):
    if os.getenv('PUBLIC_DEMO_ONLY', 'false').lower() == 'true' or request.client.host not in {'127.0.0.1', '::1', 'testclient'}:
        raise HTTPException(status_code=403, detail='AI connection settings are available only in the local application.')
    if request.headers.get('origin') not in {None, 'http://localhost:3000', 'http://127.0.0.1:3000'}:
        raise HTTPException(status_code=403, detail='Open the local application to manage the AI connection.')


@app.get('/api/ai/status')
def ai_status():
    return gemini_review.status()


@app.post('/api/ai/connect')
def connect_ai(body: GeminiConnection, request: Request):
    local_connection_only(request)
    return gemini_review.connect(body.api_key)


@app.post('/api/ai/disconnect')
def disconnect_ai(request: Request):
    local_connection_only(request)
    gemini_review.disconnect()
    return gemini_review.status()


@app.post('/api/cvs/review', response_model=MatchReport)
def review_cv(body: ReviewRequest):
    if os.getenv('PUBLIC_DEMO_ONLY', 'false').lower() == 'true':
        raise HTTPException(status_code=403, detail='Personal CV processing is disabled on the public preview.')
    if body.provider == 'gemini' and not body.external_ai_consent:
        raise HTTPException(status_code=422, detail='Choose whether to send this CV and advert to Gemini before using cloud review.')
    try:
        return review_documents(body.cv_text, body.job_description, body.provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.post("/api/jobs/analyse", response_model=JobAnalysis)
def analyse_job_description(body: JobRequest):
    try:
        return analyse_job(body.job_description)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.post("/api/jobs/search")
async def find_jobs(body: JobSearchRequest):
    if os.getenv("PUBLIC_DEMO_ONLY", "false").lower() == "true" and body.cv_text:
        raise HTTPException(status_code=403, detail="Personal CV processing is disabled on this public demo.")
    return await search_jobs(body)


@app.post("/api/matches/compare", response_model=MatchReport)
def compare_documents(body: MatchRequest):
    if os.getenv("PUBLIC_DEMO_ONLY", "false").lower() == "true":
        raise HTTPException(status_code=403, detail="Personal CV processing is disabled until authentication and privacy controls are configured. Use the sample preview.")
    try:
        return compare_cv(body.cv_text, body.job_description, body.settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


class CVResult(BaseModel):
    filename: str
    extracted_text: str
    word_count: int
    character_count: int


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/cvs/extract", response_model=CVResult)
def extract_cv(file: UploadFile):
    if os.getenv("PUBLIC_DEMO_ONLY", "false").lower() == "true":
        file.file.close()
        raise HTTPException(status_code=403, detail="Personal CV uploads are disabled on this public demo. Use the sample preview.")
    # Sync endpoint keeps document parsing off the async event loop.
    try:
        content = file.file.read(MAX_FILE_SIZE + 1)
        text = extract_cv_text(file.filename or "", content)
    except DocumentValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from None
    finally:
        file.file.close()
    return CVResult(
        filename=safe_filename(file.filename or ""),
        extracted_text=text,
        word_count=len(text.split()),
        character_count=len(text),
    )
