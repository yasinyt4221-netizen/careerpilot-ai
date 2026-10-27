import pytest
from fastapi.testclient import TestClient

import matching
from main import app
from semantic import SemanticUnavailable

client = TestClient(app)
JOB = "Data Analyst\nRequired:\nPython and SQL\nPreferred:\nDocker"


class ConstantProvider:
    def embed(self, texts):
        return [[1.0, 0.0] for _ in texts]


@pytest.fixture(autouse=True)
def local_stub(monkeypatch):
    monkeypatch.setattr(matching, "get_semantic_provider", lambda: ConstantProvider())


def test_job_analyser_endpoint():
    response = client.post("/api/jobs/analyse", json={"job_description": JOB})
    assert response.status_code == 200
    assert {item["label"] for item in response.json()["requirements"]} == {"Python", "SQL", "Docker"}


def test_report_contract_evidence_and_cors():
    cv = "Python and SQL developer."
    response = client.post("/api/matches/compare", json={"cv_text": cv, "job_description": JOB}, headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    report = response.json()
    assert report["mode"] == "hybrid"
    assert report["counts"]["matched"] == 2
    assert all(item["evidence"] is None or item["evidence"] in cv for item in report["matches"])
    assert report["effective_settings"] == {"rules_weight": .6, "semantic_weight": .4, "related_threshold": .5}


@pytest.mark.parametrize("body", [
    {}, {"cv_text": "Python", "job_description": "short"},
    {"cv_text": " ", "job_description": JOB},
    {"cv_text": "x" * 50_001, "job_description": JOB},
    {"cv_text": "Python", "job_description": "x" * 20_001},
    {"cv_text": "Python", "job_description": JOB, "settings": {"rules_weight": .8, "semantic_weight": .7}},
], ids=["missing", "short-job", "empty-cv", "long-cv", "long-job", "invalid-weights"])
def test_api_input_validation(body):
    assert client.post("/api/matches/compare", json=body).status_code == 422


def test_validation_does_not_echo_private_cv_or_log_it(capfd):
    marker = "SYNTHETIC_PRIVATE_CV_MARKER"
    response = client.post("/api/matches/compare", json={"cv_text": marker * 3000, "job_description": JOB})
    assert response.status_code == 422
    assert marker not in response.text
    captured = capfd.readouterr()
    assert marker not in captured.out + captured.err


def test_unavailable_model_returns_honest_rules_only_report(monkeypatch):
    def unavailable():
        raise SemanticUnavailable("Missing")
    monkeypatch.setattr(matching, "get_semantic_provider", unavailable)
    report = client.post("/api/matches/compare", json={"cv_text": "Python SQL", "job_description": JOB}).json()
    assert report["mode"] == "rules_only"
    assert report["semantic_score"] is None
    assert report["effective_settings"]["rules_weight"] == 1


def test_no_score_for_unrecognised_advert():
    report = client.post("/api/matches/compare", json={"cv_text": "Python SQL", "job_description": "Welcome to our friendly company and wonderful workplace."}).json()
    assert report["mode"] == "no_requirements"
    assert report["score"] is None


def test_analysis_json_preflight_cors():
    response = client.options("/api/matches/compare", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert response.status_code == 200


def test_job_analyser_can_run_without_semantic_model(monkeypatch):
    def unavailable():
        raise AssertionError("Analysis must not access embeddings")
    monkeypatch.setattr(matching, "get_semantic_provider", unavailable)
    assert client.post("/api/jobs/analyse", json={"job_description": JOB}).status_code == 200
