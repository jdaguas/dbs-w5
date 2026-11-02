"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FreshnessBanner } from "@/components/freshness-banner";
import { HeatLegend, Heatmap } from "@/components/heatmap";
import {
  type ActivityRow,
  addRows,
  type Cells,
  freshness,
  heatRow,
  normalizeTitle,
  topRows,
  windowBuckets,
  type WorkerRun,
} from "@/lib/live";
import { useSupabase } from "@/lib/supabase/client";

const TOP_N = 20;
const RERANK_EVERY_MS = 60_000; // Realtime keeps cells current; this re-checks which articles are on top.

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function LiveDashboard() {
  const supabase = useSupabase();
  const now = useNow(1000);
  const buckets = useMemo(() => windowBuckets(now), [now]);

  const [cells, setCells] = useState<Cells>(new Map());
  const [follows, setFollows] = useState<string[]>([]);
  const [latestRun, setLatestRun] = useState<WorkerRun | null>(null);
  const [latestOkAt, setLatestOkAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const [pulses, setPulses] = useState<Map<string, number>>(new Map());
  const [followError, setFollowError] = useState<string | null>(null);

  // Full load: top articles, my follows and their activity, and the latest worker runs.
  const load = useCallback(async () => {
    const since = new Date(windowBuckets(Date.now())[0]).toISOString();
    const [top, mine, lastRun, lastOk] = await Promise.all([
      supabase.rpc("top_articles", { window_minutes: 60, max_articles: 25 }),
      supabase.from("follows").select("title").order("created_at"),
      supabase.from("worker_runs").select("*").order("id", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("worker_runs").select("ran_at").eq("ok", true).order("id", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const err = top.error ?? mine.error ?? lastRun.error ?? lastOk.error;
    if (err) {
      setLoadError(err.message);
      return;
    }
    const titles = (mine.data ?? []).map((f) => f.title as string);
    let followRows: ActivityRow[] = [];
    if (titles.length > 0) {
      const res = await supabase
        .from("article_activity")
        .select("title, bucket, edit_count, last_edit_at")
        .in("title", titles)
        .gte("bucket", since);
      if (res.error) {
        setLoadError(res.error.message);
        return;
      }
      followRows = res.data as ActivityRow[];
    }
    setCells(addRows(addRows(new Map(), top.data as ActivityRow[]), followRows));
    setFollows(titles);
    setLatestRun(lastRun.data as WorkerRun | null);
    setLatestOkAt(lastOk.data ? Date.parse(lastOk.data.ran_at) : null);
    setLoadError(null);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch + periodic re-rank
    load();
    const id = setInterval(load, RERANK_EVERY_MS);
    return () => clearInterval(id);
  }, [load]);

  // Realtime: every changed count and every new worker run is pushed to this page.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Realtime must be handed the Clerk token before subscribing. Without it, the
    // subscription succeeds but every message arrives empty with "401 Unauthorized",
    // because Realtime checks RLS as an anonymous visitor.
    // Clerk tokens last 60s, so hand Realtime a fresh one every 30s.
    const refresh = setInterval(() => supabase.realtime.setAuth(), 30_000);

    // A message RLS refused has errors and an empty row: a connection problem, not data.
    type Change = { new: unknown; errors: string[] | null };
    const authorized = (p: Change) => {
      if (p.errors?.length) {
        setLive("offline");
        return false;
      }
      return true;
    };

    supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel("live")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "article_activity" }, (p) => {
          if (authorized(p)) onActivity(p.new as ActivityRow);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "article_activity" }, (p) => {
          if (authorized(p)) onActivity(p.new as ActivityRow);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (p) => {
          if (!authorized(p)) return;
          const run = p.new as WorkerRun;
          setLive("live");
          setLatestRun(run);
          if (run.ok === true) setLatestOkAt(Date.parse(run.ran_at));
        })
        .subscribe((status) => {
          setLive(
            status === "SUBSCRIBED"
              ? "live"
              : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT"
                ? "offline"
                : "connecting",
          );
        });
    });

    function onActivity(row: ActivityRow) {
      setCells((prev) => addRows(prev, [row]));
      const key = `${row.title}|${Date.parse(row.bucket)}`;
      setPulses((prev) => new Map(prev).set(key, Date.now()));
    }

    return () => {
      cancelled = true;
      clearInterval(refresh);
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Forget pulses after the animation so the map doesn't grow forever.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trimming old pulse markers
    setPulses((prev) => {
      const cutoff = now - 2000;
      if ([...prev.values()].every((t) => t >= cutoff)) return prev;
      return new Map([...prev].filter(([, t]) => t >= cutoff));
    });
  }, [now]);

  const followed = useMemo(() => new Set(follows), [follows]);
  const trending = useMemo(() => topRows(cells, buckets, TOP_N), [cells, buckets]);
  const mine = useMemo(() => follows.map((t) => heatRow(cells, t, buckets)), [follows, cells, buckets]);
  const status = freshness({ loaded, loadError, latestRun, latestOkAt, now });

  async function follow(raw: string) {
    const title = normalizeTitle(raw);
    if (!title || followed.has(title)) return;
    setFollowError(null);
    setFollows((f) => [...f, title]);
    const { error } = await supabase.from("follows").insert({ title });
    if (error) {
      setFollows((f) => f.filter((t) => t !== title));
      setFollowError(`Couldn't follow "${title}": ${error.message}`);
      return;
    }
    const res = await supabase
      .from("article_activity")
      .select("title, bucket, edit_count, last_edit_at")
      .eq("title", title)
      .gte("bucket", new Date(buckets[0]).toISOString());
    if (!res.error) setCells((prev) => addRows(prev, res.data as ActivityRow[]));
  }

  async function unfollow(title: string) {
    setFollowError(null);
    setFollows((f) => f.filter((t) => t !== title));
    const { error } = await supabase.from("follows").delete().eq("title", title);
    if (error) {
      setFollows((f) => [...f, title]);
      setFollowError(`Couldn't unfollow "${title}": ${error.message}`);
    }
  }

  const toggle = (title: string) => (followed.has(title) ? unfollow(title) : follow(title));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <FreshnessBanner status={status} live={live} now={now} onRetry={load} />

      <section aria-labelledby="mine-heading" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="mine-heading" className="text-base font-semibold">
              My articles
            </h2>
            <p className="text-sm text-ink-2">Only you can see what you follow.</p>
          </div>
          <FollowForm onFollow={follow} />
        </div>
        {followError && (
          <p role="alert" className="mb-3 text-sm text-critical">
            {followError}
          </p>
        )}
        {!loaded ? (
          <SkeletonRows rows={2} />
        ) : mine.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-2">
            You aren&apos;t following any articles yet. Star one in <strong>Trending now</strong>, or add any article by
            name.
          </p>
        ) : (
          <Heatmap
            caption="Edits to the articles you follow, per 5 minutes, over the last hour"
            rows={mine}
            buckets={buckets}
            followed={followed}
            onToggleFollow={toggle}
            pulses={pulses}
            emptyRowNote="No edits"
          />
        )}
      </section>

      <section aria-labelledby="trending-heading" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="trending-heading" className="text-base font-semibold">
              Trending now
            </h2>
            <p className="text-sm text-ink-2">
              The {TOP_N} most-edited English Wikipedia articles in the last hour. Human edits only.
            </p>
          </div>
          <HeatLegend />
        </div>
        {!loaded ? (
          <SkeletonRows rows={8} />
        ) : trending.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-2">No edits recorded in the last hour yet.</p>
        ) : (
          <Heatmap
            caption="Most-edited English Wikipedia articles, edits per 5 minutes, over the last hour"
            rows={trending}
            buckets={buckets}
            followed={followed}
            onToggleFollow={toggle}
            pulses={pulses}
          />
        )}
      </section>
    </main>
  );
}

function FollowForm({ onFollow }: { onFollow: (title: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onFollow(value);
        setValue("");
      }}
      className="flex gap-2"
    >
      <label htmlFor="follow-title" className="sr-only">
        Article title
      </label>
      <input
        id="follow-title"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Article title, e.g. Chicago"
        className="w-56 rounded-md border border-line bg-page px-2.5 py-1.5 text-sm placeholder:text-muted focus:outline-2 focus:outline-accent"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        Follow
      </button>
    </form>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-[2px]" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-7 animate-pulse rounded-[3px] bg-[var(--heat-0)] motion-reduce:animate-none" />
      ))}
    </div>
  );
}
