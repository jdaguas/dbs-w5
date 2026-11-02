import { ago, type Freshness, STALE_AFTER_S, WORKER_INTERVAL_S } from "@/lib/live";

// One banner for every data state. Status colors always come with an icon and a label.
export function FreshnessBanner({
  status,
  live,
  now,
  onRetry,
}: {
  status: Freshness;
  live: "connecting" | "live" | "offline";
  now: number;
  onRetry: () => void;
}) {
  if (status.state === "loading") {
    return (
      <Banner tone="muted" icon={<Spinner />} label="Loading">
        Fetching the last hour of edits…
      </Banner>
    );
  }
  if (status.state === "error") {
    return (
      <Banner tone="critical" icon={<Cross />} label="Couldn't load">
        {status.message}{" "}
        <button onClick={onRetry} className="font-medium underline underline-offset-2">
          Try again
        </button>
      </Banner>
    );
  }
  if (status.state === "down") {
    return (
      <Banner tone="critical" icon={<Cross />} label="Down">
        The worker&apos;s last run failed: <span className="font-mono text-xs">{status.error}</span>.{" "}
        {status.lastOkAt ? `Showing data from ${ago(status.lastOkAt, now)}.` : "No successful runs yet."}
      </Banner>
    );
  }
  if (status.state === "stale") {
    return (
      <Banner tone="warning" icon={<Warn />} label="Stale">
        {status.lastOkAt
          ? `No new data for ${ago(status.lastOkAt, now).replace(" ago", "")}.`
          : "The worker hasn't run yet."}{" "}
        The worker runs every {WORKER_INTERVAL_S}s, so it may have stopped. Counts may be out of date.
      </Banner>
    );
  }
  if (live !== "live") {
    return (
      <Banner tone="warning" icon={<Warn />} label={live === "connecting" ? "Connecting" : "Reconnecting"}>
        Data was updated {ago(status.lastOkAt, now)}, but live updates aren&apos;t connected yet, so this page
        won&apos;t change on its own until they are.
      </Banner>
    );
  }
  return (
    <Banner tone="good" icon={<Dot />} label="Live">
      Updated {ago(status.lastOkAt, now)} · Checks Wikipedia every {WORKER_INTERVAL_S}s · Marked stale after{" "}
      {STALE_AFTER_S}s without an update
    </Banner>
  );
}

const TONES = {
  good: "border-good/40",
  warning: "border-warning/60",
  critical: "border-critical/50",
  muted: "border-line",
} as const;

const ICON_COLOR = {
  good: "text-good",
  warning: "text-warning",
  critical: "text-critical",
  muted: "text-muted",
} as const;

function Banner({
  tone,
  icon,
  label,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2.5 rounded-lg border bg-surface px-3.5 py-2.5 text-sm ${TONES[tone]}`}
    >
      <span className={`mt-0.5 shrink-0 ${ICON_COLOR[tone]}`}>{icon}</span>
      <p className="text-ink-2">
        <strong className="mr-1.5 font-semibold text-ink">{label}</strong>
        {children}
      </p>
    </div>
  );
}

function Dot() {
  return (
    <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden>
      <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-good opacity-50 motion-reduce:hidden" />
      <span className="h-2.5 w-2.5 rounded-full bg-good" />
    </span>
  );
}

function Warn() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <path d="M10 2.5 18.5 17h-17z" fill="currentColor" />
      <path d="M10 8v4.5M10 14.5v.5" stroke="#0b0b0b" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <circle cx="10" cy="10" r="8.5" fill="currentColor" />
      <path d="m7 7 6 6m0-6-6 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M10 3a7 7 0 0 1 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
