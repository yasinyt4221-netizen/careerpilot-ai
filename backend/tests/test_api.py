import asyncio

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile
from io import BytesIO

from document_parser import MAX_FILE_SIZE
from main import MAX_REQUEST_SIZE, UploadSizeLimit, app, extract_cv
from tests.document_factory import SAMPLE_TEXT, make_docx, make_pdf

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("name,content,mime", [
    ("cv.pdf", make_pdf(), "application/pdf"),
    ("cv.docx", make_docx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("cv.PDF", make_pdf(), "application/octet-stream"),
], ids=["pdf", "docx", "uppercase-pdf-generic-mime"])
def test_upload_contract_and_counts(name, content, mime):
    response = client.post("/api/cvs/extract", files={"file": (name, content, mime)})
    assert response.status_code == 200
    assert response.json() == {
        "filename": name, "extracted_text": SAMPLE_TEXT,
        "word_count": len(SAMPLE_TEXT.split()), "character_count": len(SAMPLE_TEXT),
    }


@pytest.mark.parametrize("name,content,message,status", [
    ("cv.txt", b"not supported", "Only PDF and DOCX", 400),
    ("cv.pdf.exe", make_pdf(), "Only PDF and DOCX", 400),
    ("cv.pdf", b"", "empty", 400),
    ("cv.docx", b"", "empty", 400),
    ("cv.pdf", b"not pdf", "not a valid PDF", 400),
    ("cv.docx", b"not docx", "not a valid DOCX", 400),
    ("cv.pdf", make_pdf(image_only=True), "OCR", 400),
    ("cv.docx", make_docx(""), "No readable text", 400),
    ("cv.pdf", make_pdf(encrypted=True), "Password-protected", 400),
    ("cv.pdf", make_pdf(pages=31), "30 pages", 400),
    ("cv.pdf", b"x" * (MAX_FILE_SIZE + 1), "5 MB", 413),
    ("cv.docx", b"x" * (MAX_REQUEST_SIZE + 1), "5 MB", 413),
], ids=["unsupported", "double-extension", "empty-pdf", "empty-docx", "invalid-pdf", "invalid-docx", "scanned", "blank-docx", "encrypted", "too-many-pages", "oversized-file", "oversized-request"])
def test_invalid_uploads(name, content, message, status):
    response = client.post("/api/cvs/extract", files={"file": (name, content)})
    assert response.status_code == status
    assert message in response.json()["detail"]


def test_missing_file():
    assert client.post("/api/cvs/extract").status_code == 422


@pytest.mark.parametrize("name", ["../../cv.pdf", r"C:\private\cv.pdf"])
def test_response_strips_client_paths(name):
    response = client.post("/api/cvs/extract", files={"file": (name, make_pdf())})
    assert response.json()["filename"] == "cv.pdf"


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://127.0.0.1:3000"])
def test_cors_for_frontend(origin):
    response = client.options("/api/cvs/extract", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    response = client.post("/api/cvs/extract", headers={"Origin": origin}, files={"file": ("cv.pdf", make_pdf())})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_cors_does_not_allow_unconfigured_origins():
    response = client.options("/api/cvs/extract", headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"})
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_oversize_response_has_cors_headers():
    response = client.post("/api/cvs/extract", headers={"Origin": "http://localhost:3000"}, files={"file": ("cv.pdf", b"x" * (MAX_REQUEST_SIZE + 1))})
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_upload_is_closed_on_validation_failure():
    upload = UploadFile(file=BytesIO(b"hello"), filename="cv.txt")
    with pytest.raises(Exception):
        extract_cv(upload)
    assert upload.file.closed


def test_chunked_request_without_content_length_is_bounded():
    async def exercise():
        called = False
        async def inner(scope, receive, send):
            nonlocal called
            called = True
        chunks = iter([
            {"type": "http.request", "body": b"x" * MAX_FILE_SIZE, "more_body": True},
            {"type": "http.request", "body": b"x" * (256 * 1024 + 1), "more_body": False},
        ])
        sent = []
        async def receive():
            return next(chunks)
        async def send(message):
            sent.append(message)
        await UploadSizeLimit(inner)({"type": "http", "method": "POST", "headers": []}, receive, send)
        assert not called
        assert sent[0]["status"] == 413
    asyncio.run(exercise())


def test_invalid_document_does_not_leak_content_or_diagnostics(capfd):
    marker = "SYNTHETIC_PRIVATE_CONTENT_DO_NOT_LOG"
    response = client.post("/api/cvs/extract", files={"file": ("cv.pdf", b"%PDF-1.7\n" + marker.encode())})
    assert response.status_code == 400
    assert marker not in response.text
    captured = capfd.readouterr()
    assert marker not in captured.out + captured.err
