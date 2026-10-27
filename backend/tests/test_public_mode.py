from fastapi.testclient import TestClient
from main import app


def test_public_demo_disables_personal_document_processing(monkeypatch):
    monkeypatch.setenv('PUBLIC_DEMO_ONLY', 'true')
    client = TestClient(app)
    assert client.post('/api/cvs/extract', files={'file': ('cv.pdf', b'%PDF-test')}).status_code == 403
    assert client.post('/api/matches/compare', json={'cv_text': 'Private CV', 'job_description': 'A sufficiently long job description with Python requirements.'}).status_code == 403
    assert client.post('/api/jobs/search', json={'query': 'Engineer', 'cv_text': 'Private CV'}).status_code == 403
    assert client.get('/api/health').status_code == 200
