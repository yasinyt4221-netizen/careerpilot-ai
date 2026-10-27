"""CV-only review and optional, explicitly requested Gemini enrichment."""
from job_analyser import JobAnalysis, Requirement, analyse_job, YEAR_PATTERN
from matching import MatchReport, MatchSettings, RequirementMatch, compare_cv, cv_chunks, explicit_match
from cv_review import ReviewItem, anchor, build_review, section_at, utf16_offset
from cv_evidence import understand_cv, line_number, SkillEvidence, ACTIVITIES, UNPROVEN, skill_evidence
from skills_catalog import SKILLS, mentions
import gemini_review


def review_documents(cv_text: str, job_description: str = '', provider: str = 'local') -> MatchReport:
    if job_description.strip():
        report = compare_cv(cv_text, job_description)
    else:
        chunks = cv_chunks(cv_text)
        report = MatchReport(profile=understand_cv(cv_text, chunks), review=build_review(cv_text, [], chunks, 'cv_only'),
            analysis=JobAnalysis(title=None, requirements=[], warnings=[]), matches=[], score=None, rules_score=None,
            semantic_score=None, mode='no_requirements', model=None, requested_settings=MatchSettings(), effective_settings=MatchSettings(),
            counts={'matched': 0, 'related': 0, 'not_found': 0}, warnings=[], explanation='CV-only evidence review. Select a job to compare its requirements.')
    if provider != 'gemini':
        return report
    result = gemini_review.review(cv_text, job_description)
    for skill in result.skills:
        if UNPROVEN.search(skill.evidence):
            continue
        # Branded tools may not be invented from generic project descriptions.
        canonical = next((name for name in SKILLS if name.casefold() == skill.name.casefold()), skill.name)
        if canonical in SKILLS and canonical not in ACTIVITIES and canonical not in {name for name, _, _ in mentions(skill.evidence)}:
            continue
        if not any(existing.name.casefold() == canonical.casefold() for existing in report.profile.skills):
            report.profile.skills.append(SkillEvidence(name=canonical, evidence=skill.evidence, line=line_number(cv_text, skill.evidence), status=skill.status, explanation=skill.reason))
    for proposed in result.edits:
        replacement = None
        if proposed.action == 'replace' and proposed.replacement and gemini_review.grounded_rewrite(proposed.excerpt, proposed.replacement):
            replacement = proposed.replacement
        elif proposed.action == 'delete':
            # Model deletion advice is limited to obvious repetition or non-evidential filler.
            if proposed.excerpt.casefold().startswith('references available') or any(item.action == 'delete' and item.excerpt == proposed.excerpt for item in report.review.changes):
                replacement = ''
        if any(item.excerpt == proposed.excerpt and item.replacement == replacement for item in report.review.changes):
            continue
        item = anchor(ReviewItem(category='detail', title='Delete this duplicate or filler line' if replacement == '' else 'Replace this line' if replacement else 'Clarify this line for the role',
            section=section_at(cv_text, cv_text.find(proposed.excerpt)), explanation=proposed.reason,
            steps=[proposed.question or 'Review the proposed wording against what you actually did.'], replacement=replacement,
            question=proposed.question, action='delete' if replacement == '' else 'replace' if replacement else 'clarify', job_requirement=proposed.job_source), cv_text, proposed.excerpt)
        item.line_number = line_number(cv_text, proposed.excerpt)
        report.review.changes.append(item)
    # Grounded semantic requirement assessment, while retaining hard checks for tools/credentials.
    if job_description:
        chunks = cv_chunks(cv_text)
        report.matches = []
        for index, item in enumerate(result.requirements, 1):
            import re
            skills = list(dict.fromkeys(name for name, _, _ in mentions(item.label)))
            kind = 'experience' if YEAR_PATTERN.search(item.label) else 'qualification' if re.search(r'degree|certif|licen[cs]|bachelor|master', item.label, re.I) else 'skill' if skills else 'responsibility'
            requirement = Requirement(id=f'gemini-req-{index}', label=item.label, source=item.source, kind=kind, priority=item.priority, skills=skills)
            existing = next((match for match in report.analysis.requirements if match.source == item.source and match.kind in {'experience', 'education', 'qualification'}), None)
            if existing:
                requirement = existing
            elif kind in {'experience', 'qualification'}:
                try:
                    requirement = next((candidate for candidate in analyse_job('Role\nRequired:\n' + item.source).requirements if candidate.kind in {'experience', 'education', 'qualification'}), requirement)
                except ValueError:
                    pass
            requirement = requirement.model_copy(update={'id': f'gemini-req-{index}', 'priority': item.priority})
            kind = requirement.kind
            explicit, reason = explicit_match(requirement, chunks)
            established = explicit is not None
            status = 'matched' if established else 'related' if item.evidence else 'not_found'
            # A general capability can be demonstrated through a paraphrased action.
            if kind == 'responsibility' and item.status == 'demonstrated' and item.evidence:
                status = 'matched'
            evidence = explicit or item.evidence
            evidence_status = 'demonstrated' if status == 'matched' else 'related' if evidence else 'not_found'
            if established and kind == 'skill':
                supports = [skill_evidence(skill, chunks) for skill in requirement.skills]
                supports.sort(key=lambda found: {'demonstrated': 3, 'inferred': 2, 'mentioned': 1, 'not_found': 0}[found[1]], reverse=True)
                if supports and supports[0][0]:
                    evidence_status = supports[0][1]
            report.matches.append(RequirementMatch(requirement=requirement, status=status, evidence=evidence,
                reason=reason if established or kind in {'experience', 'education', 'qualification'} else item.reason,
                similarity=None, rule_credit=1 if established else 0, semantic_credit=None, priority_weight=2 if item.priority == 'required' else 1,
                suggestion=item.reason, evidence_status=evidence_status, evidence_line=line_number(cv_text, evidence) if evidence else None))
        if not report.matches:
            # No valid source-anchored requirements: retain the independently computed local report.
            report.matches = compare_cv(cv_text, job_description).matches
        report.analysis.requirements = [item.requirement for item in report.matches]
        report.counts = {status: sum(item.status == status for item in report.matches) for status in ('matched', 'related', 'not_found')}
    for index, item in enumerate(report.review.changes + report.review.gaps, 1):
        item.id = f'review-{index}'
    report.review.notices.append('Gemini assisted this review. Check every quoted passage and suggested edit; no hiring probability is calculated.')
    report.review_provider = 'gemini'
    report.model = gemini_review.MODEL
    report.score = None
    report.explanation = 'Source-anchored Gemini assistance with independent checks for tools, durations and credentials. No hiring probability is calculated.'
    return report
