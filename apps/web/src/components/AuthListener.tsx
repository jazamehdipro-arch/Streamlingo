"use client";

import { useEffect } from "react";
import { startAuthCookieSync } from "@/lib/authClient";

/** Mounted once in the root layout so the session cookie (see authClient.ts) stays in sync everywhere. */
export default function AuthListener() {
  useEffect(() => {
    try {
      return startAuthCookieSync();
    } catch (err) {
      console.error("Auth cookie sync unavailable — check Supabase env vars", err);
    }
  }, []);

  return null;
}
