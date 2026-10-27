"""Hosted access tests use synthetic secrets and never call Google."""
import httpx
import pytest
from fastapi.testclient import TestClient

import gemini_review
import hosted_access
import main

CODE = 'synthetic-workspace-access-code'


@pytest.fixture(autouse=True)
def private_config(monkeypatch):
    monkeypatch.setenv('HOSTED_MODE', 'true')
    monkeypatch.setenv('PUBLIC_DEMO_ONLY', 'false')
    monkeypatch.setenv('APP_ACCESS_CODE', CODE)
    monkeypatch.setenv('GEMINI_API_KEY', 'synthetic-google-key')
    monkeypatch.setattr(hosted_access, '_buckets', hosted_access.OrderedDict())


def authorized(client):
    response = client.post('/api/access/session', json={'access_code': CODE})
    assert response.status_code == 200
    assert CODE not in response.text and 'synthetic-google-key' not in response.text
    return {'Authorization': 'Bearer ' + response.json()['token']}


@pytest.mark.parametrize('path,body', [
    ('/api/cvs/review', {'cv_text': 'Synthetic text', 'provider': 'gemini', 'external_ai_consent': True}),
    ('/api/matches/compare', {'cv_text': 'Synthetic text', 'job_description': 'A sufficiently long synthetic advert here.'}),
    ('/api/jobs/search', {'cv_text': 'Synthetic text'}),
    ('/api/ai/connect', {'api_key': 'synthetic-google-key'}),
])
def test_protected_routes_reject_unauthenticated_requests_before_processing(monkeypatch, path, body):
    monkeypatch.setattr(main, 'review_documents', lambda *_: pytest.fail('Unauthorized CV must not be processed'))
    response = TestClient(main.app).post(path, json=body)
    assert response.status_code == 401
    assert 'Synthetic text' not in response.text


def test_upload_is_rejected_before_the_document_parser(monkeypatch):
    monkeypatch.setattr(main, 'extract_cv_text', lambda *_: pytest.fail('Unauthorized upload must not be parsed'))
    response = TestClient(main.app).post('/api/cvs/extract', files={'file': ('synthetic.pdf', b'not a PDF')})
    assert response.status_code == 401


def test_successful_access_does_not_expose_secrets_and_still_requires_cloud_consent(monkeypatch):
    monkeypatch.setattr(main, 'review_documents', lambda *_: pytest.fail('No document consent'))
    client = TestClient(main.app)
    headers = authorized(client)
    assert client.get('/api/ai/status', headers=headers).status_code == 200
    response = client.post('/api/cvs/review', headers=headers, json={'cv_text': 'Synthetic text', 'provider': 'gemini'})
    assert response.status_code == 422
    # Hosted visitors cannot replace or disconnect the owner's backend key.
    assert client.post('/api/ai/connect', headers=headers, json={'api_key': 'synthetic-google-key'}).status_code == 403
    assert client.post('/api/ai/disconnect', headers=headers).status_code == 403


def test_wrong_code_and_missing_host_settings_fail_closed(monkeypatch):
    client = TestClient(main.app)
    response = client.post('/api/access/session', json={'access_code': 'synthetic-wrong-code'})
    assert response.status_code == 401 and 'synthetic-wrong-code' not in response.text
    monkeypatch.delenv('APP_ACCESS_CODE')
    assert client.get('/api/health').status_code == 503
    assert client.post('/api/access/session', json={'access_code': CODE}).status_code == 503
    assert client.get('/api/ai/status').status_code == 503


def test_token_tampering_expiry_and_code_rotation_are_rejected(monkeypatch):
    monkeypatch.setattr(hosted_access.time, 'time', lambda: 1000)
    token = hosted_access.login(CODE)
    assert token and hosted_access.valid(token)
    assert not hosted_access.valid(token[:-2] + 'xx')
    assert not hosted_access.valid('invalid')
    monkeypatch.setattr(hosted_access.time, 'time', lambda: 4600)
    assert not hosted_access.valid(token)
    monkeypatch.setattr(hosted_access.time, 'time', lambda: 1000)
    monkeypatch.setenv('APP_ACCESS_CODE', 'synthetic-rotated-code')
    assert not hosted_access.valid(token)


def test_shared_review_limit_and_login_rate_limit(monkeypatch):
    client = TestClient(main.app)
    headers = authorized(client)
    for _ in range(30):
        assert hosted_access.allowed('shared-reviews', 30, 3600)
    response = client.post('/api/cvs/review', headers=headers, json={'cv_text': 'Synthetic text'})
    assert response.status_code == 429
    for _ in range(9):
        client.post('/api/access/session', json={'access_code': 'synthetic-wrong-code'})
    assert client.post('/api/access/session', json={'access_code': CODE}).status_code == 429
    for index in range(1100):
        hosted_access.allowed('login:' + str(index), 10, 600)
    assert len(hosted_access._buckets) <= 1024
    assert not hosted_access.allowed('shared-reviews', 30, 3600)


def test_browser_preflight_allows_authorization_header():
    response = TestClient(main.app).options('/api/cvs/review', headers={'Origin': 'http://localhost:3000', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'})
    assert response.status_code == 200
    assert 'authorization' in response.headers['access-control-allow-headers'].lower()


def test_local_mode_does_not_offer_hosted_login(monkeypatch):
    monkeypatch.setenv('HOSTED_MODE', 'false')
    response = TestClient(main.app).post('/api/access/session', json={'access_code': CODE})
    assert response.status_code == 404
