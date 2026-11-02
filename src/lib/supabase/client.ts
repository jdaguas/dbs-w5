"use client";

import { useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";

// Supabase client for client components. Uses the publishable key plus the Clerk
// session token, so RLS (and Realtime) see the signed-in user's `sub`.
// Keyed on the session id, not the session object, so the client and its Realtime
// connection aren't torn down every time Clerk refreshes the session. getToken()
// always returns a fresh token for that session.
export function useSupabase() {
  const { session } = useSession();
  const sessionId = session?.id;
  return useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          async accessToken() {
            return (await session?.getToken()) ?? null;
          },
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId],
  );
}
