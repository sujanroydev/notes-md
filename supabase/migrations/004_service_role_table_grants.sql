-- The Next.js server uses the service role key and enforces row ownership in
-- application code. Grant it the table privileges needed by the app routes.
grant usage on schema public to service_role;

grant select, insert, update, delete
  on table public.users, public.sessions, public.work_projects, public.work_notes
  to service_role;
