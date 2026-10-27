import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

import gemini_review
from cv_evidence import understand_cv
from matching import compare_cv
from review_service import review_documents
from job_search import JobSearchRequest, rank_jobs
from main import app
from tests.test_job_search import listing, REGISTER
from tests.test_matching import MissingProvider, ConstantProvider


def test_understands_actions_without_inventing_branded_tools():
    cv = 'Projects\nCleaned sales records and compared monthly trends.\nCreated interactive dashboards for the reporting team.\nQueried PostgreSQL to combine customer records.\nPresented findings to the directors and sales team.'
    skills = {item.name: item for item in understand_cv(cv).skills}
    assert {'Data analysis', 'Data visualisation', 'SQL', 'Communication'} <= skills.keys()
    assert all(skills[name].status == 'inferred' for name in ('Data analysis', 'SQL', 'Communication'))
    assert 'Power BI' not in skills and 'Tableau' not in skills and 'Excel' not in skills
    assert skills['SQL'].evidence == 'Queried PostgreSQL to combine customer records.'


def test_capability_evidence_is_not_a_guessed_named_product():
    report = compare_cv('Created interactive dashboards for monthly reporting.', 'Data Analyst\nRequired:\nData visualisation and Tableau', provider=ConstantProvider())
    by_name = {item.requirement.label: item for item in report.matches}
    assert by_name['Data visualisation'].status == 'matched'
    assert by_name['Data visualisation'].evidence_status == 'inferred'
    assert by_name['Tableau'].status != 'matched'


def test_chooses_demonstrated_evidence_over_an_earlier_skill_list():
    cv = 'Skills\nPython\nProjects\nUsed Python to clean and compare sales records.'
    match = compare_cv(cv, 'Analyst\nRequired:\nPython programming experience', provider=MissingProvider()).matches[0]
    assert match.evidence == 'Used Python to clean and compare sales records.'
    assert match.evidence_line == 4 and match.evidence_status == 'demonstrated'
    assert understand_cv('Currently learning Python.\nUsed Python to create a reporting dashboard.').skills[0].name


def test_cv_only_review_has_evidence_and_no_arbitrary_score():
    result = review_documents('Student\nProjects\nCreated interactive dashboards for the monthly reporting team.')
    assert result.score is None and not result.matches
    assert any(item.name == 'Data visualisation' for item in result.profile.skills)
    assert not any('Paste its responsibilities' in note for note in result.review.notices)
    response = TestClient(app).post('/api/cvs/review', json={'cv_text': 'Used SQL to query sales data and compare trends.'})
    assert response.status_code == 200 and response.json()['profile']['skills']


def test_clear_delete_and_replacement_edits_have_exact_utf16_lines():
    cv = 'Profile 😀\nHardworking motivated individual seeking a challenging role.\nProjects\nResponsible for creating dashboards using Tableau.\nCreated a report for the sales team.\nCreated a report for the sales team.'
    result = review_documents(cv)
    deletes = [item for item in result.review.changes if item.action == 'delete']
    assert len(deletes) == 2
    assert {item.line_number for item in deletes} == {2, 6}
    rewrite = next(item for item in result.review.changes if item.title == 'Replace this duty statement with the action')
    assert rewrite.replacement == 'Created dashboards using Tableau.' and rewrite.line_number == 4
    for item in result.review.changes:
        assert cv.encode('utf-16-le')[item.start * 2:item.end * 2].decode('utf-16-le') == item.excerpt


def test_cv_based_ranking_uses_requirements_and_excludes_irrelevant_or_senior_roles():
    jobs = [listing(id='good', title='Graduate Data Analyst', description='Required:\nSQL and Data analysis\nResponsibilities:\nBuild reporting dashboards.'),
            listing(id='wrong', title='Java Developer', description='Required:\nJava and React'),
            listing(id='senior', title='Senior Data Analyst', description='Required:\nSQL and Data analysis')]
    request = JobSearchRequest(cv_text='Queried PostgreSQL to combine customer records. Analysed sales data to identify trends.', career_level='student')
    result = rank_jobs(jobs, request, REGISTER)
    assert [job['id'] for job in result] == ['good']
    assert result[0]['core_found'] == 2 and result[0]['core_total'] == 2
    assert all(item['cv_excerpt'] in request.cv_text for item in result[0]['skill_evidence'] if item['cv_excerpt'])


def test_no_matching_cv_evidence_produces_no_fake_shortlist():
    assert rank_jobs([listing(description='Required:\nJava and React')], JobSearchRequest(cv_text='Handled customer requests at a retail shop.'), REGISTER) == []
    senior = listing(title='Data Analyst', description='Required:\nPython and SQL\n5 years of Python experience')
    assert rank_jobs([senior], JobSearchRequest(cv_text='Used Python and SQL to build a dashboard.', career_level='student'), REGISTER) == []


def test_sales_data_does_not_turn_a_data_cv_into_a_sales_candidate():
    cv = 'Skills\nPython SQL Excel\nAnalysed sales records and compared monthly trends.\nPresented findings to the sales team.'
    assert 'Sales' not in {skill.name for skill in understand_cv(cv).skills}
    jobs = [listing(title='Field Sales Executive', description='Required:\nCommunication and Excel'), listing(id='data', title='Junior Data Analyst', description='Required:\nSQL and Excel programming experience')]
    assert [job['id'] for job in rank_jobs(jobs, JobSearchRequest(cv_text=cv, career_level='student'), REGISTER)] == ['data']


