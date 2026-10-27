from matching import compare_cv
from semantic import SemanticUnavailable


class SameMeaning:
    def embed(self, texts):
        return [[1.0, 0.0] for _ in texts]


class Offline:
    def embed(self, texts):
        raise SemanticUnavailable("Missing")


JOB = "Data Analyst\nRequired:\nPython and SQL\nResponsibilities:\nBuild reporting dashboards for business stakeholders.\nPreferred:\nKubernetes"


def slice_browser(text, start, end):
    return text.encode("utf-16-le")[start * 2:end * 2].decode("utf-16-le")


def test_groups_skill_list_into_one_concrete_action():
    cv = "Skills\nPython SQL\nWork experience\nBuilt a reporting dashboard"
    plan = compare_cv(cv, JOB, provider=SameMeaning()).review
    skills = [item for item in plan.changes if item.category == "skills"]
    assert len(skills) == 1
    assert skills[0].title == "Show how you used Python, SQL"
    assert "Work experience" in skills[0].section
    assert "separate examples" in skills[0].steps[0]
    assert "actual" in skills[0].structure
    for item in plan.changes:
        assert slice_browser(cv, item.start, item.end) == item.excerpt


def test_specific_reporting_instruction_is_anchored_in_actual_work():
    cv = "Work experience\nBuilt a reporting dashboard"
    item = next(item for item in compare_cv(cv, JOB, provider=SameMeaning()).review.changes if item.category == "detail")
    assert item.excerpt == "Built a reporting dashboard"
    assert item.section == "Work experience"
    assert "who used it" in item.steps[0]
    assert "actual tools" in item.structure
    assert item.replacement is None


def test_missing_skills_are_separate_and_never_get_a_fake_highlight_or_rewrite():
    plan = compare_cv("Python developer", JOB, provider=Offline()).review
    gap = next(item for item in plan.gaps if item.title == "Kubernetes")
    assert gap.excerpt is None and gap.start is None and gap.end is None
    assert gap.replacement is None and gap.structure is None
    assert "If you have used" in gap.steps[0] and "do not add" in gap.steps[1]


def test_skills_with_real_examples_are_covered_without_unnecessary_edits():
    cv = "Skills\nPython SQL\nWork experience\nUsed Python and SQL to automate daily reporting."
    plan = compare_cv(cv, "Developer\nRequired:\nPython and SQL", provider=SameMeaning()).review
    assert plan.covered == ["Python", "SQL"]
    assert not plan.changes and not plan.gaps


def test_spelling_repeated_words_case_and_utf16_positions():
    cv = "Profile 😀\nExperiance in managment\nWork experience\nManaged the the reporting team.\nSkills\nPython"
    plan = compare_cv(cv, JOB, provider=Offline()).review
    spelling = [item for item in plan.changes if item.category == "spelling"]
    assert [item.replacement for item in spelling] == ["Experience", "management"]
    repeated = next(item for item in plan.changes if item.category == "wording")
    assert repeated.excerpt == "the the" and repeated.replacement == "the"
    for item in plan.changes:
        assert slice_browser(cv, item.start, item.end) == item.excerpt


def test_repeated_typo_occurrences_have_distinct_correct_offsets():
    cv = "Experiance\nexperiance\nPython"
    items = [item for item in compare_cv(cv, JOB, provider=Offline()).review.changes if item.category == "spelling"]
    assert len(items) == 2 and items[0].start != items[1].start
    assert all(slice_browser(cv, item.start, item.end) == item.excerpt for item in items)


def test_legitimate_had_had_and_that_that_are_not_marked_as_repeated_word_errors():
    plan = compare_cv("I had had training that that team provided. Python", JOB, provider=Offline()).review
    assert not any(item.category == "wording" for item in plan.changes)


def test_hard_requirements_are_checks_not_invented_experience():
    plan = compare_cv("Python\n1 year of experience", "Developer\nRequired:\n5 years of Python experience\nBachelor's degree in computer science", provider=SameMeaning()).review
    assert {item.category for item in plan.gaps} >= {"experience", "education"}
    assert all(item.replacement is None and item.excerpt is None for item in plan.gaps)


def test_annotations_are_capped_with_a_plain_language_notice():
    plan = compare_cv("experiance " * 60, JOB, provider=Offline()).review
    assert len(plan.changes) == 40
    assert any("first 40" in notice for notice in plan.notices)


def test_no_model_and_no_requirements_have_actionable_notices_without_scoring_jargon():
    plan = compare_cv("Python", JOB, provider=Offline()).review
    assert any("named requirements" in notice for notice in plan.notices)
    assert not any("semantic" in notice or "%" in notice for notice in plan.notices)
    empty = compare_cv("Python", "Welcome to our friendly company and wonderful workplace.", provider=Offline()).review
    assert any("Paste its responsibilities" in notice for notice in empty.notices)
