"""Provider responses are synthetic; no real key or CV is used in these tests."""
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

import gemini_review
from main import app


@pytest.fixture(autouse=True)
def connection_state(monkeypatch):
    monkeypatch.setattr(gemini_review, '_key', None)
    monkeypatch.setattr(gemini_review, '_verified', False)
    monkeypatch.setattr(gemini_review, '_ignore_environment', False)
    monkeypatch.setattr(gemini_review, '_last_connection_error', None)
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)


def mock_google(monkeypatch, handler):
    original_client = httpx.Client
    monkeypatch.setattr(gemini_review.httpx, 'Client', lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.parametrize('http_status,error,code', [
    (400, {'code': 400, 'status': 'INVALID_ARGUMENT', 'details': [{'reason': 'API_KEY_INVALID'}]}, 'KEY_INVALID'),
    (400, {'message': 'API key not valid. Please pass a valid API key.'}, 'KEY_INVALID'),
    (400, {'message': 'Your API key was reported as leaked. Please use another API key.'}, 'KEY_BLOCKED'),
    (401, {'code': 'authentication'}, 'KEY_INVALID'),
    (403, {'details': [{'reason': 'API_KEY_HTTP_REFERRER_BLOCKED'}]}, 'KEY_RESTRICTED'),
    (400, {'code': 'failed_precondition', 'message': 'Free tier unavailable.'}, 'PROJECT_UNAVAILABLE'),
    (402, {'code': 'payment_required'}, 'PAYMENT_REQUIRED'),
    (403, {'code': 'permission_denied'}, 'ACCESS_RESTRICTED'),
    (429, {'code': 'quota_exceeded'}, 'QUOTA_EXCEEDED'),
    (429, {'code': 'rate_limit_exceeded'}, 'RATE_LIMITED'),
    (404, {'code': 'model_not_found'}, 'MODEL_UNAVAILABLE'),
    (404, {'code': 'not_found'}, 'API_ROUTE_UNAVAILABLE'),
    (400, {'code': 'parameter_unknown'}, 'REQUEST_REJECTED'),
    (400, {'code': 'invalid_request', 'message': 'thinking_level minimal is not supported for this model'}, 'THINKING_CONFIG'),
    (503, {'code': 'service_unavailable'}, 'GOOGLE_UNAVAILABLE'),
    (418, {'code': 'unknown'}, 'PROVIDER_ERROR'),
])
@pytest.mark.parametrize('array_wrapper', [True, False])
def test_google_errors_are_actionable_and_never_echo_provider_data(monkeypatch, http_status, error, code, array_wrapper):
    secret = 'synthetic-secret-never-return-this'
    error = dict(error, message=error.get('message', '') + f' {secret} PRIVATE-CV-TEXT project/private-id')
    payload = [{'error': error}] if array_wrapper else {'error': error}
    mock_google(monkeypatch, lambda _: httpx.Response(http_status, json=payload))
    client = TestClient(app)
    response = client.post('/api/ai/connect', json={'api_key': secret})
    assert response.status_code == 400
    assert response.json()['code'] == code
    assert response.json()['provider_status'] == http_status
    assert response.json()['detail']
    status = client.get('/api/ai/status').json()
    assert not status['configured'] and not status['verified']
    assert status['last_error'] == response.json()
    for private in (secret, 'PRIVATE-CV-TEXT', 'project/private-id'):
        assert private not in response.text + json.dumps(status)


def test_connection_trims_pasted_whitespace_and_clears_previous_error(monkeypatch):
    gemini_review._last_connection_error = {'code': 'KEY_INVALID'}
    def google(request):
        assert request.headers['x-goog-api-key'] == 'synthetic-replacement-key'
        body = json.loads(request.content)
        assert body['store'] is False and 'CV' not in body['input']
        # Guard the real 3.8 incompatibility: minimal is rejected, and thought
        # tokens share the output budget, so 32 is insufficient for the probe.
        assert body['generation_config'] == {'thinking_level': 'low', 'max_output_tokens': 1024}
        return httpx.Response(200, json={'status': 'completed', 'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': 'READY'}]}]})
    mock_google(monkeypatch, google)
    status = gemini_review.connect(SecretStr('  synthetic-replacement-key\r\n'))
    assert status['configured'] and status['verified'] and status['last_error'] is None
    gemini_review.disconnect()
    assert not gemini_review.status()['configured'] and gemini_review.status()['last_error'] is None


@pytest.mark.parametrize('key', ['a' * 15 + '\n' + 'b' * 15, 'é' * 15, ' ' * 15])
def test_malformed_key_is_rejected_before_network_call(monkeypatch, key):
    mock_google(monkeypatch, lambda _: pytest.fail('Malformed key must not be sent'))
    with pytest.raises(gemini_review.GeminiUnavailable) as caught:
        gemini_review.connect(SecretStr(key))
    assert caught.value.code == 'KEY_FORMAT'
    assert key not in str(caught.value)


@pytest.mark.parametrize('kind,code', [(httpx.ReadTimeout, 'TIMEOUT'), (httpx.ConnectError, 'NETWORK_ERROR')])
def test_network_failures_do_not_echo_request_or_exception(monkeypatch, kind, code):
    def google(request):
        raise kind('synthetic-secret-and-private-cv', request=request)
    mock_google(monkeypatch, google)
    response = TestClient(app).post('/api/ai/connect', json={'api_key': 'synthetic-secret-and-private-cv'})
    assert response.status_code == 400 and response.json()['code'] == code
    assert 'synthetic-secret-and-private-cv' not in response.text


@pytest.mark.parametrize('body', [
    {'status': 'incomplete', 'output_text': 'READY'},
    {'status': 'failed', 'steps': []},
    {'status': 'completed', 'steps': None},
    {'status': 'completed', 'steps': [{'type': 'model_output', 'content': None}]},
    {'status': 'completed', 'output_text': '   '},
])
def test_incomplete_or_empty_output_never_verifies_a_key(monkeypatch, body):
    mock_google(monkeypatch, lambda _: httpx.Response(200, json=body))
    response = TestClient(app).post('/api/ai/connect', json={'api_key': 'synthetic-test-key'})
    assert response.status_code == 400
    assert not gemini_review.status()['verified'] and not gemini_review.status()['configured']


def test_failed_replacement_preserves_working_connection(monkeypatch):
    gemini_review._key = SecretStr('synthetic-existing-key')
    gemini_review._verified = True
    mock_google(monkeypatch, lambda _: httpx.Response(401, json={'error': {'code': 'authentication'}}))
    response = TestClient(app).post('/api/ai/connect', json={'api_key': 'synthetic-bad-replacement'})
    assert response.status_code == 400
    assert gemini_review._key.get_secret_value() == 'synthetic-existing-key'
    assert gemini_review.status()['verified']


@pytest.mark.parametrize('body', [b'not JSON', b'null', b'{"error":null}', b'[{"error":{"details":null}}]'])
def test_malformed_provider_errors_still_return_a_safe_diagnosis(monkeypatch, body):
    mock_google(monkeypatch, lambda _: httpx.Response(400, content=body))
    response = TestClient(app).post('/api/ai/connect', json={'api_key': 'synthetic-test-key'})
    assert response.status_code == 400 and response.json()['code'] == 'REQUEST_REJECTED'
