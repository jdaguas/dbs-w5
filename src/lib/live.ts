// Pure helpers for the live page: time windows, heat map rows, and freshness.

export const BUCKET_MS = 5 * 60 * 1000; // matches date_bin('5 minutes') in ingest_edits
export const WINDOW_BUCKETS = 12; // the last hour
export const WORKER_INTERVAL_S = 10; // Supabase Cron schedule
export const STALE_AFTER_S = 30; // ~3 missed runs

export type ActivityRow = {
  title: string;
  bucket: string; // ISO timestamp of the 5-minute window's start
  edit_count: number;
  last_edit_at: string;
};

export type WorkerRun = {
  id: number;
  ran_at: string;
  ok: boolean;
  edits_fetched: number;
  rows_changed: number;
  error: string | null;
};

// title -> bucket start (ms) -> count
export type Cells = Map<string, Map<number, number>>;

export function bucketStart(ms: number): number {
  return Math.floor(ms / BUCKET_MS) * BUCKET_MS;
}

// The 12 window starts shown as columns, oldest first, ending with the current window.
export function windowBuckets(now: number): number[] {
  const current = bucketStart(now);
  return Array.from({ length: WINDOW_BUCKETS }, (_, i) => current - (WINDOW_BUCKETS - 1 - i) * BUCKET_MS);
}

export function addRows(cells: Cells, rows: ActivityRow[]): Cells {
  const next = new Map(cells);
  for (const r of rows) {
    const byBucket = new Map(next.get(r.title) ?? []);
    byBucket.set(Date.parse(r.bucket), r.edit_count);
    next.set(r.title, byBucket);
  }
  return next;
}

export type HeatRow = { title: string; counts: number[]; total: number };

export function heatRow(cells: Cells, title: string, buckets: number[]): HeatRow {
  const byBucket = cells.get(title);
  const counts = buckets.map((b) => byBucket?.get(b) ?? 0);
  return { title, counts, total: counts.reduce((a, b) => a + b, 0) };
}

// Most-edited articles in the window. Ties go to whoever was edited most recently.
export function topRows(cells: Cells, buckets: number[], limit: number): HeatRow[] {
  return [...cells.keys()]
    .map((t) => heatRow(cells, t, buckets))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || lastActive(b) - lastActive(a) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function lastActive(r: HeatRow): number {
  return r.counts.findLastIndex((c) => c > 0);
}

// Fixed thresholds, so a cell's color means the same thing as the data changes.
// 0 -> empty, then steps 1..7 of the sequential ramp.
const THRESHOLDS = [1, 2, 3, 5, 8, 12, 20];
export const LEVEL_LABELS = ["0", "1", "2", "3–4", "5–7", "8–11", "12–19", "20+"];

export function level(count: number): number {
  let l = 0;
  for (const t of THRESHOLDS) if (count >= t) l++;
  return l;
}

// Wikipedia titles: spaces not underscores, first letter capitalized.
export function normalizeTitle(input: string): string {
  const t = input.trim().replace(/_/g, " ").replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type Freshness =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "fresh"; lastOkAt: number }
  | { state: "stale"; lastOkAt: number | null }
  | { state: "down"; lastOkAt: number | null; error: string };

export function freshness(opts: {
  loaded: boolean;
  loadError: string | null;
  latestRun: WorkerRun | null;
  latestOkAt: number | null;
  now: number;
}): Freshness {
  const { loaded, loadError, latestRun, latestOkAt, now } = opts;
  if (loadError) return { state: "error", message: loadError };
  if (!loaded) return { state: "loading" };
  if (latestRun && latestRun.ok === false) {
    return { state: "down", lastOkAt: latestOkAt, error: latestRun.error ?? "Unknown error" };
  }
  if (latestOkAt === null || now - latestOkAt > STALE_AFTER_S * 1000) {
    return { state: "stale", lastOkAt: latestOkAt };
  }
  return { state: "fresh", lastOkAt: latestOkAt };
}

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}
