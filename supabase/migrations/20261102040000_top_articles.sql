-- The heat map's starting data: the most-edited articles in the last hour, one row per
-- (article, 5-minute window). Runs as the caller, so the article_activity RLS policy applies.
create or replace function public.top_articles(window_minutes integer default 60, max_articles integer default 25)
returns table (title text, bucket timestamptz, edit_count integer, last_edit_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select a.title, a.bucket, a.edit_count, a.last_edit_at
    from public.article_activity a
    where a.bucket >= date_bin('5 minutes', now(), timestamptz '2000-01-01')
                      - make_interval(mins => window_minutes - 5)
  ),
  top as (
    select r.title
    from recent r
    group by r.title
    order by sum(r.edit_count) desc, max(r.last_edit_at) desc, r.title
    limit least(max_articles, 50)
  )
  select r.title, r.bucket, r.edit_count, r.last_edit_at
  from recent r
  join top t on t.title = r.title;
$$;

revoke execute on function public.top_articles(integer, integer) from public, anon;
grant execute on function public.top_articles(integer, integer) to authenticated;
