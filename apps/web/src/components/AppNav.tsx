"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase";
import { syncSessionCookie } from "@/lib/authClient";

const LINKS = [
  { href: "/learn", label: "Apprendre" },
  { href: "/vocab", label: "Vocabulaire" },
  { href: "/vocab/review", label: "Réviser" },
  { href: "/connect-extension", label: "Extension" },
];

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  // The landing and login pages carry their own full-page layouts.
  if (pathname === "/" || pathname === "/login") return null;

  async function signOut() {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
      syncSessionCookie(null);
    } finally {
      router.push("/");
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <Link href="/learn" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-xs text-white">
            ▶
          </span>
          StreamLingo
        </Link>

        <div className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => {
            const active =
              link.href === "/vocab" ? pathname === "/vocab" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 transition ${
                  active
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            className="ml-2 rounded-full px-3 py-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
            title="Se déconnecter"
          >
            Sortir
          </button>
        </div>
      </nav>
    </header>
  );
}
