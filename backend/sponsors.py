"""UK sponsor-register evidence; never a determination of personal eligibility."""
import csv
import html
import io
import json
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx

from job_sources import CATALOG_PATH, SourceUnavailable, read_limited

REGISTER_PAGE = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers'
_cache: tuple[float, dict] | None = None


def company_key(value: str) -> str:
    value = re.sub(r'\b(limited|ltd|plc)\b', '', value.casefold())
    return re.sub(r'[^a-z0-9]', '', value)


def register_link(page: str) -> str:
    for candidate in re.findall(r'href=[\"\']([^\"\']+\.csv(?:\?[^\"\']*)?)[\"\']', page, re.I):
        candidate = html.unescape(candidate)
        parsed = urlsplit(candidate)
        if parsed.scheme == 'https' and parsed.hostname == 'assets.publishing.service.gov.uk' and 'Worker' in parsed.path:
            return candidate
    raise SourceUnavailable('No current sponsor register CSV link found')


async def get_sponsor_register(client: httpx.AsyncClient | None = None) -> dict:
    global _cache
    if _cache and time.monotonic() - _cache[0] < 3600:
        return _cache[1]
    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=25, follow_redirects=False)
    try:
        page = (await read_limited(client, REGISTER_PAGE, 4 * 1024 * 1024)).decode('utf-8')
        csv_url = register_link(page)
        date_match = re.search(r'(20\d{2}-\d{2}-\d{2})', csv_url)
        source_date = date_match.group(1) if date_match else None
        if not source_date or not 0 <= (datetime.now(timezone.utc).date() - datetime.fromisoformat(source_date).date()).days <= 7:
            raise SourceUnavailable('Sponsor register date could not be verified as current')
        content = await read_limited(client, csv_url, 20 * 1024 * 1024)
        targets = {company_key(name) for source in json.loads(CATALOG_PATH.read_text(encoding='utf-8')) for name in source.get('legal_names', [])}
        matches: dict[str, dict] = {}
        for row in csv.DictReader(io.StringIO(content.decode('utf-8-sig'))):
            name = row.get('Organisation Name', '')
            key = company_key(name)
            if key in targets and row.get('Route', '').strip() == 'Skilled Worker':
                matches[key] = {'legal_name': name, 'route': 'Skilled Worker', 'rating': row.get('Type & Rating', '')}
        result = {'available': True, 'source_url': REGISTER_PAGE, 'csv_url': csv_url, 'source_date': source_date, 'matches': matches}
        _cache = (time.monotonic(), result)
        return result
    except (httpx.HTTPError, ValueError, SourceUnavailable, UnicodeError):
        return {'available': False, 'source_url': REGISTER_PAGE, 'csv_url': None, 'source_date': None, 'matches': {}}
    finally:
        if owns_client:
            await client.aclose()


def sponsorship_advert(text: str) -> tuple[str, str | None]:
    sentences = re.split(r'(?<=[.!?])\s+|\n+', text)
    positive, negative = [], []
    for sentence in sentences:
        value = sentence.casefold()
        if 'sponsor' not in value:
            continue
        if re.search(r'\b(?:no|not|cannot|can\x27t|unable|do not|don\x27t|without)\b.{0,80}(?:visa |work )?sponsor|sponsor\w*.{0,50}\b(?:not available|not offered|unavailable)\b', value):
            negative.append(sentence.strip()[:350])
        elif re.search(r'\b(?:visa|immigration|work permit|work authori[sz]ation)\b', value) and re.search(r'\b(?:offer|provide|support|available|can|will)\b.{0,65}(?:visa |work )?sponsor|(?:visa |work )sponsorship.{0,45}\b(?:available|provided|offered|supported)\b', value):
            positive.append(sentence.strip()[:350])
    if positive and negative:
        return 'unclear', 'The advert contains mixed sponsorship wording; ask the employer.'
    if negative:
        return 'not_offered', negative[0]
    if positive:
        return 'offered', positive[0]
    return 'unknown', None