def test_written_years_and_degree_duration_do_not_bypass_experience_checks():
    from job_analyser import analyse_job
    advert = 'Business Systems Analyst\nRequired:\nThree or more years of Workday configuration experience.'
    years = next(item for item in analyse_job(advert).requirements if item.kind == 'experience')
    assert years.minimum_years == 3
    result = compare_cv('Education\nThree years studying computer science at a university.', 'Developer\nRequired:\nThree years of experience', provider=MissingProvider())
    assert next(item for item in result.matches if item.requirement.kind == 'experience').status != 'matched'


def test_alternative_skills_count_as_one_requirement():
    result = rank_jobs([listing(description='Required:\nPython or Java programming experience')], JobSearchRequest(cv_text='Used Java to develop an inventory service.'), REGISTER)
    assert result[0]['core_total'] == 1 and result[0]['core_found'] == 1


@pytest.fixture
def clean_connection(monkeypatch):
    monkeypatch.setattr(gemini_review, '_key', None)
    monkeypatch.setattr(gemini_review, '_verified', False)
    monkeypatch.setattr(gemini_review, '_ignore_environment', False)
    monkeypatch.setattr(gemini_review, '_last_connection_error', None)
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)


def test_connection_check_is_stateless_and_never_returns_the_key(monkeypatch, clean_connection):
    original_client = httpx.Client
    sent = []
    secret = 'synthetic-test-key-not-a-real-secret'
    def handler(request):
        sent.append(json.loads(request.content))
        assert request.headers['x-goog-api-key'] == secret
        return httpx.Response(200, json={'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"edits":[],"requirements":[],"skills":[]}' }]}}]})
    monkeypatch.setattr(gemini_review.httpx, 'Client', lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs))
    status = gemini_review.connect(SecretStr(secret))
    assert status['configured'] and status['verified']
    assert secret not in json.dumps(status)
    assert sent[0]['store'] is False and 'CV' not in sent[0]['contents'][0]['parts'][0]['text']
    gemini_review.disconnect()
    assert not gemini_review.status()['configured']


def test_gemini_requires_document_consent_before_a_call(monkeypatch, clean_connection):
    monkeypatch.setattr(gemini_review, 'review', lambda *_: pytest.fail('CV must not be sent without consent'))
    response = TestClient(app).post('/api/cvs/review', json={'cv_text': 'Synthetic CV text', 'provider': 'gemini'})
    assert response.status_code == 422


def test_connection_is_not_exposed_to_other_origins_or_public_demo(monkeypatch, clean_connection):
    client = TestClient(app)
    assert client.post('/api/ai/connect', headers={'Origin': 'https://other.example'}, json={'api_key': 'synthetic-test-key'}).status_code == 403
    monkeypatch.setenv('PUBLIC_DEMO_ONLY', 'true')
    assert client.post('/api/ai/connect', json={'api_key': 'synthetic-test-key'}).status_code == 403
    assert client.post('/api/cvs/review', json={'cv_text': 'Synthetic CV text'}).status_code == 403


def test_rewrites_cannot_add_metrics_or_attach_a_tool_to_an_unproven_project():
    assert gemini_review.grounded_rewrite('Responsible for creating dashboards using Tableau.', 'Created dashboards using Tableau.')
    assert not gemini_review.grounded_rewrite('Created a dashboard.', 'Created a Python dashboard.')
    assert not gemini_review.grounded_rewrite('Created a dashboard.', 'Created a dashboard improving performance by 40%.')


def test_unanchored_gemini_quotes_are_rejected(monkeypatch, clean_connection):
    monkeypatch.setattr(gemini_review, '_key', SecretStr('synthetic-test-key'))
    monkeypatch.setattr(gemini_review, '_request', lambda *_: json.dumps({'edits': [{'excerpt': 'I invented an employer.', 'action': 'replace', 'replacement': 'Expert developer.', 'reason': 'Fake', 'question': None, 'job_source': None}], 'requirements': []}))
    assert gemini_review.review('Built a reporting dashboard.', '').edits == []


def test_quota_and_bad_responses_are_useful_and_do_not_echo_keys(monkeypatch, clean_connection):
    original_client = httpx.Client
    monkeypatch.setattr(gemini_review.httpx, 'Client', lambda **kwargs: original_client(transport=httpx.MockTransport(lambda _: httpx.Response(429, json={'error': 'synthetic-test-key'})), **kwargs))
    with pytest.raises(gemini_review.GeminiUnavailable, match='quota') as caught:
        gemini_review.connect(SecretStr('synthetic-test-key'))
    assert 'synthetic-test-key' not in str(caught.value)
    monkeypatch.setattr(gemini_review.httpx, 'Client', lambda **kwargs: original_client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=[])), **kwargs))
    with pytest.raises(gemini_review.GeminiUnavailable, match='unexpected response'):
        gemini_review.connect(SecretStr('synthetic-test-key'))


def test_gemini_cannot_turn_a_listed_skill_into_demonstrated_work(monkeypatch):
    result = gemini_review.AIReview(edits=[], skills=[], requirements=[gemini_review.AIRequirement(label='Python', source='Python programming experience', priority='required', status='demonstrated', evidence='Python', reason='Synthetic model overclaim')])
    monkeypatch.setattr(gemini_review, 'review', lambda *_: result)
    report = review_documents('Skills\nPython', 'Developer\nRequired:\nPython programming experience', 'gemini')
    assert report.matches[0].evidence_status == 'mentioned'
