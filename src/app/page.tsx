import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { LiveDashboard } from "@/components/live-dashboard";

export default function Home() {
  return (
    <Suspense>
      <SignedInOrLanding />
    </Suspense>
  );
}

async function SignedInOrLanding() {
  const { userId } = await auth();
  return userId ? <LiveDashboard /> : <Landing />;
}

function Landing() {
  // A decorative sample grid, so signed-out visitors see what the page looks like.
  const sample = [
    [0, 1, 0, 2, 3, 5, 4, 6, 7, 5, 6, 7],
    [1, 0, 0, 1, 0, 2, 1, 3, 2, 4, 3, 5],
    [0, 0, 2, 1, 1, 0, 0, 1, 2, 1, 3, 2],
    [2, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1],
  ];
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div aria-hidden className="grid grid-cols-12 gap-[2px]">
        {sample.flat().map((l, i) => (
          <span key={i} className="h-5 w-6 rounded-[3px]" style={{ background: `var(--heat-${l})` }} />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">See what Wikipedia is editing right now</h1>
        <p className="text-lg text-ink-2">
          A live heat map of the most-edited English Wikipedia articles, updated every 10 seconds. Follow the articles
          you care about and watch them change without refreshing.
        </p>
      </div>
      <div className="flex gap-3">
        <SignUpButton>
          <button className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90">
            Sign up to watch
          </button>
        </SignUpButton>
        <SignInButton>
          <button className="rounded-md border border-line bg-surface px-4 py-2 font-medium hover:bg-[var(--heat-0)]">
            Sign in
          </button>
        </SignInButton>
      </div>
    </main>
  );
}
