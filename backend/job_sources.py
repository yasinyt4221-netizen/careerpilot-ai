"""Documented public ATS feeds. Only role queries, never CVs, leave the service."""
import asyncio
import html
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

import httpx

CATALOG_PATH = Path(__file__).with_name('jobs_catalog.json')
MAX_RESPONSE_BYTES = 12 * 1024 * 1024
CACHE_SECONDS = 600


class SourceUnavailable(Exception):
    pass


class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style'}:
            self.skip += 1
        if tag in {'p', 'li', 'br', 'h1', 'h2', 'h3', 'div'}:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in {'script', 'style'}:
            self.skip = max(0, self.skip - 1)
        if tag in {'p', 'li', 'div'}:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def plain_text(value: str) -> str:
    parser = PlainHTML()
    parser.feed(html.unescape(value))
    return re.sub(r'\n[ \t]*\n+', '\n', ''.join(parser.parts)).strip()


def safe_link(value: str) -> str | None:
    try:
        parsed = urlsplit(value)
        return value if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password else None
    except ValueError:
        return None


def feed_url(provider: str, board: str) -> str:
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', board):
        raise ValueError('Invalid board identifier')
    if provider == 'greenhouse':
        return f'https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true'
    if provider == 'lever':
        return f'https://api.lever.co/v0/postings/{board}?mode=json'
    if provider == 'ashby':
        return f'https://api.ashbyhq.com/posting-api/job-board/{board}'
    if provider == 'arbeitnow' and board in {'uk', 'europe'}:
        return 'https://www.arbeitnow.co.uk/api/job-board-api' if board == 'uk' else 'https://www.arbeitnow.com/api/job-board-api'
    if provider == 'remotive' and board == 'remote':
        return 'https://remotive.com/api/remote-jobs'
    raise ValueError('Unsupported job source')


@dataclass
class Listing:
    id: str
    company: str
    title: str
    location: str
    description: str
    url: str
    provider: str
    board: str
    legal_names: list[str]
    published_at: str | None = None
    remote: bool = False
    country_hint: str | None = None


def normalise_feed(source: dict, data) -> list[Listing]:
    provider, board = source['provider'], source['board']
    items = data if provider == 'lever' else data.get('data' if provider == 'arbeitnow' else 'jobs', [])
    if not isinstance(items, list):
        raise SourceUnavailable('Unexpected feed structure')
    listings = []
    for item in items[:2000]:
        if not isinstance(item, dict) or (provider == 'ashby' and item.get('isListed') is False):
            continue
        if provider == 'greenhouse':
            title, url = item.get('title', ''), item.get('absolute_url', '')
            location = item.get('location', {}).get('name', '')
            description = plain_text(item.get('content', ''))
            published = item.get('first_published')  # updated_at is NOT a posting date.
            remote = 'remote' in location.lower()
        elif provider == 'lever':
            title, url = item.get('text', ''), item.get('hostedUrl', '')
            location = item.get('categories', {}).get('location', '')
            description = item.get('descriptionPlain') or plain_text(item.get('description', ''))
            for section in item.get('lists', []):
                description += '\n' + section.get('text', '') + '\n' + plain_text(section.get('content', ''))
            description += '\n' + (item.get('additionalPlain') or plain_text(item.get('additional', '')))
            created = item.get('createdAt')
            published = datetime.fromtimestamp(created / 1000, timezone.utc).isoformat() if isinstance(created, (int, float)) and 0 < created < 4e12 else None
            remote = item.get('workplaceType') == 'remote'
        elif provider == 'ashby':
            title, url = item.get('title', ''), item.get('jobUrl') or item.get('applyUrl', '')
            locations = [item.get('location', '')] + [loc.get('location', '') for loc in item.get('secondaryLocations', [])]
            location = ' / '.join(filter(None, locations))
            description = item.get('descriptionPlain') or plain_text(item.get('descriptionHtml', ''))
            published, remote = item.get('publishedAt'), item.get('isRemote', False)
        elif provider == 'arbeitnow':
            title, url, location = item.get('title', ''), item.get('url', ''), item.get('location', '')
            description = plain_text(item.get('description', ''))
            created = item.get('created_at')
            published = datetime.fromtimestamp(created, timezone.utc).isoformat() if isinstance(created, (int, float)) and 0 < created < 4e9 else None
            remote = item.get('remote', False)
        else:
            title, url = item.get('title', ''), item.get('url', '')
            location = item.get('candidate_required_location', '')
            description = plain_text(item.get('description', ''))
            published, remote = item.get('publication_date'), True
        valid_url = safe_link(url)
        if not title or not description.strip() or not valid_url:
            continue
        listings.append(Listing(
            id=f'{provider}:{board}:{item.get("id", valid_url.rsplit("/",1)[-1])}',
            company=item.get('company_name', source['company']) if provider in {'arbeitnow', 'remotive'} else source['company'], title=title, location=location,
            description=description.strip(), url=valid_url, provider=provider, board=board,
            legal_names=source.get('legal_names', []), published_at=published, remote=bool(remote),
            country_hint='United Kingdom' if provider == 'arbeitnow' and board == 'uk' else None,
        ))
    return listings


