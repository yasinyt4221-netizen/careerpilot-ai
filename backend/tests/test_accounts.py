import pytest
from fastapi.testclient import TestClient

import hosted_access
import main

JOB = {'id': 'a1', 'company': 'Acme', 'title': 'Analyst', 'location': 'Remote', 'url': 'https://example.com/job',
       'stage': 'Saved', 'notes': '', 'nextDate': '', 'createdAt': '2026-01-01T00:00:00Z',
       'updatedAt': '2026-01-01T00:00:00Z', 'sponsorship': '', 'sample': False}


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv('CAREERPILOT_DB', str(tmp_path / 'test.db'))
    monkeypatch.setenv('HOSTED_MODE', 'false')
    monkeypatch.setenv('PUBLIC_DEMO_ONLY', 'false')
    hosted_access._buckets.clear()


def test_account_lifecycle():
    client = TestClient(main.app)
    creds = {'email': 'Synthetic@Example.com', 'password': 'correct horse battery'}
    token = client.post('/api/account/register', json=creds).json()['token']
    auth = {'X-Account-Token': token}
    assert client.post('/api/account/register', json=creds).status_code == 409
    assert client.post('/api/account/login', json={**creds, 'password': 'wrong password!'}).status_code == 401
    assert client.get('/api/account', headers=auth).json() == {'email': 'synthetic@example.com'}

    assert client.get('/api/account/applications', headers=auth).json()['jobs'] == []
    assert client.put('/api/account/applications', headers=auth, json={'jobs': [JOB]}).status_code == 200
    assert client.get('/api/account/applications', headers=auth).json()['jobs'] == [JOB]

    other = client.post('/api/account/login', json=creds).json()['token']
    assert client.post('/api/account/logout', headers=auth).status_code == 200
    assert client.get('/api/account', headers=auth).status_code == 401

    assert client.delete('/api/account', headers={'X-Account-Token': other}).status_code == 200
    assert client.post('/api/account/login', json=creds).status_code == 401


def test_board_is_validated_and_private():
    client = TestClient(main.app)
    a = {'X-Account-Token': client.post('/api/account/register', json={'email': 'a@example.com', 'password': 'synthetic-pass-1'}).json()['token']}
    b = {'X-Account-Token': client.post('/api/account/register', json={'email': 'b@example.com', 'password': 'synthetic-pass-2'}).json()['token']}
    client.put('/api/account/applications', headers=a, json={'jobs': [JOB]})
    assert client.get('/api/account/applications', headers=b).json()['jobs'] == []
    assert client.put('/api/account/applications', headers=a, json={'jobs': [{**JOB, 'url': 'javascript:alert(1)'}]}).status_code == 422
    assert client.put('/api/account/applications', headers=a, json={'jobs': [JOB] * 101}).status_code == 422
    assert client.get('/api/account/applications').status_code == 401


def test_disabled_on_public_demo(monkeypatch):
    monkeypatch.setenv('PUBLIC_DEMO_ONLY', 'true')
    assert TestClient(main.app).post('/api/account/register', json={'email': 'a@example.com', 'password': 'synthetic-pass-1'}).status_code == 403
