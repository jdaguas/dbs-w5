-- Run the worker every 10 seconds (about 260k Edge Function calls a month; the free plan has 500k).
select cron.schedule('poll-wikipedia', '10 seconds', $$ select private.invoke_poll_wikipedia(); $$);
