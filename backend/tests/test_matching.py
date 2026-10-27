import math

import pytest
from pydantic import ValidationError

import matching
from matching import MatchSettings, compare_cv, cosine, cv_chunks
from semantic import SemanticUnavailable


class ConstantProvider:
    def embed(self, texts):
        return [[1.0, 0.0] for _ in texts]


class MathProvider:
    def embed(self, texts):
        return [[0.8, 0.6] if text == "Python" else [0.6, 0.8] if text == "SQL" else [1.0, 0.0] for text in texts]


class MissingProvider:
    def embed(self, texts):
        raise SemanticUnavailable("Unavailable")


def find(report, label):
    return next(item for item in report.matches if item.requirement.label == label)


def test_explainable_weighted_arithmetic_and_configurable_weights():
    job = "Developer role\nRequired:\nPython\nPreferred:\nSQL"
    report = compare_cv("Python developer.", job, provider=MathProvider())
    assert report.rules_score == 80
    assert report.semantic_score == 76
    assert report.score == 78.4
    assert find(report, "Python").status == "matched"
    assert find(report, "SQL").status == "related"
    assert report.counts == {"matched": 1, "related": 1, "not_found": 0}
    assert compare_cv("Python developer.", job, MatchSettings(rules_weight=1, semantic_weight=0), MathProvider()).score == 80


def test_alias_match_evidence_is_verbatim_and_missing_is_not_claimed_as_absence():
    cv = "Built services on Amazon Web Services."
    report = compare_cv(cv, "Developer\nRequired:\nAWS and SQL experience", provider=MissingProvider())
    assert find(report, "AWS").evidence in cv
    missing = find(report, "SQL")
    assert missing.status == "not_found" and missing.evidence is None
    assert "does not establish" in missing.reason


def test_related_similarity_is_not_an_explicit_match():
    report = compare_cv("Created visual reports for business users.", "Analyst responsibilities:\nBuild reporting dashboards for stakeholders.", provider=ConstantProvider())
    assert report.matches and all(item.status == "related" for item in report.matches)
    assert report.rules_score == 0
    assert report.score == 40
    assert all(item.evidence == "Created visual reports for business users." for item in report.matches)


@pytest.mark.parametrize("cv", ["No experience with Python", "Currently learning Python", "Interested in Python", "Python: no experience", "I have no Python experience", "Python is not a skill I have"])
def test_negated_or_learning_skills_not_promoted_by_semantics(cv):
    report = compare_cv(cv, "Developer\nRequired skills:\nPython programming", provider=ConstantProvider())
    assert find(report, "Python").status == "not_found"
    assert report.score == 0


def test_alternative_requires_one_skill_only():
    report = compare_cv("Java developer", "Developer\nRequired:\nPython or Java programming skills", provider=MissingProvider())
    assert len(report.matches) == 1 and report.matches[0].status == "matched"
    assert report.score == 100


@pytest.mark.parametrize("cv,expected", [("5 years of Python experience", "matched"), ("1 year of Python experience", "related"), ("5 years of Java experience", "related")])
def test_years_and_scope_are_not_inferred(cv, expected):
    report = compare_cv(cv, "Developer\nRequired:\n3 years of Python experience", provider=ConstantProvider())
    years = next(item for item in report.matches if item.requirement.kind == "experience")
    assert years.status == expected
    if expected != "matched":
        assert years.rule_credit == 0 and years.semantic_credit == 0


def test_up_to_years_is_not_a_minimum_claim():
    report = compare_cv("Up to 5 years of Python experience", "Developer\nRequired:\n3 years of Python experience", provider=MissingProvider())
    assert next(item for item in report.matches if item.requirement.kind == "experience").status == "not_found"


def test_multiple_years_claims_are_not_attributed_to_wrong_skill():
    report = compare_cv("5 years of Java and 1 year of Python experience", "Developer\nRequired:\n3 years of Python experience", provider=MissingProvider())
    assert next(item for item in report.matches if item.requirement.kind == "experience").rule_credit == 0


def test_technology_mention_is_not_a_certification():
    report = compare_cv("Built services on AWS", "Cloud Engineer\nRequired:\nAWS certification", provider=ConstantProvider())
    credential = next(item for item in report.matches if item.requirement.kind == "qualification")
    assert credential.status == "related"
    assert credential.rule_credit == 0 and credential.semantic_credit == 0


@pytest.mark.parametrize("cv,expected", [("BSc in computer science", True), ("BSc in finance", False), ("Pursuing a BSc in computer science", False), ("No experience and no BSc in computer science", False)])
def test_degrees_require_explicit_level_field_and_completion(cv, expected):
    report = compare_cv(cv, "Analyst\nRequired:\nBachelor's degree in computer science", provider=ConstantProvider())
    education = next(item for item in report.matches if item.requirement.kind == "education")
    assert (education.status == "matched") is expected
    if not expected:
        assert education.semantic_credit == 0


def test_rules_only_fallback_is_explicit_and_reweights():
    report = compare_cv("Python developer", "Developer\nRequired:\nPython programming", provider=MissingProvider())
    assert report.mode == "rules_only" and report.semantic_score is None and report.model is None
    assert report.effective_settings.rules_weight == 1
    assert report.effective_settings.semantic_weight == 0
    assert report.score == 100
    assert any("100% rules" in warning for warning in report.warnings)


def test_empty_requirements_yield_no_score():
    report = compare_cv("Python developer", "Welcome to our wonderful company and friendly workplace.", provider=ConstantProvider())
    assert report.mode == "no_requirements" and report.score is None and report.matches == []


@pytest.mark.parametrize("settings", [dict(rules_weight=0.8, semantic_weight=0.8), dict(rules_weight=-1), dict(rules_weight=float("nan")), dict(related_threshold=1.1)])
def test_invalid_scoring_configuration(settings):
    with pytest.raises(ValidationError):
        MatchSettings(**settings)


def test_excerpts_are_short_and_from_original_cv():
    text = "A long CV line with Python and reporting experience. " * 20
    chunks = cv_chunks(text)
    assert all(len(chunk) <= 240 and chunk in text for chunk in chunks)


@pytest.mark.parametrize("cv", ["", "   ", "x" * 50_001], ids=["empty", "whitespace", "too-long"])
def test_cv_input_limits(cv):
    with pytest.raises(ValueError):
        compare_cv(cv, "Developer\nRequirements:\nPython and SQL", provider=MissingProvider())


def test_nonfinite_or_bad_dimensions_cannot_make_a_score():
    assert cosine([1, 0], [0, 1]) == 0
    assert cosine([0, 0], [1, 0]) == 0
    with pytest.raises(SemanticUnavailable):
        cosine([math.nan, 0], [1, 0])
    with pytest.raises(SemanticUnavailable):
        cosine([1], [1, 0])


def test_many_chunks_are_rejected_without_silent_truncation():
    with pytest.raises(ValueError, match="too many text passages"):
        cv_chunks("\n".join("Synthetic line" for _ in range(401)))
