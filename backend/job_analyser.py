"""Deterministic job requirement extraction, with source text for review."""
import re
from typing import Literal

from pydantic import BaseModel, Field

from skills_catalog import mentions, normalise, text_units, uncertain_or_negated

Priority = Literal["required", "preferred", "unspecified"]
Kind = Literal["skill", "experience", "education", "qualification", "responsibility", "other"]
MAX_JOB_CHARACTERS = 20_000
MAX_REQUIREMENTS = 80


class Requirement(BaseModel):
    id: str
    label: str
    kind: Kind
    priority: Priority
    source: str
    skills: list[str] = Field(default_factory=list)
    minimum_years: float | None = None
    degree: str | None = None
    field: str | None = None


class JobAnalysis(BaseModel):
    title: str | None
    requirements: list[Requirement]
    warnings: list[str]
    method: str = "English rules and a curated skill catalogue"


NUMBER_WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10}
YEAR_PATTERN = re.compile(
    r"\b(?:at least\s+|minimum(?: of)?\s+)?(\d{1,2}(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*"
    r"(?:[-–]\s*\d{1,2}\s*)?\+?\s*(?:or more\s+)?years?\b", re.I
)


def year_value(value: str) -> float:
    return float(NUMBER_WORDS[value.casefold()]) if value.casefold() in NUMBER_WORDS else float(value)
DEGREES = {
    "bachelor": r"\b(?:bachelor'?s?|bsc|b\.sc\.?|beng|b\.eng\.?)\b",
    "master": r"\b(?:master'?s?|msc|m\.sc\.?|meng|m\.eng\.?)\b",
    "doctorate": r"\b(?:phd|ph\.d\.?|doctorate|doctoral)\b",
}
FIELDS = ("computer science", "data science", "business", "engineering", "mathematics", "statistics", "finance")
REQUIRED = re.compile(r"\b(?:essential|must|required|minimum|mandatory|need to|at least)\b", re.I)
PREFERRED = re.compile(r"\b(?:preferred|desirable|nice to have|bonus|advantage|ideally|optional)\b", re.I)
HEADINGS = {
    "required": r"(?:requirements|qualifications|essential(?: skills)?|required(?: skills)?|must.have|what you(?:'ll)? bring|what you(?:'ll| will) need(?: to thrive| to succeed)?|what we(?:'re| are) looking for|minimum qualifications|who you are|your skills|your experience|what makes you great)",
    "preferred": r"(?:preferred(?: skills| qualifications)?|desirable(?: skills)?|nice.to.have|bonus(?: points)?)",
    "responsibility": r"(?:responsibilities|your responsibilities|what you(?:'ll| will) do|the role|about the role|your role|duties)",
    "ignore": r"(?:benefits|what we offer|about us|about the company|equal opportunit\w*|how to apply|salary|perks)",
}


