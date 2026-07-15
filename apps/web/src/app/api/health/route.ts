import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServiceSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Dependency self-check, openable in a plain browser tab. Reports booleans
 * and error strings only — never key material. Exists because Vercel runtime
 * logs aren't always reachable when debugging from the field.
 */
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  let supabase = "ok";
  try {
    const client = getServiceSupabase();
    const { error } = await client.from("profiles").select("id").limit(1);
    if (error) supabase = `error: ${error.message}`;
  } catch (err) {
    supabase = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  let anthropic = "ok";
  try {
    const client = new Anthropic();
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
  } catch (err) {
    anthropic = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const healthy = supabase === "ok" && anthropic === "ok" && Object.values(env).every(Boolean);
  return NextResponse.json({ healthy, env, supabase, anthropic }, { status: healthy ? 200 : 500 });
}
