"""Explainable text alignment, not a predictor of hiring outcomes."""
import math
import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from job_analyser import DEGREES, YEAR_PATTERN, JobAnalysis, Requirement, analyse_job
from semantic import MODEL_NAME, EmbeddingProvider, SemanticUnavailable, get_semantic_provider
from skills_catalog import mentions, normalise, text_units, uncertain_or_negated
from cv_review import ApplicantReview, build_review, is_section_heading

MAX_CV_CHARACTERS = 50_000
MAX_CV_CHUNKS = 400
PRIORITY_WEIGHTS = {"required": 2.0, "unspecified": 1.0, "preferred": 0.5}


class MatchSettings(BaseModel):
    rules_weight: float = Field(default=0.6, ge=0, le=1, allow_inf_nan=False)
    semantic_weight: float = Field(default=0.4, ge=0, le=1, allow_inf_nan=False)
    related_threshold: float = Field(default=0.5, ge=0.25, le=0.95, allow_inf_nan=False)

    @model_validator(mode="after")
    def weights_sum_to_one(self):
        if not math.isclose(self.rules_weight + self.semantic_weight, 1.0, abs_tol=1e-6):
            raise ValueError("Rules and semantic weights must add up to 1.")
        return self


class RequirementMatch(BaseModel):
    requirement: Requirement
    status: Literal["matched", "related", "not_found"]
    evidence: str | None
    reason: str
    similarity: float | None
    rule_credit: float
    semantic_credit: float | None
    priority_weight: float
    suggestion: str


class MatchReport(BaseModel):
    review: ApplicantReview
    analysis: JobAnalysis
    matches: list[RequirementMatch]
    score: float | None
    rules_score: float | None
    semantic_score: float | None
    mode: Literal["hybrid", "rules_only", "no_requirements"]
    model: str | None
    requested_settings: MatchSettings
    effective_settings: MatchSettings
    counts: dict[str, int]
    warnings: list[str]
    explanation: str


def cv_chunks(text: str) -> list[str]:
    chunks = []
    for unit in text_units(text):
        # Short contiguous excerpts avoid full-CV truncation by the sentence model.
        while len(unit) > 240:
            boundary = unit.rfind(" ", 0, 240)
            if boundary < 80:
                boundary = 240
            chunks.append(unit[:boundary])
            unit = unit[boundary:].lstrip()
        if unit:
            chunks.append(unit)
    if len(chunks) > MAX_CV_CHUNKS:
        raise ValueError("The CV has too many text passages for comparison. Use a shorter CV (up to 400 passages).")
    return chunks


def positive_skills(text: str) -> set[str]:
    return {name for name, start, end in mentions(text) if not uncertain_or_negated(text, start, end)}


def acceptable_passage(requirement: Requirement, text: str) -> bool:
    if is_section_heading(text):
        return False
    skill_mentions = [item for item in mentions(text) if item[0] in requirement.skills]
    if skill_mentions and all(uncertain_or_negated(text, start, end) for _, start, end in skill_mentions):
        return False
    # Negated non-skill statements are never evidence of meeting a requirement.
    return not re.search(r"\b(?:no experience|without experience|do not have|don't have|not qualified|currently learning|plan to gain|hope to gain)\b", text, re.I)


def explicit_match(requirement: Requirement, chunks: list[str]) -> tuple[str | None, str]:
    for chunk in chunks:
        if not acceptable_passage(requirement, chunk):
            continue
        if requirement.kind == "skill":
            if positive_skills(chunk).intersection(requirement.skills):
                return chunk, "The CV explicitly mentions the skill or a recognised alias. This is a text match, not verified proficiency."
        elif requirement.kind == "experience":
            if len(list(YEAR_PATTERN.finditer(chunk))) > 1:
                continue  # Multiple claims in one passage need manual attribution.
            years = YEAR_PATTERN.search(chunk)
            if years and float(years.group(1)) >= (requirement.minimum_years or 0):
                if re.search(r"\b(?:less than|up to|at most|nearly|almost)\b", chunk[:years.start()], re.I):
                    continue
                if not requirement.skills or positive_skills(chunk).intersection(requirement.skills):
                    return chunk, "The CV explicitly states enough years in the requested scope. Dates and overlapping roles are not inferred."
        elif requirement.kind == "education":
            if re.search(DEGREES[requirement.degree], normalise(chunk)) and (not requirement.field or requirement.field in normalise(chunk)):
                if not re.search(r"\b(?:studying|pursuing|in progress|expected|incomplete|no|without)\b", chunk, re.I):
                    return chunk, "The CV explicitly names this degree level and any recognised requested field. Credentials are not independently verified."
        else:
            # Conservative: paraphrases belong in related evidence, not exact matches.
            phrase = normalise(requirement.source).rstrip(".! ")
            phrase = re.sub(r"^(?:must|should|you will|you must|required to)\s+", "", phrase)
            if len(phrase) >= 15 and phrase in normalise(chunk):
                return chunk, "The CV contains the same requirement wording. Review the quoted context."
    return None, "No explicit supporting statement was found in this CV. This does not establish that you lack the skill or experience."


def cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left or not all(math.isfinite(value) for value in left + right):
        raise SemanticUnavailable("Invalid local embedding output.")
    norm = math.sqrt(sum(value * value for value in left) * sum(value * value for value in right))
    return max(0.0, min(1.0, sum(a * b for a, b in zip(left, right)) / norm)) if norm else 0.0


def compare_cv(cv_text: str, job_description: str, settings: MatchSettings | None = None,
               provider: EmbeddingProvider | None = None) -> MatchReport:
    settings = settings or MatchSettings()
    if not cv_text.strip() or len(cv_text) > MAX_CV_CHARACTERS:
        raise ValueError("Use non-empty CV text of 50,000 characters or fewer for comparison.")
    analysis = analyse_job(job_description)
    chunks = cv_chunks(cv_text)
    if not chunks:
        raise ValueError("The CV contains no readable text for comparison.")
    warnings = list(analysis.warnings)
    effective = settings.model_copy()
    similarities: list[list[float]] | None = None
    if analysis.requirements:
        try:
            provider = provider or get_semantic_provider()
            queries = [requirement.label[:240] for requirement in analysis.requirements]
            vectors = provider.embed(queries + chunks)
            if len(vectors) != len(queries) + len(chunks):
                raise SemanticUnavailable("Incomplete embedding output.")
            similarities = [[cosine(query, chunk) for chunk in vectors[len(queries):]] for query in vectors[:len(queries)]]
        except (SemanticUnavailable, ImportError):
            effective = MatchSettings(rules_weight=1, semantic_weight=0, related_threshold=settings.related_threshold)
            warnings.append("Local semantic comparison is unavailable. This report uses explicit rules only (100% rules, 0% semantic).")

    matches = []
    for index, requirement in enumerate(analysis.requirements):
        evidence, reason = explicit_match(requirement, chunks)
        explicit = evidence is not None
        similarity = None
        related_evidence = None
        if similarities is not None:
            candidates = [(value, chunk) for value, chunk in zip(similarities[index], chunks)
                          if acceptable_passage(requirement, chunk)]
            if candidates:
                similarity, related_evidence = max(candidates, key=lambda item: item[0])
            else:
                similarity = 0.0
        status = "matched" if explicit else "related" if similarity is not None and similarity >= settings.related_threshold else "not_found"
        if status == "related":
            evidence = related_evidence
            reason = "This passage is similar in meaning, but does not explicitly establish the requirement. Review it before claiming a match."
        # Similarity cannot supply missing years or a missing degree credential.
        semantic_credit = similarity
        if requirement.kind in {"experience", "education", "qualification"} and not explicit and similarity is not None:
            semantic_credit = 0.0
            reason += " Semantic similarity cannot satisfy a missing years, degree or credential requirement."
        if status == "matched":
            suggestion = f"Keep the quoted evidence for {requirement.label} visible. Add specific context or outcomes only when supported by your actual experience."
        elif status == "related":
            suggestion = f"Review the quoted passage against {requirement.label}. Clarify the connection only if it accurately describes work you have done."
        else:
            suggestion = f"Evidence for {requirement.label} was not found in the CV. Add a truthful example only if you have one; otherwise leave this as a gap."
        matches.append(RequirementMatch(
            requirement=requirement, status=status, evidence=evidence, reason=reason,
            similarity=round(similarity, 4) if similarity is not None else None,
            rule_credit=1.0 if explicit else 0.0,
            semantic_credit=round(semantic_credit, 4) if semantic_credit is not None else None,
            priority_weight=PRIORITY_WEIGHTS[requirement.priority], suggestion=suggestion,
        ))
    denominator = sum(item.priority_weight for item in matches)
    rules_score = 100 * sum(item.rule_credit * item.priority_weight for item in matches) / denominator if denominator else None
    semantic_score = 100 * sum((item.semantic_credit or 0) * item.priority_weight for item in matches) / denominator if denominator and similarities is not None else None
    score = rules_score * effective.rules_weight + (semantic_score or 0) * effective.semantic_weight if rules_score is not None else None
    mode = "no_requirements" if not matches else "hybrid" if similarities is not None else "rules_only"
    return MatchReport(
        review=build_review(cv_text, matches, chunks, mode),
        analysis=analysis, matches=matches,
        score=round(score, 1) if score is not None else None,
        rules_score=round(rules_score, 1) if rules_score is not None else None,
        semantic_score=round(semantic_score, 1) if semantic_score is not None else None,
        mode=mode,
        model=MODEL_NAME if similarities is not None else None,
        requested_settings=settings, effective_settings=effective,
        counts={status: sum(item.status == status for item in matches) for status in ("matched", "related", "not_found")},
        warnings=warnings,
        explanation="Weighted requirement coverage: required ×2, unspecified ×1, preferred ×0.5. Rules score = explicit matched weight / total weight ×100. Semantic score = weighted mean of the best non-negative excerpt cosine ×100, with zero semantic credit for unproven years, degree or credential requirements. Overall = rules score × effective rules weight + semantic score × effective semantic weight. Weights and thresholds are unvalidated heuristics. This measures CV text alignment, not hiring likelihood or verified capability.",
    )
