import pytest

from job_analyser import analyse_job
from skills_catalog import mentions


def test_extracts_required_preferred_aliases_and_sources():
    job = "Data Analyst\nEssential skills:\nPython and structured query language\nPreferred:\nPowerBI and Amazon Web Services"
    result = analyse_job(job)
    skills = {item.label: item for item in result.requirements}
    assert result.title == "Data Analyst"
    assert skills["SQL"].priority == "required"
    assert skills["AWS"].priority == "preferred"
    assert skills["Python"].source == "Python and structured query language"
    assert len({item.id for item in result.requirements}) == len(result.requirements)


@pytest.mark.parametrize("text,expected", [
    ("JavaScript and MySQL", {"JavaScript", "MySQL"}),
    ("C++ C# .NET Node.js React.js", {"C++", "C#", ".NET", "Node.js", "React"}),
    ("Go to the office and excel at communication", {"Communication"}),
    ("Pythonic systems", set()),
])
def test_skill_boundaries(text, expected):
    assert {name for name, _, _ in mentions(text)} == expected


def test_deduplicates_skills_with_strongest_priority():
    result = analyse_job("Developer\nPreferred:\nPython\nRequired:\nPython and SQL\nPython")
    python = [item for item in result.requirements if item.label == "Python"]
    assert len(python) == 1 and python[0].priority == "required"


def test_preserves_unknown_requirements_and_ignores_benefits():
    result = analyse_job("Analyst\nRequirements:\nMust be willing to travel twice each month\nBenefits:\nFree Python training and SQL workshops")
    assert len(result.requirements) == 1
    assert result.requirements[0].kind == "other"
    assert "travel" in result.requirements[0].source


def test_qualification_is_not_duplicated_as_unknown_requirement():
    result = analyse_job("Analyst\nRequired:\nMust hold a valid driving licence")
    assert len(result.requirements) == 1
    assert result.requirements[0].kind == "qualification"


def test_extracts_years_degree_and_responsibilities():
    result = analyse_job("Data Analyst\nRequirements:\nAt least 3+ years of Python experience\nBachelor's degree in computer science\nResponsibilities:\nBuild reporting dashboards for the finance team.")
    experience = next(item for item in result.requirements if item.kind == "experience")
    education = next(item for item in result.requirements if item.kind == "education")
    assert experience.minimum_years == 3 and experience.skills == ["Python"]
    assert education.degree == "bachelor" and education.field == "computer science"
    assert any(item.kind == "responsibility" for item in result.requirements)


def test_simple_alternatives_are_one_requirement():
    requirements = analyse_job("Developer\nRequirements:\nPython or Java programming skills are required").requirements
    assert len(requirements) == 1
    assert requirements[0].skills == ["Python", "Java"]


def test_excludes_explicitly_not_required_clause():
    result = analyse_job("Developer\nRequirements:\nPython is not required\nSQL experience is essential")
    assert {item.label for item in result.requirements} == {"SQL"}
    assert any("Excluded" in warning for warning in result.warnings)


@pytest.mark.parametrize("value", ["", "   ", "Short advert", "x" * 20_001], ids=["empty", "whitespace", "short", "too-long"])
def test_description_limits(value):
    with pytest.raises(ValueError):
        analyse_job(value)


def test_no_requirements_is_explained():
    result = analyse_job("Welcome to our friendly organisation. We offer a pleasant place to work.")
    assert result.requirements == []
    assert any("No requirements" in warning for warning in result.warnings)