async def read_limited(client: httpx.AsyncClient, url: str, maximum=MAX_RESPONSE_BYTES) -> bytes:
    async with client.stream('GET', url) as response:
        response.raise_for_status()
        content = bytearray()
        async for chunk in response.aiter_bytes():
            content.extend(chunk)
            if len(content) > maximum:
                raise SourceUnavailable('Feed exceeds processing limit')
        return bytes(content)


_cache: dict[str, tuple[float, list[Listing], str]] = {}


async def load_public_jobs(client: httpx.AsyncClient | None = None) -> tuple[list[Listing], list[dict]]:
    sources = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))
    semaphore = asyncio.Semaphore(4)
    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=18, follow_redirects=False, headers={'User-Agent': 'CareerPilot/0.3 public-job-reader'})

    async def load(source):
        key = f'{source["provider"]}:{source["board"]}'
        cached = _cache.get(key)
        ttl = 6 * 3600 if source['provider'] == 'remotive' else CACHE_SECONDS
        if cached and time.monotonic() - cached[0] < ttl:
            return cached[1], {'company': source['company'], 'provider': source['provider'], 'status': 'checked', 'count': len(cached[1]), 'checked_at': cached[2]}
        try:
            disk_cache = Path(__file__).parent / '.cache' / 'remotive-feed.json'
            data = None
            if source['provider'] == 'remotive' and disk_cache.exists() and time.time() - disk_cache.stat().st_mtime < ttl:
                try:
                    data = json.loads(disk_cache.read_text(encoding='utf-8'))
                except (OSError, ValueError):
                    pass
            async with semaphore:
                if data is None:
                    data = json.loads(await read_limited(client, feed_url(source['provider'], source['board'])))
                    if source['provider'] == 'remotive':
                        try:
                            disk_cache.parent.mkdir(exist_ok=True)
                            disk_cache.write_text(json.dumps(data), encoding='utf-8')
                        except OSError:
                            pass
            jobs = normalise_feed(source, data)
            checked = datetime.now(timezone.utc).isoformat()
            _cache[key] = (time.monotonic(), jobs, checked)
            return jobs, {'company': source['company'], 'provider': source['provider'], 'status': 'checked', 'count': len(jobs), 'checked_at': checked}
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError, OverflowError, OSError, SourceUnavailable):
            return [], {'company': source['company'], 'provider': source['provider'], 'status': 'unavailable', 'count': 0, 'checked_at': None}

    try:
        results = await asyncio.gather(*(load(source) for source in sources))
        unique = {}
        for jobs, _ in results:
            for job in jobs:
                unique.setdefault(job.url.split('?')[0], job)
        return list(unique.values()), [status for _, status in results]
    finally:
        if owns_client:
            await client.aclose()
