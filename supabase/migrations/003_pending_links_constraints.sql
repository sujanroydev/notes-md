-- Pairing IDs are bearer secrets, so reject short or oversized values.
alter table public.pending_links
  add constraint pending_links_pairing_id_length_check
  check (char_length(pairing_id) between 32 and 256);

alter table public.pending_links
  add constraint pending_links_expiry_after_creation_check
  check (expires_at > created_at);

create index pending_links_user_id_idx
  on public.pending_links(user_id);

revoke all on table public.pending_links from anon, authenticated;
