"""CV evidence, including actions that establish capabilities without naming them.

Named products and credentials are never inferred from generic related work.
"""
import re
from typing import Literal

from pydantic import BaseModel

from skills_catalog import mentions, text_units, uncertain_or_negated

ACTION = re.compile(r'\b(?:built|build|created|create|developed|develop|used|use|analysed|analyzed|managed|maintained|automated|designed|delivered|implemented|led|supported|processed|queried|tested|improved|deployed|cleaned|combined|merged|wrote|validated|presented|resolved|coordinated|organised|organized|compared|summarised|summarized)\b', re.I)
UNPROVEN = re.compile(r"\b(?:no experience|without experience|do not have|don't have|currently learning|plan to|hope to|would like to|interested in|aspiring)\b", re.I)

# These describe capabilities rather than guessing which branded tool was used.
ACTIVITIES = {
    'Data analysis': [r'\b(?:analysed|analyzed|compared|examined|explored|interpreted)\b.{0,90}\b(?:data|datasets?|records?|trends?|sales|results|figures|transactions)\b', r'\b(?:cleaned|merged|combined|validated)\b.{0,90}\b(?:data|datasets?|records?|spreadsheets|tables)\b'],
    'Data visualisation': [r'\b(?:built|created|designed|developed|produced)\b.{0,90}\b(?:dashboards?|charts?|graphs?|visual reports)\b'],
    'SQL': [r'\b(?:wrote|writing|used|using|built|created)\b.{0,55}\b(?:select|joins?|aggregations?)\b.{0,65}\b(?:tables?|database|postgres\w*|mysql)\b', r'\b(?:queried|querying)\b.{0,70}\b(?:postgres\w*|mysql|relational database|sql server)\b'],
    'Communication': [r'\b(?:presented|explained|communicated|delivered)\b.{0,100}\b(?:findings|results|presentations?|reports?|recommendations)\b.{0,65}\b(?:team|users?|stakeholders?|directors?|clients?|audience|managers?)\b'],
    'Teamwork': [r'\b(?:worked|collaborated|partnered)\s+(?:closely\s+)?with\b.{0,85}\b(?:team|developers?|designers?|colleagues|students?|engineers?)\b'],
    'Leadership': [r'\b(?:led|mentored|supervised|coached)\b.{0,70}\b(?:team|group|students?|colleagues|developers?|people)\b'],
    'Project management': [r'\b(?:coordinated|managed|organised|organized|planned)\b.{0,80}\b(?:milestones|deadlines|project delivery|project schedule|project plan)\b'],
    'Customer service': [r'\b(?:resolved|answered|handled|responded to)\b.{0,80}\b(?:customer|client)\b.{0,45}\b(?:queries|questions|issues|complaints|requests)\b'],
    'Automated testing': [r'\b(?:wrote|created|implemented|maintained|built)\b.{0,65}\b(?:unit tests|integration tests|test suites|automated tests)\b'],
    'REST APIs': [r'\b(?:built|implemented|developed|consumed|integrated)\b.{0,65}\b(?:restful endpoints|rest endpoints|http endpoints)\b'],
}
PATTERNS = {skill: [re.compile(pattern, re.I) for pattern in patterns] for skill, patterns in ACTIVITIES.items()}


class SkillEvidence(BaseModel):
    name: str
    status: Literal['demonstrated', 'mentioned', 'inferred']
    evidence: str
    line: int
    explanation: str


class CVProfile(BaseModel):
    skills: list[SkillEvidence]
    role_families: list[str]
    education: list[str]
    note: str = 'Skills are supported by the quoted CV text, not independently verified proficiency.'


def line_number(text: str, excerpt: str) -> int:
    position = text.find(excerpt)
    return text.count('\n', 0, max(0, position)) + 1


def infer_capability(skill: str, passage: str) -> bool:
    return not UNPROVEN.search(passage) and any(pattern.search(passage) for pattern in PATTERNS.get(skill, []))


def skill_evidence(skill: str, chunks: list[str]) -> tuple[str | None, str, str]:
    named = []
    inferred = []
    for passage in chunks:
        found = [(start, end) for name, start, end in mentions(passage) if name == skill]
        if any(not uncertain_or_negated(passage, start, end) for start, end in found):
            demonstrated = bool(ACTION.search(passage) and len(passage.split()) >= 5 and not UNPROVEN.search(passage))
            named.append((demonstrated, passage))
        if infer_capability(skill, passage):
            inferred.append(passage)
    if any(item[0] for item in named):
        return next(passage for demonstrated, passage in named if demonstrated), 'demonstrated', 'The CV names the skill and describes using it.'
    if inferred:
        return inferred[0], 'inferred', 'The work described demonstrates this capability even though the exact skill name is absent.'
    if named:
        return named[0][1], 'mentioned', 'The skill is listed, but a clear example of using it was not found.'
    return None, 'not_found', 'No supporting CV passage was found; that does not establish that you lack the skill.'


FAMILIES = {
    'Data analysis and reporting': {'Data analysis', 'Data visualisation', 'SQL', 'Excel', 'Power BI', 'Tableau', 'Pandas', 'Statistical analysis'},
    'Software development': {'Python', 'JavaScript', 'TypeScript', 'Java', 'React', 'REST APIs', 'Automated testing', 'Git', 'Docker', 'C++', 'C#'},
    'Design and user research': {'Figma', 'UX design', 'UI design', 'User research', 'HTML', 'CSS'},
    'Business and finance': {'Financial analysis', 'Business analysis', 'Risk management', 'Project management', 'Excel'},
    'Customer support and operations': {'Customer service', 'Communication', 'Teamwork', 'Sales', 'Project management'},
    'Marketing': {'Digital marketing', 'Communication', 'Sales', 'Data analysis'},
}


def understand_cv(text: str, chunks: list[str] | None = None) -> CVProfile:
    chunks = chunks or text_units(text)
    names = {name for name, _, _ in mentions(text)} | set(ACTIVITIES)
    skills = []
    for name in sorted(names):
        evidence, status, explanation = skill_evidence(name, chunks)
        if evidence:
            skills.append(SkillEvidence(name=name, status=status, evidence=evidence, line=line_number(text, evidence), explanation=explanation))
    actual = {item.name for item in skills}
    families = sorted(((len(actual & values), family) for family, values in FAMILIES.items() if len(actual & values) >= 2), reverse=True)
    education = [line.strip() for line in text.splitlines() if re.search(r'\b(?:university|college|bachelor|master|bsc|msc|degree|diploma|phd)\b', line, re.I)][:6]
    return CVProfile(skills=skills, role_families=[family for _, family in families[:3]], education=education)