def analyse_job(text: str) -> JobAnalysis:
    if not 30 <= len(text.strip()) <= MAX_JOB_CHARACTERS:
        raise ValueError("Paste a job description between 30 and 20,000 characters.")
    units = text_units(text)
    first = units[0] if units else ""
    title = first if len(first) <= 100 and not REQUIRED.search(first) and not first.endswith(":") else None
    found: dict[str, Requirement] = {}
    context = "unspecified"
    warnings = ["Requirements are extracted with English rules. Review the source excerpts for omissions or ambiguous wording."]
    ranks = {"preferred": 0, "unspecified": 1, "required": 2}

    def add(key: str, label: str, kind: Kind, priority: Priority, source: str, **details):
        candidate = Requirement(id="", label=label, kind=kind, priority=priority, source=source, **details)
        if key not in found or ranks[priority] > ranks[found[key].priority]:
            found[key] = candidate

    for unit in units:
        heading, separator, remainder = unit.partition(":")
        new_context = next((key for key, pattern in HEADINGS.items() if re.fullmatch(pattern, normalise(heading.strip()), re.I)), None)
        if new_context:
            context = new_context
            if not separator or not remainder.strip():
                continue
            unit = remainder.strip()
        if context == "ignore":
            continue
        if re.search(r'\b(?:we|company)\b.{0,30}\b(?:offer|provide|support)\b.{0,30}sponsor|visa sponsorship.{0,20}(?:available|offered|provided)', unit, re.I):
            continue  # Employer policy, handled separately from applicant skills.
        if not mentions(unit) and re.search(r'\b(?:we expect excellence|best at what we do|equal opportunity|we are committed to diversity|our mission is)\b', unit, re.I):
            continue
        # A "not required" clause should not create a positive requirement.
        if re.search(r"\b(?:not required|not necessary|not essential|no .{0,30}experience (?:is )?required)\b", unit, re.I) and not any(not uncertain_or_negated(unit, start, end) for _, start, end in mentions(unit)):
            warnings.append(f"Excluded an explicitly optional/non-required clause: {unit}")
            continue
        priority: Priority = (
            "preferred" if PREFERRED.search(unit) else
            "required" if REQUIRED.search(unit) or context == "required" else
            "preferred" if context == "preferred" else "unspecified"
        )
        skills = list(dict.fromkeys(name for name, start, end in mentions(unit) if not uncertain_or_negated(unit, start, end)))
        all_mentions = mentions(unit)
        between = unit[all_mentions[0][1]:all_mentions[-1][2]] if all_mentions else ""
        alternatives = len(skills) > 1 and re.search(r"\bor\b", between, re.I) and not re.search(r"\band\b", between, re.I)
        if alternatives:
            add("any:" + ",".join(sorted(skills)), " or ".join(skills), "skill", priority, unit, skills=skills)
        else:
            for skill in skills:
                add("skill:" + skill, skill, "skill", priority, unit, skills=[skill])
        years = YEAR_PATTERN.search(unit)
        if years and not re.search(r"\b(?:up to|at most|less than)\b", unit[:years.start()], re.I):
            minimum = year_value(years.group(1))
            if minimum <= 50:
                scope = skills if len(skills) == 1 else []
                label = f"At least {minimum:g} years of experience" + (f" with {scope[0]}" if scope else "")
                add("years:" + str(minimum) + ",".join(scope), label, "experience", priority, unit, minimum_years=minimum, skills=scope)
        degree = next((name for name, pattern in DEGREES.items() if re.search(pattern, normalise(unit))), None)
        qualification_alternative = degree and re.search(r"\bor\b", unit, re.I)
        qualification = bool(qualification_alternative or re.search(r"\b(?:certification|certified|licen[cs]e)\b", unit, re.I))
        if qualification:
            add("qualification:" + normalise(unit), unit, "qualification", priority, unit)
        elif degree:
            field = next((field for field in FIELDS if field in normalise(unit)), None)
            label = degree.capitalize() + " degree" + (f" in {field}" if field else "")
            add("degree:" + degree + str(field), label, "education", priority, unit, degree=degree, field=field)
        action = re.search(r"\b(?:build|develop|design|deliver|manage|maintain|collaborate|communicate|lead|support|create)\b", unit, re.I)
        if context == "responsibility" or (action and len(unit.split()) >= 5):
            add("task:" + normalise(unit), unit, "responsibility", priority, unit)
        elif not skills and not years and not degree and not qualification and (context in {"required", "preferred"} or REQUIRED.search(unit)) and len(unit.split()) >= 3:
            add("other:" + normalise(unit), unit, "other", priority, unit)

    requirements = list(found.values())
    if len(requirements) > MAX_REQUIREMENTS:
        raise ValueError("This advert has more than 80 extracted requirements. Paste the relevant requirements section instead.")
    for index, requirement in enumerate(requirements, 1):
        requirement.id = f"req-{index}"
    if not requirements:
        warnings.append("No requirements were identified. Paste the responsibilities and qualifications sections; no score can be calculated yet.")
    return JobAnalysis(title=title, requirements=requirements, warnings=warnings)
