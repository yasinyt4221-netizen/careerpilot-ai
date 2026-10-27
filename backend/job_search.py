"""Evidence-led shortlist from a declared set of public job boards."""
import asyncio
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal
from functools import lru_cache

from job_sources import Listing, load_public_jobs
from matching import positive_skills, explicit_match
from cv_evidence import understand_cv, skill_evidence
from skills_catalog import mentions
from job_analyser import analyse_job
from sponsors import company_key, get_sponsor_register, sponsorship_advert


class JobSearchRequest(BaseModel):
    query: str = Field(default='', max_length=100)
    country: str = Field(default='United Kingdom', min_length=2, max_length=80)
    cv_text: str = Field(default='', max_length=50_000, repr=False)
    visa_category: str = Field(default='', max_length=100, repr=False)
    sponsorship_need: Literal['now', 'later', 'not_needed', 'unknown'] = 'unknown'
    hide_no_sponsorship: bool = False
    limit: int = Field(default=20, ge=1, le=30)
    career_level: Literal['any', 'student'] = 'any'

    @field_validator('country')
    @classmethod
    def nonempty_search(cls, value):
        if len(value.strip()) < 2:
            raise ValueError('Enter a role and country with at least two characters.')
        return value.strip()

    @model_validator(mode='after')
    def usable_search(self):
        if not self.cv_text.strip() and len(self.query.strip()) < 2:
            raise ValueError('Add a CV to find matching roles, or enter at least two role-search characters.')
        return self


@lru_cache(maxsize=2200)
def public_requirements(description: str):
    try:
        return analyse_job(description[:20_000]).requirements
    except ValueError:
        return []


FAMILY_TITLES = {
    'Data analysis and reporting': r'analyst|analytics|data|reporting|business intelligence|scientist|\bbi\b',
    'Software development': r'developer|software|programmer|engineer|web|backend|frontend|full.stack|devops|\bqa\b',
    'Design and user research': r'design|\bux\b|\bui\b|user research',
    'Business and finance': r'analyst|business|finance|financial|account|project|operations|audit|risk',
    'Customer support and operations': r'customer|support|service|operations|sales|admin',
    'Marketing': r'marketing|social|content|brand|\bseo\b',
}


def country_matches(job: Listing, country: str) -> bool:
    location = job.location.casefold()
    country = country.casefold().strip()
    if country in {'any', 'all'}:
        return True
    if country in {'united kingdom', 'uk', 'gb'}:
        if re.search(r'\b(?:canada|ontario|united states|usa|germany)\b', location) and not re.search(r'\b(?:united kingdom|uk|england)\b', location):
            return False
        return job.country_hint == 'United Kingdom' or bool(re.search(r'\b(?:united kingdom|uk|england|scotland|wales|northern ireland|london|manchester|edinburgh|birmingham|bristol|cambridge|leeds)\b', location))
    return country in location


