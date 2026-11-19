-- notes-md Work mode database schema (Migration 001)
--
-- IMPORTANT: Personal notes are NEVER stored in this schema. Personal notes
-- live exclusively in browser IndexedDB (Dexie) within the web application.
--
-- All writes are performed by the Next.js backend using the Supabase service
-- role key, which bypasses RLS. Ownership/authorization is therefore enforced
-- explicitly in application code on every operation. RLS is enabled as defense
-- in depth only.

-- ============================================================================
-- Extension: uuid-ossp / pgcrypto for stable UUIDs and hashing helpers
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- public.users
-- Application-managed users (NOT Supabase Auth / auth.users).
-- Identity comes from Google OAuth `sub` (google_id).
-- ============================================================================
create table public.users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  email text unique not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- public.sessions
-- Application-managed sessions. Only the token_hash is stored (never the
-- raw token). Both web (HttpOnly cookie) and VS Code (bearer token in
-- context.secrets) sessions live here.
-- ============================================================================
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index sessions_user_id_idx on public.sessions(user_id);
create index sessions_token_hash_idx on public.sessions(token_hash);
create index sessions_expires_at_idx on public.sessions(expires_at);

-- ============================================================================
-- public.work_projects
-- Cloud projects for Work mode. One owner (user_id). Permanent cloud UUIDs
-- (never derived from workspace paths/hostnames).
-- ============================================================================
create table public.work_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index work_projects_user_id_idx on public.work_projects(user_id, deleted_at);
create index work_projects_deleted_at_idx on public.work_projects(deleted_at);

-- ============================================================================
-- public.work_notes
-- Work notes. note_type in ('global', 'project_default', 'regular').
-- version + content_hash support optimistic concurrency / conflict detection.
-- Soft-deleted via deleted_at (tombstones).
-- ============================================================================
create table public.work_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.work_projects(id) on delete cascade,
  name text not null,
  content text not null default '',
  note_type text not null check (note_type in ('global', 'project_default', 'regular')),
  version bigint not null default 1,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index work_notes_user_id_idx on public.work_notes(user_id, deleted_at);
create index work_notes_project_id_idx on public.work_notes(project_id, deleted_at);
create index work_notes_deleted_at_idx on public.work_notes(deleted_at);

-- One GLOBAL.md per user (active, non-deleted).
create unique index work_notes_one_global_per_user_idx
  on public.work_notes(user_id)
  where note_type = 'global' and deleted_at is null;

-- One NOTES.md per project (active, non-deleted).
create unique index work_notes_one_default_per_project_idx
  on public.work_notes(project_id)
  where note_type = 'project_default' and deleted_at is null;

-- No duplicate active regular note names within the same project.
create unique index work_notes_unique_regular_name_per_project_idx
  on public.work_notes(project_id, lower(name))
  where note_type = 'regular' and deleted_at is null;

-- ============================================================================
-- Row Level Security (defense in depth only; service-role backend bypasses it)
-- ============================================================================
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.work_projects enable row level security;
alter table public.work_notes enable row level security;

create policy users_own_row on public.users
  for all using (auth.uid() = id);

create policy sessions_own on public.sessions
  for all using (auth.uid() = user_id);

create policy projects_own on public.work_projects
  for all using (auth.uid() = user_id);

create policy notes_own on public.work_notes
  for all using (auth.uid() = user_id);
