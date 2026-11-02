import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wiki Heatmap",
  description: "A live heat map of the most-edited English Wikipedia articles.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <ClerkProvider appearance={{ variables: { colorPrimary: "#2a78d6", borderRadius: "0.5rem" } }}>
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span aria-hidden className="grid grid-cols-2 gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-[1px] bg-[var(--heat-2)]" />
                  <span className="h-1.5 w-1.5 rounded-[1px] bg-[var(--heat-5)]" />
                  <span className="h-1.5 w-1.5 rounded-[1px] bg-[var(--heat-7)]" />
                  <span className="h-1.5 w-1.5 rounded-[1px] bg-[var(--heat-3)]" />
                </span>
                Wiki Heatmap
              </Link>
              <Suspense>
                <nav className="flex items-center gap-2 text-sm">
                  <Show when="signed-out">
                    <SignInButton>
                      <button className="rounded-md px-3 py-1.5 font-medium hover:bg-[var(--heat-0)]">Sign in</button>
                    </SignInButton>
                    <SignUpButton>
                      <button className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">
                        Sign up
                      </button>
                    </SignUpButton>
                  </Show>
                  <Show when="signed-in">
                    <UserButton />
                  </Show>
                </nav>
              </Suspense>
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
