import asyncio
import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

import job_search
import job_sources
from job_search import JobSearchRequest, country_matches, rank_jobs
from job_sources import Listing, feed_url, load_public_jobs, normalise_feed, plain_text, safe_link
from main import app
from sponsors import REGISTER_PAGE, company_key, register_link, sponsorship_advert


def listing(**overrides):
    values = dict(id='gh:example:1', company='Example Company', title='Data Analyst', location='London, UK',
                  description='Required:\nPython and SQL\nWe can offer visa sponsorship for this role.',
                  url='https://example.com/jobs/1', provider='greenhouse', board='example', legal_names=['Example Company Limited'])
    return Listing(**(values | overrides))


REGISTER = {'available': True, 'source_url': REGISTER_PAGE, 'source_date': '2026-10-26',
            'matches': {company_key('Example Company Limited'): {'legal_name': 'Example Company Ltd', 'route': 'Skilled Worker', 'rating': 'Worker (A rating)'}}}


def test_public_feed_normalisers_and_safe_html():
    source = {'provider': 'greenhouse', 'board': 'example', 'company': 'Example Company', 'legal_names': []}
    data = {'jobs': [{'id': 1, 'title': 'Engineer', 'absolute_url': 'https://example.com/job', 'content': '&lt;p&gt;Python&lt;/p&gt;<script>doNotRun()</script>', 'location': {'name': 'London'}, 'updated_at': '2026-10-27'}]}
    result = normalise_feed(source, data)
    assert result[0].description == 'Python'
    assert result[0].published_at is None
    lever = normalise_feed(source | {'provider': 'lever'}, [{'id': 'x', 'text': 'Engineer', 'hostedUrl': 'https://jobs.lever.co/example/x', 'descriptionPlain': 'Python', 'lists': [{'text': 'Skills', 'content': '<li>SQL</li>'}], 'categories': {'location': 'London'}}])
    assert 'SQL' in lever[0].description
    ashby = normalise_feed(source | {'provider': 'ashby'}, {'jobs': [{'id': 'x', 'title': 'Engineer', 'jobUrl': 'https://jobs.ashbyhq.com/example/x', 'descriptionPlain': 'Python', 'location': 'London'}, {'title': 'Internal', 'isListed': False}]})
    assert len(ashby) == 1


def test_no_arbitrary_hosts_or_unsafe_links():
    with pytest.raises(ValueError): feed_url('greenhouse', '../private')
    with pytest.raises(ValueError): feed_url('other', 'example')
    assert safe_link('javascript:alert(1)') is None
    assert safe_link('https://user:password@example.com/') is None
    assert register_link('<a href="https://evil.example/Worker.csv">CSV</a><a href="https://assets.publishing.service.gov.uk/media/id/Worker_2026-10-26.csv">CSV</a>').startswith('https://assets.')


def test_aggregator_feeds_preserve_hiring_company_location_and_source():
    source = {'provider': 'arbeitnow', 'board': 'uk', 'company': 'Arbeitnow UK'}
    jobs = normalise_feed(source, {'data': [{'slug': 'analyst', 'title': 'Analyst', 'company_name': 'Hiring Employer', 'description': '<p>Python</p>', 'url': 'https://www.arbeitnow.co.uk/view/analyst', 'location': 'Cardiff', 'created_at': 1793000000}]})
    assert jobs[0].company == 'Hiring Employer'
    assert jobs[0].country_hint == 'United Kingdom'
    assert jobs[0].published_at is not None
    remote = normalise_feed({'provider': 'remotive', 'board': 'remote', 'company': 'Remotive'}, {'jobs': [{'id': 2, 'title': 'Analyst', 'company_name': 'Remote Employer', 'description': '<p>SQL</p>', 'url': 'https://remotive.com/remote-jobs/data/analyst-2', 'candidate_required_location': 'Worldwide', 'publication_date': '2026-10-26'}]})
    assert remote[0].provider == 'remotive' and remote[0].company == 'Remote Employer'
    assert remote[0].location == 'Worldwide' and remote[0].remote
    assert not country_matches(remote[0], 'United Kingdom')


@pytest.mark.parametrize('text,expected', [
    ('We can offer visa sponsorship for this role.', 'offered'),
    ('Visa sponsorship is available for eligible applicants.', 'offered'),
    ('We cannot provide visa sponsorship now or in the future.', 'not_offered'),
    ('Sponsorship is not available for this role.', 'not_offered'),
    ('Do you require sponsorship?', 'unknown'),
    ('We support sponsorship of local charity events.', 'unknown'),
    ('We can offer visa sponsorship. We cannot offer visa sponsorship.', 'unclear'),
])
def test_sponsorship_language_is_evidence_not_assumption(text, expected):
    assert sponsorship_advert(text)[0] == expected


