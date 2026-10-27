"""Applicant-facing edits, anchored to the submitted CV. No invented experience."""
import re
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from matching import RequirementMatch


class ReviewItem(BaseModel):
    id: str = ""
    category: Literal["spelling", "wording", "detail", "skills", "experience", "education", "qualification", "gap"]
    title: str
    section: str
    explanation: str
    steps: list[str]
    excerpt: str | None = None
    start: int | None = None  # UTF-16 offsets, matching browser string indexing.
    end: int | None = None
    replacement: str | None = None
    structure: str | None = None
    job_requirement: str | None = None
    priority: Literal["required", "preferred", "unspecified"] = "unspecified"
    requirement_ids: list[str] = Field(default_factory=list)


class ApplicantReview(BaseModel):
    changes: list[ReviewItem]
    gaps: list[ReviewItem]
    covered: list[str]
    notices: list[str]


SPELLING = {
    "experiance": "experience", "experinced": "experienced",
    "managment": "management", "responsibilites": "responsibilities",
    "acheived": "achieved", "sucessfully": "successfully",
    "enviroment": "environment", "seperately": "separately",
    "communcation": "communication", "developement": "development",
    "analaysis": "analysis", "knowlege": "knowledge", "proffesional": "professional",
}
HEADINGS = {
    "Work experience": r"(?:work experience|professional experience|experience|employment history|career history)",
    "Projects": r"(?:projects|personal projects|selected projects|academic projects)",
    "Skills": r"(?:skills|technical skills|key skills|core skills|skills summary)",
    "Education": r"(?:education|academic qualifications|education and qualifications)",
    "Qualifications": r"(?:qualifications|certifications|certificates|licences|licenses)",
    "Profile": r"(?:profile|summary|professional summary|personal profile|career summary)",
}
ACTION = re.compile(r"\b(?:built|created|developed|used|analysed|analyzed|managed|maintained|automated|designed|delivered|implemented|led|supported|processed|queried|tested|improved|deployed)\b", re.I)


def is_section_heading(text: str) -> bool:
    return any(re.fullmatch(pattern, text.strip(" \t:#•*-–—"), re.I) for pattern in HEADINGS.values())


def utf16_offset(text: str, offset: int) -> int:
    return len(text[:offset].encode("utf-16-le")) // 2


def section_at(text: str, position: int) -> str:
    section = "The highlighted passage"
    for line in text[:position].splitlines():
        heading = line.strip(" \t:#•*-–—")
        for name, pattern in HEADINGS.items():
            if re.fullmatch(pattern, heading, re.I):
                section = name
    return section


def anchor(item: ReviewItem, text: str, excerpt: str) -> ReviewItem:
    position = text.find(excerpt)
    if position >= 0:
        item.excerpt = excerpt
        item.start = utf16_offset(text, position)
        item.end = utf16_offset(text, position + len(excerpt))
    return item


