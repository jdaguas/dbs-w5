// One worker run: fetch edits, save only the new ones, and record the run.

import { type EditRow, fetchRecentChanges, toEditRows } from "./wikipedia.ts";

export type RunRecord = {
  ok: boolean;
  edits_fetched: number;
  rows_changed: number;
  duration_ms: number;
  error: string | null;
};

// What the worker needs from the database. index.ts backs this with Supabase;
// the test backs it with an in-memory fake.
export type Store = {
  ingest(edits: EditRow[]): Promise<number>; // returns article_activity rows changed
  logRun(run: RunRecord): Promise<void>;
};

export async function runWorker(store: Store, fetchFn: typeof fetch = fetch): Promise<RunRecord> {
  const started = Date.now();
  let run: RunRecord;
  try {
    const edits = toEditRows(await fetchRecentChanges(fetchFn));
    const rowsChanged = edits.length > 0 ? await store.ingest(edits) : 0;
    run = {
      ok: true,
      edits_fetched: edits.length,
      rows_changed: rowsChanged,
      duration_ms: Date.now() - started,
      error: null,
    };
  } catch (err) {
    run = {
      ok: false,
      edits_fetched: 0,
      rows_changed: 0,
      duration_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  await store.logRun(run);
  return run;
}