def test_sponsor_licence_does_not_override_no_sponsorship_advert():
    request = JobSearchRequest(query='data analyst', cv_text='Python SQL', sponsorship_need='now')
    results = rank_jobs([listing(description='Required:\nPython SQL\nWe cannot provide visa sponsorship.')], request, REGISTER)
    assert results[0]['sponsorship_status'] == 'not_offered'
    assert results[0]['sponsor_entities']
    assert 'no sponsorship' in results[0]['sponsorship_label']
    assert rank_jobs([listing(description='Python. No visa sponsorship.')], request.model_copy(update={'hide_no_sponsorship': True}), REGISTER) == []


def test_wrong_role_is_not_ranked_above_requested_role():
    wrong = listing(title='Product Manager', description='Work with our data analyst team. We can offer visa sponsorship.')
    right = listing(id='2', description='Required:\nPython SQL')
    results = rank_jobs([wrong, right], JobSearchRequest(query='data analyst', cv_text='Python SQL'), REGISTER)
    assert [job['id'] for job in results] == ['2']


def test_ranking_and_cv_match_reasons():
    offered = listing(id='offered')
    denied = listing(id='denied', description='Data analyst role. Python SQL. No visa sponsorship.')
    request = JobSearchRequest(query='data analyst', cv_text='Used Python to build dashboards', sponsorship_need='now')
    result = rank_jobs([denied, offered], request, REGISTER)
    assert result[0]['id'] == 'offered'
    assert result[0]['matched_skills'] == ['Python']
    assert 'SQL' in result[0]['missing_skills']
    assert result[0]['skill_score'] == 50


def test_missing_register_is_not_a_negative_legal_determination():
    result = rank_jobs([listing(description='Required:\nPython SQL')], JobSearchRequest(query='analyst'), {'available': False, 'matches': {}})[0]
    assert result['sponsor_entities'] == []
    assert result['sponsorship_status'] == 'unknown'
    assert result['skill_score'] is None


def test_uk_location_does_not_match_canadian_london_or_remote_us():
    assert country_matches(listing(location='London, UK'), 'United Kingdom')
    assert not country_matches(listing(location='London, Ontario, Canada'), 'United Kingdom')
    assert not country_matches(listing(location='Remote - United States'), 'United Kingdom')


def test_sources_partial_failure_and_cache(monkeypatch, tmp_path):
    catalog = tmp_path / 'boards.json'
    catalog.write_text(json.dumps([{'provider': 'greenhouse', 'board': name, 'company': name} for name in ('good', 'bad')]))
    monkeypatch.setattr(job_sources, 'CATALOG_PATH', catalog)
    job_sources._cache.clear()
    requests = []
    def handler(request):
        requests.append(str(request.url))
        if '/bad/' in str(request.url): return httpx.Response(503)
        return httpx.Response(200, json={'jobs': [{'id': 1, 'title': 'Engineer', 'absolute_url': 'https://example.com/job', 'content': '<p>Python</p>', 'location': {'name': 'London'}}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            jobs, statuses = await load_public_jobs(client)
            assert len(jobs) == 1
            assert {status['status'] for status in statuses} == {'checked', 'unavailable'}
            await load_public_jobs(client)
    asyncio.run(run())
    assert sum('/good/' in url for url in requests) == 1
    job_sources._cache.clear()


def test_search_endpoint_does_not_send_cv_to_sources(monkeypatch):
    async def jobs(): return [listing()], [{'company': 'Example', 'provider': 'greenhouse', 'status': 'checked', 'count': 1}]
    async def register(): return REGISTER
    monkeypatch.setattr(job_search, 'load_public_jobs', jobs)
    monkeypatch.setattr(job_search, 'get_sponsor_register', register)
    response = TestClient(app).post('/api/jobs/search', json={'query': 'data analyst', 'cv_text': 'Python SQL', 'sponsorship_need': 'later'})
    assert response.status_code == 200
    data = response.json()
    assert data['jobs'][0]['company'] == 'Example Company'
    assert all(not platform['included_in_results'] for platform in data['more_platforms'])
    assert 'not cover every company' in data['coverage']
    assert TestClient(app).post('/api/jobs/search', json={'query': '  '}).status_code == 422
