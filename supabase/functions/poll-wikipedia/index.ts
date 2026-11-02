// Worker entry point. Supabase Cron calls this every 10 seconds.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runWorker, type Store } from "./worker.ts";

// Supabase provides these on its servers; they never appear in the code.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEY = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!)["default"];

const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

const store: Store = {
  async ingest(edits) {
    const { data, error } = await db.rpc("ingest_edits", { batch: edits });
    if (error) throw new Error(`ingest_edits failed: ${error.message}`);
    return data as number;
  },
  async logRun(run) {
    const { error } = await db.from("worker_runs").insert(run);
    if (error) console.error("Could not log run:", error.message);
  },
};

Deno.serve(async (req) => {
  // verify_jwt is off because secret keys aren't JWTs, so check the key here.
  // Only callers holding the secret key (Supabase Cron) can trigger a run.
  if (req.headers.get("apikey") !== SECRET_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  const run = await runWorker(store);
  console.log(JSON.stringify({ event: "run", ...run }));
  return Response.json(run, { status: run.ok ? 200 : 502 });
});
