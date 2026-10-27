-- Apply only after configuring Supabase Auth and RLS policies.
-- This schema is a proposal for the later persistence milestone.

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    created_at timestamptz not null default now()
);

create table public.cvs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    file_name text not null,
    storage_path text,
    extracted_text text,
    created_at timestamptz not null default now()
);

create table public.jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    title text,
    company text,
    description text not null,
    created_at timestamptz not null default now()
);

create table public.analyses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    cv_id uuid not null references public.cvs(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    rules_score numeric(5,2),
    semantic_score numeric(5,2),
    overall_score numeric(5,2),
    report jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table public.applications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    status text not null default 'saved'
      check (status in ('saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn')),
    applied_at timestamptz,
    notes text,
    created_at timestamptz not null default now()
);

create index idx_cvs_user on public.cvs(user_id);
create index idx_jobs_user on public.jobs(user_id);
create index idx_analyses_user_created on public.analyses(user_id, created_at desc);
create index idx_applications_user_status on public.applications(user_id, status);

-- IMPORTANT: enable RLS and add owner-only policies before storing user data.
