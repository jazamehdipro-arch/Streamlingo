"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function redirect() {
      try {
        const supabase = getBrowserSupabase();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        router.replace(data.session ? "/learn" : "/login");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Configuration error");
      }
    }

    redirect();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">StreamLingo</h1>
      {error ? (
        <p className="max-w-md text-sm text-neutral-500">
          {error} — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
        </p>
      ) : (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}
    </main>
  );
}
