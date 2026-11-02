-- Keep the free-tier database small: the heat map only needs recent data.
-- Every 15 minutes, delete edits, counts, and run records older than 24 hours.
select cron.schedule('prune-old-data', '*/15 * * * *', $$
  delete from public.edits            where edited_at < now() - interval '24 hours';
  delete from public.article_activity where bucket    < now() - interval '24 hours';
  delete from public.worker_runs      where ran_at    < now() - interval '24 hours';
$$);