def build_review(cv_text: str, matches: list["RequirementMatch"], chunks: list[str], mode: str) -> ApplicantReview:
    # Import at call time to keep the matching API's public models independent.
    from matching import acceptable_passage, positive_skills

    changes: list[ReviewItem] = []
    gaps: list[ReviewItem] = []
    covered = []
    notices = []
    for match in re.finditer(r"\b(" + "|".join(SPELLING) + r")\b", cv_text, re.I):
        original = match.group()
        replacement = SPELLING[original.lower()]
        if original.isupper():
            replacement = replacement.upper()
        elif original[0].isupper():
            replacement = replacement.capitalize()
        changes.append(anchor(ReviewItem(
            category="spelling", title=f'Change “{original}” to “{replacement}”',
            section=section_at(cv_text, match.start()), explanation="This word appears to be misspelled.",
            steps=[f'Replace “{original}” with “{replacement}”.'], replacement=replacement,
        ), cv_text, original))
        # A repeated typo must point to this occurrence, not the first one.
        changes[-1].start = utf16_offset(cv_text, match.start())
        changes[-1].end = utf16_offset(cv_text, match.end())
    for match in re.finditer(r"\b(the|and|with|to|of|in|for|an|a)([ \t]+)\1\b", cv_text, re.I):
        changes.append(anchor(ReviewItem(
            category="wording", title=f'Remove the repeated “{match.group(1)}”',
            section=section_at(cv_text, match.start()), explanation="The same word appears twice in a row.",
            steps=["Keep one copy of the highlighted word."], replacement=match.group(1),
        ), cv_text, match.group()))
        changes[-1].start = utf16_offset(cv_text, match.start())
        changes[-1].end = utf16_offset(cv_text, match.end())

    skill_groups: dict[str, list["RequirementMatch"]] = {}
    detail_groups: dict[str, ReviewItem] = {}
    detail_kinds: dict[str, str] = {}
    for match in matches:
        requirement = match.requirement
        if requirement.kind == "skill" and match.status == "matched":
            # A skills-list mention alone does not show how the tool was used.
            examples = [chunk for chunk in chunks if
                        positive_skills(chunk).intersection(requirement.skills)
                        and acceptable_passage(requirement, chunk)
                        and ACTION.search(chunk) and len(chunk.split()) >= 5]
            if examples:
                covered.append(requirement.label)
            elif match.evidence:
                skill_groups.setdefault(match.evidence, []).append(match)
            continue
        if match.status == "matched":
            covered.append(requirement.label)
            continue
        if requirement.kind in {"experience", "education", "qualification"} or match.status == "not_found":
            section = {"experience": "Work experience", "education": "Education", "qualification": "Qualifications"}.get(requirement.kind, "Skills and the relevant role or project")
            if requirement.kind == "experience":
                steps = ["Check the time you have actually spent doing this work; do not count overlapping roles twice.", "If you meet the requirement, make the relevant roles and dates clear. Do not add years you cannot support."]
            elif requirement.kind in {"education", "qualification"}:
                steps = ["Check whether you hold the qualification requested in the advert.", f"If you do, list its official name and awarding institution under {section.lower()}. Otherwise leave this as a gap."]
            elif requirement.kind == "skill":
                steps = [f"If you have used {requirement.label}, add a real example under the relevant role or project.", "State what you did, the tool or skill you used, and its purpose. If you have no supporting experience, do not add this claim."]
            else:
                steps = ["Check the requirement from the advert below against your actual experience or circumstances.", "If you can support it, state it clearly in the relevant CV section or application answer. Otherwise leave it as a gap."]
            gaps.append(ReviewItem(
                category=requirement.kind if requirement.kind in {"experience", "education", "qualification"} else "gap",
                title=requirement.label, section=section,
                explanation="Your CV does not clearly establish this job requirement. Check whether it is something you can truthfully add.",
                steps=steps, job_requirement=requirement.source, priority=requirement.priority,
                requirement_ids=[requirement.id],
            ))
            continue
        if match.evidence:
            evidence = match.evidence
            previous_ids = []
            if evidence in detail_groups:
                detail_groups[evidence].requirement_ids.append(requirement.id)
                if requirement.kind != "responsibility" or detail_kinds[evidence] == "responsibility":
                    continue
                previous_ids = detail_groups[evidence].requirement_ids[:-1]
            target = requirement.label.lower()
            if re.search(r"dashboard|report|visualis|visualiz", target):
                title = "Explain what your reporting work helped people do"
                steps = ["Expand the highlighted bullet: say what you built or reported, who used it, and what it helped them do.", "Name the tools you actually used. Add a result only if you can support it."]
                structure = "[What you built or reported] using [actual tools] for [actual users], to [real purpose or outcome]."
            elif re.search(r"analys|analyz|data", target):
                title = "Make your analysis example more specific"
                steps = ["In the highlighted bullet, name the data you worked with and the analysis you performed.", "Explain the decision or task your work supported. Use only details from your own experience."]
                structure = "Analysed [actual data] using [actual method/tool] to help [real decision or purpose]."
            elif re.search(r"communicat|stakeholder|collaborat", target):
                title = "Show who you worked with and why"
                steps = ["Name the people or teams you actually worked with in this example.", "Explain what you communicated or delivered and what it helped them do."]
                structure = "Worked with [actual team or audience] to [your actual contribution and purpose]."
            else:
                title = "Add detail to this work example"
                steps = ["Expand the highlighted passage with the task you personally did, how you did it and why it mattered.", "Connect it to the job requirement only where your actual experience supports that connection."]
                structure = "[Your action] using [actual tools or approach] to [real purpose or outcome]."
            detail_groups[evidence] = anchor(ReviewItem(
                category="detail", title=title,
                section=section_at(cv_text, cv_text.find(evidence)), explanation="The advert asks for more specific experience than this passage currently shows.",
                steps=steps, structure=structure, job_requirement=requirement.source,
                priority=requirement.priority, requirement_ids=previous_ids + [requirement.id],
            ), cv_text, evidence)
            detail_kinds[evidence] = requirement.kind

    for evidence, group in skill_groups.items():
        labels = ", ".join(item.requirement.label for item in group)
        changes.append(anchor(ReviewItem(
            category="skills", title=f"Show how you used {labels}", section="Work experience or Projects",
            explanation="These skills appear in your CV, but I could not find a clear example of how you used them.",
            steps=[f"Under the relevant role or project, add an example for {labels}. These can be separate examples.", "For each example, say what you did, which skill you used and its real purpose or result."],
            structure="[Action you actually took] using [skill used in that work] to [real purpose or outcome].",
            job_requirement=group[0].requirement.source,
            priority="required" if any(item.requirement.priority == "required" for item in group) else group[0].requirement.priority,
            requirement_ids=[item.requirement.id for item in group],
        ), cv_text, evidence))
    changes.extend(detail_groups.values())
    rank = {"required": 0, "unspecified": 1, "preferred": 2}
    changes.sort(key=lambda item: (0 if item.replacement is not None else 1, rank[item.priority], item.start or 0))
    gaps.sort(key=lambda item: rank[item.priority])
    if len(changes) > 40:
        changes = changes[:40]
        notices.append("Showing the first 40 suggested changes. Fix these and review again to see the rest.")
    for index, item in enumerate(changes + gaps, 1):
        item.id = f"review-{index}"
    if mode == "no_requirements":
        notices.append("The advert did not include clear requirements to review. Paste its responsibilities and qualifications, then analyse again.")
    elif mode == "rules_only":
        notices.append("This review checked named requirements only. Check the full advert for other experience the role asks for.")
    return ApplicantReview(changes=changes, gaps=gaps, covered=list(dict.fromkeys(covered)), notices=notices)
