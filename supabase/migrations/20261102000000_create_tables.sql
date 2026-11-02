-- Wiki Heatmap tables. See docs/data-flow.md.

-- One row per English Wikipedia article edit, keyed by Wikipedia's recent-changes id.
create table public.edits (
  rcid        bigint primary key,
  title       text not null,
  page_id     bigint not null,
  rev_id      bigint not null,
  editor      text,
  edited_at   timestamptz not null,
  size_delta  integer not null default 0,
  saved_at    timestamptz not null default now()
);
create index edits_edited_at_idx on public.edits (edited_at desc);

-- Edit counts per article per 5-minute window. This drives the heat map.
create table public.article_activity (
  title         text not null,
  bucket        timestamptz not null,
  edit_count    integer not null default 0,
  last_edit_at  timestamptz not null,
  primary key (title, bucket)
);
create index article_activity_bucket_idx on public.article_activity (bucket desc);

-- One row per worker run. Drives the fresh / stale / down states.
create table public.worker_runs (
  id             bigint generated always as identity primary key,
  ran_at         timestamptz not null default now(),
  ok             boolean not null,
  edits_fetched  integer not null default 0,
  rows_changed   integer not null default 0,
  duration_ms    integer,
  error          text
);
create index worker_runs_ran_at_idx on public.worker_runs (ran_at desc);

-- Articles each person follows. user_id is the Clerk user id (the JWT "sub").
create table public.follows (
  user_id     text not null default (auth.jwt() ->> 'sub'),
  title       text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, title)
);

-- Row-level security. The worker uses the secret key, which bypasses RLS.
alter table public.edits            enable row level security;
alter table public.article_activity enable row level security;
alter table public.worker_runs      enable row level security;
alter table public.follows          enable row level security;

-- edits: no policies, so signed-in users can't read raw edits; only the worker touches it.

create policy "Signed-in users can read activity"
  on public.article_activity for select to authenticated using (true);

create policy "Signed-in users can read worker runs"
  on public.worker_runs for select to authenticated using (true);

create policy "Users read their own follows"
  on public.follows for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create policy "Users add their own follows"
  on public.follows for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

create policy "Users remove their own follows"
  on public.follows for delete to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

-- Table access (Realtime needs read access too).
revoke all on public.edits, public.article_activity, public.worker_runs, public.follows from anon, authenticated;
grant select on public.article_activity, public.worker_runs to authenticated;
grant select, insert, delete on public.follows to authenticated;

-- Realtime: push changes from these tables to open pages.
alter publication supabase_realtime add table public.article_activity, public.worker_runs, public.follows;

-- Saves a batch of edits from the worker. Inserts only edits not already stored, then adds
-- just those to their article's 5-minute window, in one transaction. Returns rows changed.
create or replace function public.ingest_edits(batch jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  with new_edits as (
    insert into public.edits (rcid, title, page_id, rev_id, editor, edited_at, size_delta)
    select (e ->> 'rcid')::bigint,
           e ->> 'title',
           (e ->> 'page_id')::bigint,
           (e ->> 'rev_id')::bigint,
           e ->> 'editor',
           (e ->> 'edited_at')::timestamptz,
           coalesce((e ->> 'size_delta')::integer, 0)
    from jsonb_array_elements(batch) as e
    on conflict (rcid) do nothing
    returning title, edited_at
  ),
  counts as (
    select title,
           date_bin('5 minutes', edited_at, timestamptz '2000-01-01') as bucket,
           count(*)::integer as n,
           max(edited_at) as last_edit_at
    from new_edits
    group by 1, 2
  ),
  upserted as (
    insert into public.article_activity as a (title, bucket, edit_count, last_edit_at)
    select title, bucket, n, last_edit_at from counts
    on conflict (title, bucket) do update
      set edit_count   = a.edit_count + excluded.edit_count,
          last_edit_at = greatest(a.last_edit_at, excluded.last_edit_at)
    returning 1
  )
  select count(*) into changed from upserted;
  return changed;
end;
$$;

revoke execute on function public.ingest_edits(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_edits(jsonb) to service_role;
