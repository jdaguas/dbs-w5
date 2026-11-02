// Fetches recent English Wikipedia article edits and turns them into rows for `edits`.

export const RECENT_CHANGES_URL = "https://en.wikipedia.org/w/api.php?" +
  new URLSearchParams({
    action: "query",
    list: "recentchanges",
    rctype: "edit|new", // edits and new pages, not log entries
    rcnamespace: "0", // articles only (no talk, user, or project pages)
    rcshow: "!bot", // people only
    // ~80 seconds of edits, so several missed runs don't lose data. 500 took 8+ seconds
    // to answer from Supabase's servers and hit the timeout; 100 answers in ~0.1s.
    rclimit: "100",
    rcprop: "title|ids|timestamp|user|sizes",
    format: "json",
    formatversion: "2",
  });

// Wikimedia asks every client to identify itself.
export const USER_AGENT = "dbs-w5-wiki-heatmap/0.1 (https://github.com/jdaguas/dbs-w5)";

export type EditRow = {
  rcid: number;
  title: string;
  page_id: number;
  rev_id: number;
  editor: string | null;
  edited_at: string;
  size_delta: number;
};

type RecentChange = {
  type: string;
  ns: number;
  title: string;
  pageid: number;
  revid: number;
  rcid: number;
  user?: string;
  oldlen?: number;
  newlen?: number;
  timestamp: string;
};

export async function fetchRecentChanges(fetchFn: typeof fetch = fetch): Promise<unknown> {
  const res = await fetchFn(RECENT_CHANGES_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`);
  return await res.json();
}

// Throws if the response isn't shaped the way we expect, so a format change shows up as
// a failed run (the page's "down" state) instead of silently saving nothing.
export function toEditRows(body: unknown): EditRow[] {
  const b = body as { error?: { info?: string }; query?: { recentchanges?: unknown } };
  if (b?.error) throw new Error(`Wikipedia API error: ${b.error.info ?? "unknown"}`);
  const changes = b?.query?.recentchanges;
  if (!Array.isArray(changes)) throw new Error("Response has no query.recentchanges list");

  return (changes as RecentChange[])
    .filter((c) => c.ns === 0 && (c.type === "edit" || c.type === "new"))
    .map((c) => {
      if (typeof c.rcid !== "number" || typeof c.title !== "string" || !c.timestamp) {
        throw new Error(`Unexpected recent change shape: ${JSON.stringify(c).slice(0, 200)}`);
      }
      return {
        rcid: c.rcid,
        title: c.title,
        page_id: c.pageid,
        rev_id: c.revid,
        editor: c.user ?? null, // missing when the editor's name is hidden
        edited_at: c.timestamp,
        size_delta: (c.newlen ?? 0) - (c.oldlen ?? 0),
      };
    });
}
