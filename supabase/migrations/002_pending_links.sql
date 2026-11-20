-- Short-lived, one-time pairing grants used to link VS Code sessions.
create table public.pending_links (
  pairing_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index pending_links_expires_at_idx
  on public.pending_links(expires_at);

alter table public.pending_links enable row level security;
