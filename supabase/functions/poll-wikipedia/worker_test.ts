// Runs the worker on a saved copy of a real Wikipedia response and checks what it saves.
// Run with: deno test supabase/functions/poll-wikipedia/

import { assert, assertEquals } from "jsr:@std/assert@1";
import { type EditRow } from "./wikipedia.ts";
import { type RunRecord, runWorker, type Store } from "./worker.ts";

const saved = JSON.parse(
  await Deno.readTextFile(new URL("./testdata/recentchanges.json", import.meta.url)),
);

// A fetch that returns the saved response instead of calling Wikipedia.
function fakeFetch(body: unknown, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// An in-memory store that behaves like ingest_edits: skips edits it already has, and
// reports how many (article, 5-minute window) rows changed.
function fakeStore() {
  const edits = new Map<number, EditRow>();
  const runs: RunRecord[] = [];
  const store: Store = {
    ingest(batch) {
      const touched = new Set<string>();
      for (const e of batch) {
        if (edits.has(e.rcid)) continue;
        edits.set(e.rcid, e);
        const bucket = Math.floor(Date.parse(e.edited_at) / 300_000);
        touched.add(`${e.title}|${bucket}`);
      }
      return Promise.resolve(touched.size);
    },
    logRun(run) {
      runs.push(run);
      return Promise.resolve();
    },
  };
  return { store, edits, runs };
}

Deno.test("saves every article edit in the response with the right fields", async () => {
  const { store, edits, runs } = fakeStore();
  const run = await runWorker(store, fakeFetch(saved));

  assertEquals(run.ok, true);
  assertEquals(run.edits_fetched, 21);
  assertEquals(edits.size, 21);
  assertEquals([...edits.values()].filter((e) => e.title === "Rhode Island").length, 8);

  assertEquals(edits.get(2085700892), {
    rcid: 2085700892,
    title: "Detroit Lions",
    page_id: 8577,
    rev_id: 1383312721,
    editor: "Red Director",
    edited_at: "2026-11-02T01:50:10Z",
    size_delta: 20, // 84915 - 84895
  });
  // A brand-new page counts its whole length as added.
  assertEquals(edits.get(2085700760)?.size_delta, 4923);

  assertEquals(runs.length, 1, "every run is recorded");
});

Deno.test("running again on the same response saves nothing new", async () => {
  const { store, edits, runs } = fakeStore();
  const first = await runWorker(store, fakeFetch(saved));
  const second = await runWorker(store, fakeFetch(saved));

  assert(first.rows_changed > 0);
  assertEquals(second.ok, true);
  assertEquals(second.rows_changed, 0, "overlapping polls must not count edits twice");
  assertEquals(edits.size, 21);
  assertEquals(runs.length, 2);
});

Deno.test("skips non-article pages and hidden editor names don't break it", async () => {
  const body = structuredClone(saved);
  const changes = body.query.recentchanges;
  changes.push({ ...changes[0], rcid: 1, ns: 1, title: "Talk:Detroit Lions" });
  delete changes[1].user;

  const { store, edits } = fakeStore();
  await runWorker(store, fakeFetch(body));

  assertEquals(edits.has(1), false);
  assertEquals(edits.get(changes[1].rcid)?.editor, null);
});

Deno.test("a Wikipedia outage is recorded as a failed run", async () => {
  const { store, edits, runs } = fakeStore();
  const run = await runWorker(store, fakeFetch({}, 503));

  assertEquals(run.ok, false);
  assertEquals(run.error, "Wikipedia responded 503");
  assertEquals(edits.size, 0);
  assertEquals(runs, [run]);
});

Deno.test("a changed response format is recorded as a failed run", async () => {
  const { store, runs } = fakeStore();
  const run = await runWorker(store, fakeFetch({ query: { changes: [] } }));

  assertEquals(run.ok, false);
  assertEquals(run.error, "Response has no query.recentchanges list");
  assertEquals(runs.length, 1);
});
