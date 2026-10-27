"""Build public sample-only analysis and a dated public-job snapshot. No CV input."""
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from job_search import JobSearchRequest, rank_jobs
from job_sources import load_public_jobs
from matching import compare_cv
from sponsors import get_sponsor_register

SAMPLE_CV = 'Sample Applicant\nProfile\nExperiance in reporting and data analysis.\nSkills\nPython, SQL\nWork experience\nBuilt a reporting dashboard.\nManaged the the monthly reporting pack.'
SAMPLE_JOB = 'Data Analyst\nRequired:\nPython and SQL\nResponsibilities:\nBuild reporting dashboards for business stakeholders.\nPreferred:\nKubernetes'


async def main():
    directory = Path(__file__).resolve().parents[1] / 'frontend' / 'public'
    directory.mkdir(exist_ok=True)
    report = compare_cv(SAMPLE_CV, SAMPLE_JOB)
    (directory / 'sample-review.json').write_text(json.dumps({'cv_text': SAMPLE_CV, 'job_description': SAMPLE_JOB, 'report': report.model_dump()}, ensure_ascii=False), encoding='utf-8')
    (jobs, sources), register = await asyncio.gather(load_public_jobs(), get_sponsor_register())
    if not jobs:
        raise RuntimeError('No public listings could be fetched; keep the previous published snapshot.')
    results = {}
    for country in ('Any', 'United Kingdom'):
        request = JobSearchRequest(query='all', country=country).model_copy(update={'query': ''})
        listings = rank_jobs(jobs, request, register)
        for job in listings:
            # Publish a short excerpt and source link, not complete copied adverts.
            job['description'] = job['description'][:1000]
            job['description_truncated'] = True
        results[country] = {
            'jobs': listings, 'total_matches': len(listings), 'listings_checked': len(jobs),
            'sources': sources, 'searched_at': datetime.now(timezone.utc).isoformat(),
            'coverage': 'Dated snapshot of configured Greenhouse, Lever and Ashby boards, public Arbeitnow UK/Europe API pages and Remotive. Not every company or platform is included. Remotive jobs are delayed by at least 24 hours and link to Remotive. LinkedIn and Indeed open separate searches.',
            'visa_note': 'A sponsor licence is not an offer of sponsorship or a determination of your eligibility. Check the original advert and current official rules.',
            'more_platforms': [], 'visa_guidance_url': 'https://www.gov.uk/skilled-worker-visa',
            'register_available': register['available'], 'sponsor_source_date': register['source_date'],
        }
    (directory / 'jobs-feed.json').write_text(json.dumps({'results': results}, ensure_ascii=False), encoding='utf-8')
    print(f'Prepared synthetic review and {len(jobs)} public listings from {len(sources)} configured boards. Register verified: {register["available"]}.')


if __name__ == '__main__':
    asyncio.run(main())
