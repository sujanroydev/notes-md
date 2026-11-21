-- The OAuth callback and VS Code polling endpoint use pending_links only from
-- the trusted Next.js server. Browser roles remain revoked by migration 003.
grant select, insert, update, delete
  on table public.pending_links
  to service_role;
