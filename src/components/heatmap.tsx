"use client";

import { useState } from "react";
import { BUCKET_MS, type HeatRow, LEVEL_LABELS, level, wikiUrl } from "@/lib/live";

type Tip = { title: string; bucket: number; count: number; x: number; y: number };

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function windowLabel(bucket: number) {
  return `${timeFmt.format(bucket)}–${timeFmt.format(bucket + BUCKET_MS)}`;
}

function columnLabel(bucket: number, i: number, n: number) {
  if (i === n - 1) return "now";
  // Label every third column so the axis stays readable.
  return (n - 1 - i) % 3 === 0 ? timeFmt.format(bucket) : "";
}

export function Heatmap({
  caption,
  rows,
  buckets,
  followed,
  onToggleFollow,
  pulses,
  emptyRowNote,
}: {
  caption: string;
  rows: HeatRow[];
  buckets: number[];
  followed: Set<string>;
  onToggleFollow: (title: string) => void;
  pulses: Map<string, number>;
  emptyRowNote?: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);

  function showTip(e: React.PointerEvent | React.FocusEvent, title: string, bucket: number, count: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ title, bucket, count, x: r.left + r.width / 2, y: r.top });
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-[2px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface pb-1 text-left text-xs font-medium text-muted">
                Article
              </th>
              {buckets.map((b, i) => (
                <th
                  key={b}
                  scope="col"
                  className="pb-1 text-left text-xs font-normal whitespace-nowrap text-muted tabular-nums"
                  aria-label={windowLabel(b)}
                >
                  {columnLabel(b, i, buckets.length)}
                </th>
              ))}
              <th scope="col" className="pb-1 pl-2 text-right text-xs font-medium whitespace-nowrap text-muted">
                Last hour
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isFollowed = followed.has(row.title);
              return (
                <tr key={row.title}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[16rem] bg-surface pr-2 text-left font-normal"
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleFollow(row.title)}
                        aria-pressed={isFollowed}
                        aria-label={`${isFollowed ? "Unfollow" : "Follow"} ${row.title}`}
                        title={isFollowed ? "Unfollow" : "Follow"}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-[var(--heat-0)] focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <StarIcon filled={isFollowed} />
                      </button>
                      <a
                        href={wikiUrl(row.title)}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-ink hover:underline"
                        title={row.title}
                      >
                        {row.title}
                      </a>
                    </div>
                  </th>
                  {row.counts.map((count, i) => {
                    const bucket = buckets[i];
                    const key = `${row.title}|${bucket}`;
                    const pulse = pulses.get(key);
                    return (
                      <td key={bucket} className="p-0">
                        <div
                          // Remount on each pulse so the animation restarts.
                          key={pulse ?? 0}
                          tabIndex={0}
                          role="img"
                          aria-label={`${count} ${count === 1 ? "edit" : "edits"}, ${windowLabel(bucket)}`}
                          onPointerEnter={(e) => showTip(e, row.title, bucket, count)}
                          onPointerLeave={() => setTip(null)}
                          onFocus={(e) => showTip(e, row.title, bucket, count)}
                          onBlur={() => setTip(null)}
                          className={`h-7 min-w-6 rounded-[3px] outline-offset-1 hover:outline-2 hover:outline-ink focus-visible:outline-2 focus-visible:outline-ink ${pulse ? "cell-pulse" : ""}`}
                          style={{ background: `var(--heat-${level(count)})` }}
                        />
                      </td>
                    );
                  })}
                  <td className="pl-2 text-right whitespace-nowrap text-ink-2 tabular-nums">
                    {row.total === 0 && emptyRowNote ? (
                      <span className="text-xs text-muted">{emptyRowNote}</span>
                    ) : (
                      row.total
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          <div className="font-semibold text-ink tabular-nums">
            {tip.count} {tip.count === 1 ? "edit" : "edits"}
          </div>
          <div className="max-w-[16rem] truncate text-ink-2">{tip.title}</div>
          <div className="text-muted tabular-nums">{windowLabel(tip.bucket)}</div>
        </div>
      )}
    </div>
  );
}

export function HeatLegend() {
  return (
    <figure className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
      <figcaption className="font-medium">Edits per 5 minutes</figcaption>
      <ol className="flex items-end gap-[2px]" aria-label="Color scale">
        {LEVEL_LABELS.map((label, l) => (
          <li key={label} className="flex flex-col items-center gap-0.5">
            <span className="h-3 w-7 rounded-[2px]" style={{ background: `var(--heat-${l})` }} aria-hidden />
            <span className="text-muted tabular-nums">{label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <path
        d="M10 2.5l2.32 4.7 5.18.75-3.75 3.66.89 5.16L10 14.33l-4.64 2.44.89-5.16L2.5 7.95l5.18-.75z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
