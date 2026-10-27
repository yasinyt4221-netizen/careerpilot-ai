"""Opt-in real local model test; normal tests neither download nor need a model."""
import os
import socket

import pytest

from matching import compare_cv
from semantic import LocalEmbeddingProvider


@pytest.mark.skipif(os.getenv("RUN_SEMANTIC_TESTS") != "1", reason="Set RUN_SEMANTIC_TESTS=1 after preparing the local model")
def test_real_embeddings_run_offline_and_find_related_evidence(monkeypatch):
    def block_network(*args, **kwargs):
        raise AssertionError("Embedding CV text must not access the network")
    monkeypatch.setattr(socket.socket, "connect", block_network)
    monkeypatch.setattr(socket.socket, "connect_ex", block_network)
    provider = LocalEmbeddingProvider()
    report = compare_cv(
        "Created reporting dashboards for business stakeholders.\nPython and SQL developer.",
        "Data Analyst\nRequired:\nPython and SQL\nResponsibilities:\nBuild reporting dashboards for business stakeholders.\nPreferred:\nKubernetes",
        provider=provider,
    )
    assert report.mode == "hybrid" and report.semantic_score is not None
    assert report.counts["matched"] == 2
    task = next(item for item in report.matches if item.requirement.kind == "responsibility")
    assert task.status == "related" and "Created reporting dashboards" in task.evidence
    assert next(item for item in report.matches if item.requirement.label == "Kubernetes").status == "not_found"
