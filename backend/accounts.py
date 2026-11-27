"""Optional accounts: email/password sign-in and a private, server-stored application board.

SQLite (stdlib) keeps the backend dependency-free. CV text is never stored.
shortcut: one SQLite file per backend process; move to Postgres (database/schema.sql) for multi-instance hosting.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, SecretStr, StringConstraints, field_validator

import hosted_access

SESSION_SECONDS = 30 * 24 * 3600
MAX_JOBS = 100
router = APIRouter(prefix='/api/account')


def _db_path() -> Path:
    return Path(os.getenv('CAREERPILOT_DB', Path(__file__).parent / '.data' / 'careerpilot.db'))


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute('pragma foreign_keys = on')
    db.executescript('''
        create table if not exists users (id integer primary key, email text unique not null, password_hash text not null, created_at integer not null);
        create table if not exists sessions (token_hash text primary key, user_id integer not null references users(id) on delete cascade, expires_at integer not null);
        create table if not exists boards (user_id integer primary key references users(id) on delete cascade, jobs text not null, updated_at integer not null);
    ''')
    return db


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + '$' + digest.hex()


def _password_matches(password: str, stored: str) -> bool:
    salt, _ = stored.split('$')
    return hmac.compare_digest(_hash_password(password, bytes.fromhex(salt)), stored)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _enabled():
    if os.getenv('PUBLIC_DEMO_ONLY', 'false').lower() == 'true':
        raise HTTPException(403, 'Accounts are not available on the public demo.')


def _user(token: str | None) -> tuple[int, str]:
    _enabled()
    if not token or len(token) > 200:
        raise HTTPException(401, 'Sign in to continue.')
    with closing(_connect()) as db:
        row = db.execute('select users.id, users.email from sessions join users on users.id = sessions.user_id where token_hash = ? and expires_at > ?',
                         (_token_hash(token), int(time.time()))).fetchone()
    if not row:
        raise HTTPException(401, 'Your session has ended. Sign in again.')
    return row


Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')]


class Credentials(BaseModel):
    email: Email
    password: SecretStr = Field(min_length=10, max_length=200)


class SavedJob(BaseModel):
    # Mirrors the browser's SavedJob validation in frontend/app/application-store.ts.
    id: str = Field(min_length=1, max_length=999)
    company: str = Field(max_length=200)
    title: str = Field(max_length=300)
    location: str = Field(max_length=300)
    url: str = Field(max_length=2000)
    stage: Literal['Saved', 'Applied', 'Interview', 'Offer', 'Closed']
    notes: str = Field(max_length=3000)
    nextDate: str = Field(max_length=10)
    createdAt: str = Field(max_length=40)
    updatedAt: str = Field(max_length=40)
    sponsorship: str = Field(max_length=300)
    sample: bool

    @field_validator('url')
    @classmethod
    def https_only(cls, value: str) -> str:
        if value and not re.match(r'^https://[^\s@/]+(/\S*)?$', value):
            raise ValueError('Job links must use HTTPS.')
        return value

    @field_validator('nextDate')
    @classmethod
    def iso_date(cls, value: str) -> str:
        if value and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            raise ValueError('Dates use YYYY-MM-DD.')
        return value


class Board(BaseModel):
    jobs: list[SavedJob] = Field(max_length=MAX_JOBS)


def _session(db: sqlite3.Connection, user_id: int, email: str) -> dict:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    db.execute('delete from sessions where expires_at <= ?', (now,))
    db.execute('insert into sessions values (?, ?, ?)', (_token_hash(token), user_id, now + SESSION_SECONDS))
    db.commit()
    return {'token': token, 'email': email, 'expires_in': SESSION_SECONDS}


def _throttle(request: Request, action: str):
    address = request.client.host if request.client else 'unknown'
    if not hosted_access.allowed(f'{action}:{address}', 10, 600):
        raise HTTPException(429, 'Too many attempts. Try again in ten minutes.')


@router.post('/register', status_code=201)
def register(body: Credentials, request: Request):
    _enabled()
    _throttle(request, 'register')
    with closing(_connect()) as db:
        try:
            cursor = db.execute('insert into users (email, password_hash, created_at) values (?, ?, ?)',
                                (body.email, _hash_password(body.password.get_secret_value()), int(time.time())))
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'An account with this email already exists. Sign in instead.') from None
        return _session(db, cursor.lastrowid, body.email)


@router.post('/login')
def login(body: Credentials, request: Request):
    _enabled()
    _throttle(request, 'account-login')
    with closing(_connect()) as db:
        row = db.execute('select id, password_hash from users where email = ?', (body.email,)).fetchone()
        if not row or not _password_matches(body.password.get_secret_value(), row[1]):
            raise HTTPException(401, 'The email or password was not accepted.')
        return _session(db, row[0], body.email)


@router.post('/logout')
def logout(x_account_token: str | None = Header(default=None)):
    _user(x_account_token)
    with closing(_connect()) as db:
        db.execute('delete from sessions where token_hash = ?', (_token_hash(x_account_token),))
        db.commit()
    return {'signed_out': True}


@router.get('')
def me(x_account_token: str | None = Header(default=None)):
    _, email = _user(x_account_token)
    return {'email': email}


@router.delete('')
def delete_account(x_account_token: str | None = Header(default=None)):
    user_id, _ = _user(x_account_token)
    with closing(_connect()) as db:
        db.execute('delete from users where id = ?', (user_id,))  # cascades to sessions and board
        db.commit()
    return {'deleted': True}


@router.get('/applications')
def get_board(x_account_token: str | None = Header(default=None)):
    user_id, _ = _user(x_account_token)
    with closing(_connect()) as db:
        row = db.execute('select jobs, updated_at from boards where user_id = ?', (user_id,)).fetchone()
    return {'jobs': json.loads(row[0]) if row else [], 'updated_at': row[1] if row else None}


@router.put('/applications')
def save_board(body: Board, x_account_token: str | None = Header(default=None)):
    user_id, _ = _user(x_account_token)
    now = int(time.time())
    with closing(_connect()) as db:
        db.execute('insert into boards values (?, ?, ?) on conflict(user_id) do update set jobs = excluded.jobs, updated_at = excluded.updated_at',
                   (user_id, json.dumps([job.model_dump() for job in body.jobs]), now))
        db.commit()
    return {'saved': len(body.jobs), 'updated_at': now}
