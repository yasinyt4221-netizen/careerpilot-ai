"""Evidence-led shortlist from a declared set of public job boards."""
import asyncio
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

from pydantic import BaseModel, Field, field_validator
from typing import Literal

from job_sources import Listing, load_public_jobs
from matching import positive_skills
from skills_catalog import mentions
from job_analyser import analyse_job
from sponsors import company_key, get_sponsor_register, sponsorship_advert


class JobSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=100)
    country: str = Field(default='United Kingdom', min_length=2, max_length=80)
    cv_text: str = Field(default='', max_length=50_000, repr=False)
    visa_category: str = Field(default='', max_length=100, repr=False)
    sponsorship_need: Literal['now', 'later', 'not_needed', 'unknown'] = 'unknown'
    hide_no_sponsorship: bool = False
    limit: int = Field(default=20, ge=1, le=30)

    @field_validator('query', 'country')
    @classmethod
    def nonempty_search(cls, value):
        if len(value.strip()) < 2:
            raise ValueError('Enter a role and country with at least two characters.')
        return value.strip()


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


def rank_jobs(jobs: list[Listing], request: JobSearchRequest, register: dict) -> list[dict]:
    tokens = re.findall(r'[\w+#.]+', request.query.casefold())
    cv_skills = positive_skills(request.cv_text)
    results = []
    for job in jobs:
        if not country_matches(job, request.country):
            continue
        title = job.title.casefold()
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
        job_skills = set()
        if cv_skills:
            try:
                job_skills = {skill for requirement in analyse_job(job.description[:20_000]).requirements if requirement.kind == 'skill' for skill in requirement.skills}
            except ValueError:
                pass  # Unparseable adverts do not receive a fabricated skills score.
        matched = sorted(job_skills & cv_skills)
        missing = sorted(job_skills - cv_skills)
        skill_score = round(100 * len(matched) / len(job_skills)) if cv_skills and job_skills else None
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
        priority = (visa_tier if request.sponsorship_need in {'now', 'later'} else 2, title_relevance, skill_score or 0)
        why = [f'{len(matched)} advertised skills also appear in your CV'] if matched else ['Matches your role search; review the full requirements']
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
    results = rank_jobs(jobs, request, register)
    links = [
        {'name': 'LinkedIn', 'url': 'https://www.linkedin.com/jobs/search/?' + urlencode({'keywords': request.query, 'location': request.country}), 'included_in_results': False},
        {'name': 'Indeed', 'url': 'https://www.indeed.com/jobs?' + urlencode({'q': request.query, 'l': request.country}), 'included_in_results': False},
    ]
    return {
        'jobs': results[:request.limit], 'total_matches': len(results), 'listings_checked': len(jobs),
        'sources': sources, 'searched_at': datetime.now(timezone.utc).isoformat(), 'more_platforms': links,
        'coverage': 'Searches configured company boards on Greenhouse, Lever and Ashby, the current public Arbeitnow UK/Europe pages, and Remotive. It does not cover every company or platform. Remotive listings are at least 24 hours delayed and link back to Remotive. LinkedIn and Indeed links open separate searches.',
        'visa_note': 'A sponsor licence or advert statement does not confirm your eligibility or an offer of sponsorship. Verify the role, salary, permission conditions and current official rules.',
        'visa_guidance_url': 'https://www.gov.uk/skilled-worker-visa' if request.country.casefold() in {'united kingdom', 'uk', 'gb'} else None,
        'register_available': register.get('available', False), 'sponsor_source_date': register.get('source_date'),
    }
