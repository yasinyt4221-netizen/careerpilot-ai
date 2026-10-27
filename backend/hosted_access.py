"""Password-protected friend showcase. No accounts, CV storage or key exposure."""
import base64
import hashlib
import hmac
import os
import secrets
import time
from collections import OrderedDict
from threading import Lock

from starlette.responses import JSONResponse

_buckets: OrderedDict[str, list[float]] = OrderedDict()
_lock = Lock()


def hosted() -> bool:
    return os.getenv('HOSTED_MODE', 'false').lower() == 'true'


def _secret() -> str:
    value = os.getenv('APP_ACCESS_CODE', '')
    return value if len(value) >= 16 else ''


def ready() -> bool:
    return bool(_secret() and os.getenv('GEMINI_API_KEY'))


def allowed(bucket: str, limit: int, seconds: int) -> bool:
    now = time.monotonic()
    with _lock:
        recent = [stamp for stamp in _buckets.pop(bucket, []) if stamp > now - seconds]
        permitted = len(recent) < limit
        if permitted:
            recent.append(now)
        _buckets[bucket] = recent
        while len(_buckets) > 1024:
            oldest = next(key for key in _buckets if key != 'shared-reviews')
            del _buckets[oldest]
        return permitted


def login(code: str) -> str | None:
    secret = _secret()
    if not secret or not hmac.compare_digest(code.encode(), secret.encode()):
        return None
    payload = f'{int(time.time()) + 3600}.{secrets.token_urlsafe(18)}'
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    return payload + '.' + base64.urlsafe_b64encode(signature).decode().rstrip('=')


def valid(token: str) -> bool:
    secret = _secret()
    if not secret or len(token) > 300:
        return False
    try:
        expiry, nonce, signature = token.split('.')
        now = int(time.time())
        if not nonce or not now < int(expiry) <= now + 3600:
            return False
        expected = base64.urlsafe_b64encode(hmac.new(secret.encode(), f'{expiry}.{nonce}'.encode(), hashlib.sha256).digest()).decode().rstrip('=')
        return hmac.compare_digest(signature, expected)
    except (ValueError, TypeError):
        return False


class HostedAccess:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get('path', '')
        if scope['type'] != 'http' or not hosted() or not path.startswith('/api/') or scope['method'] == 'OPTIONS':
            return await self.app(scope, receive, send)
        if path == '/api/health':
            return await self.app(scope, receive, send)
        if not ready():
            return await JSONResponse({'detail': 'The private backend needs its hosting secrets configured.'}, status_code=503)(scope, receive, send)
        headers = dict(scope['headers'])
        address = (scope.get('client') or ('unknown',))[0]
        if path == '/api/access/session':
            if allowed('login:' + address, 10, 600):
                return await self.app(scope, receive, send)
            return await JSONResponse({'detail': 'Too many access attempts. Try again in ten minutes.'}, status_code=429)(scope, receive, send)
        authorization = headers.get(b'authorization', b'').decode('latin-1')
        if not authorization.startswith('Bearer ') or not valid(authorization[7:]):
            return await JSONResponse({'detail': 'Enter the private workspace access code to continue.'}, status_code=401)(scope, receive, send)
        if path == '/api/cvs/review' and scope['method'] == 'POST' and not allowed('shared-reviews', 30, 3600):
            return await JSONResponse({'detail': 'The private demo has reached its shared review limit. Please try later.'}, status_code=429)(scope, receive, send)
        await self.app(scope, receive, send)