def rank_jobs(jobs: list[Listing], request: JobSearchRequest, register: dict, statistics: dict | None = None) -> list[dict]:
    tokens = re.findall(r'[\w+#.]+', request.query.casefold())
    profile = understand_cv(request.cv_text) if request.cv_text.strip() else None
    cv_skills = {item.name for item in profile.skills} if profile else set()
    cv_passages = [item for item in __import__('skills_catalog').text_units(request.cv_text)] if profile else []
    evidence_by_skill = {item.name: item for item in profile.skills} if profile else {}
    automatic = bool(profile and not request.query.strip())
    if statistics is not None:
        statistics.update(compared_count=0, senior_roles_excluded=0)
    results = []
    for job in jobs:
        if not country_matches(job, request.country):
            continue
        title = job.title.casefold()
        if automatic and profile.role_families and not any(re.search(FAMILY_TITLES.get(family, r'(?!)'), title) for family in profile.role_families):
            continue
        if request.career_level == 'student' and re.search(r'\b(?:senior|staff|principal|head|director|lead|manager|vp)\b', title):
            if statistics is not None: statistics['senior_roles_excluded'] += 1
            continue
        haystack = title + '\n' + job.description.casefold()
        if not all(re.search(r'(?<!\w)' + re.escape(token) + r'(?!\w)', haystack) for token in tokens):
            continue
        core_roles = [token for token in tokens if token in {'engineer', 'developer', 'analyst', 'scientist', 'designer', 'manager', 'nurse', 'teacher', 'accountant', 'recruiter'}]
        if core_roles and not all(re.search(r'(?<!\w)' + re.escape(role) + r'(?!\w)', title) for role in core_roles):
            continue
        advert_status, advert_quote = sponsorship_advert(job.description)
        if request.hide_no_sponsorship and advert_status == 'not_offered':
            continue
        licences = []
        if request.country.casefold() in {'united kingdom', 'uk', 'gb'} and register.get('available'):
            licences = [register['matches'][company_key(name)] for name in job.legal_names if company_key(name) in register.get('matches', {})]
        requirements = public_requirements(job.description) if profile else []
        skill_requirements = [item for item in requirements if item.kind == 'skill']
        if statistics is not None and profile and requirements: statistics['compared_count'] += 1
        assessment = []
        for requirement in skill_requirements:
            options = [evidence_by_skill[skill] for skill in requirement.skills if skill in evidence_by_skill]
            options.sort(key=lambda item: {'demonstrated': 3, 'inferred': 2, 'mentioned': 1}[item.status], reverse=True)
            evidence = options[0] if options else None
            assessment.append({'skill': requirement.label, 'priority': requirement.priority, 'status': evidence.status if evidence else 'not_found',
                               'cv_excerpt': evidence.evidence if evidence else None, 'line': evidence.line if evidence else None, 'job_excerpt': requirement.source})
        matched = [item['skill'] for item in assessment if item['status'] != 'not_found']
        missing = [item['skill'] for item in assessment if item['status'] == 'not_found']
        essential = [item for item in assessment if item['priority'] != 'preferred'] or assessment
        found = sum(item['status'] != 'not_found' for item in essential)
        demonstrated = sum(item['status'] in {'demonstrated', 'inferred'} for item in essential)
        coverage = found / len(essential) if essential else 0
        hard_checks = [item.label for item in requirements if item.kind in {'experience', 'education', 'qualification', 'other'} and item.priority != 'preferred' and explicit_match(item, cv_passages)[0] is None]
        if automatic and (not essential or found == 0 or coverage < .4 or (found < 2 and len(essential) > 2)):
            continue
        if automatic and request.career_level == 'student' and any(item.kind == 'experience' and (item.minimum_years or 0) >= 3 and explicit_match(item, cv_passages)[0] is None for item in requirements):
            continue
        if automatic and request.career_level == 'student' and any(item.priority == 'required' and re.search(r'\b(?:expert knowledge|expert.level|extensive experience|proven track record)\b', item.source, re.I) for item in requirements):
            continue
        skill_score = round(100 * len(matched) / len(assessment)) if profile and assessment else None  # Legacy API compatibility; not shown as a hiring score.
        fit_label = 'Good evidence' if coverage >= .75 and demonstrated and not hard_checks else 'Some evidence' if found else 'Needs review'
        visa_tier = 2
        visa_label = 'Confirm sponsorship with employer'
        if advert_status == 'offered':
            visa_tier, visa_label = 4, 'Advert mentions sponsorship'
        elif advert_status == 'not_offered':
            visa_tier, visa_label = 0, 'Advert says no sponsorship'
        elif licences:
            visa_tier, visa_label = 3, 'Licensed employer · confirm this role'
        if request.sponsorship_need == 'not_needed':
            visa_tier = 2
            visa_label = 'Check your work permission and job conditions'
        title_relevance = sum(token in title for token in tokens)
        priority = (0 if request.sponsorship_need in {'now', 'later'} and advert_status == 'not_offered' else 1, (coverage if profile else 0), demonstrated, -len(hard_checks), visa_tier if request.sponsorship_need in {'now', 'later'} else 2, title_relevance)
        why = [f'{found} of {len(essential)} requested core skills have CV evidence; {demonstrated} are demonstrated through work or projects.'] if assessment else ['Matches your role search; full requirements still need checking.']
        if licences:
            why.append('Named legal entity matched to the current UK Skilled Worker sponsor register')
        if advert_status == 'not_offered' and request.sponsorship_need in {'now', 'later'}:
            why.append('Sponsorship wording may conflict with your stated needs')
        next_action = ('Add a truthful work/project example for ' + ', '.join(missing[:2]) + ' if you have that experience.') if missing else 'Make your most relevant work example easy to find in your CV.'
        results.append({
            'id': job.id, 'company': job.company, 'title': job.title, 'location': job.location,
            'url': job.url, 'provider': job.provider, 'description': job.description[:20_000],
            'description_truncated': len(job.description) > 20_000, 'published_at': job.published_at,
            'country_hint': job.country_hint,
            'skill_score': skill_score, 'matched_skills': matched[:8], 'missing_skills': missing[:6],
            'fit_label': fit_label, 'core_found': found, 'core_total': len(essential), 'demonstrated_count': demonstrated,
            'skill_evidence': assessment[:30], 'hard_checks': hard_checks[:6],
            'sponsorship_status': advert_status, 'sponsorship_label': visa_label, 'sponsorship_quote': advert_quote,
            'sponsor_entities': licences, 'sponsor_source': register.get('source_url'), 'sponsor_source_date': register.get('source_date'),
            'why': why[:3], 'next_action': next_action, '_priority': priority,
        })
    results.sort(key=lambda item: item['_priority'], reverse=True)
    for result in results:
        result.pop('_priority')
    return results


async def search_jobs(request: JobSearchRequest) -> dict:
    jobs_result, register = await asyncio.gather(load_public_jobs(), get_sponsor_register())
    jobs, sources = jobs_result
    statistics = {}
    results = await asyncio.to_thread(rank_jobs, jobs, request, register, statistics)
    links = [
        {'name': 'LinkedIn', 'url': 'https://www.linkedin.com/jobs/search/?' + urlencode({'keywords': request.query, 'location': request.country}), 'included_in_results': False},
        {'name': 'Indeed', 'url': 'https://www.indeed.com/jobs?' + urlencode({'q': request.query, 'l': request.country}), 'included_in_results': False},
        {'name': 'Handshake · ARU', 'url': 'https://aru.joinhandshake.com/', 'included_in_results': False},
    ]
    return {
        'jobs': results[:request.limit], 'total_matches': len(results), 'listings_checked': len(jobs),
        **statistics,
        'sources': sources, 'searched_at': datetime.now(timezone.utc).isoformat(), 'more_platforms': links,
        'coverage': 'Searches configured company boards on Greenhouse, Lever and Ashby, the current public Arbeitnow UK/Europe pages, and Remotive. It does not cover every company or platform. Remotive listings are at least 24 hours delayed and link back to Remotive. LinkedIn and Indeed links open separate searches.',
        'visa_note': 'A sponsor licence or advert statement does not confirm your eligibility or an offer of sponsorship. Verify the role, salary, permission conditions and current official rules.',
        'visa_guidance_url': 'https://www.gov.uk/skilled-worker-visa' if request.country.casefold() in {'united kingdom', 'uk', 'gb'} else None,
        'register_available': register.get('available', False), 'sponsor_source_date': register.get('source_date'),
    }
