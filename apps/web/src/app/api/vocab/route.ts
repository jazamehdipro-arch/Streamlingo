import { NextRequest, NextResponse } from "next/server";
import type { SrsState, VocabItem } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { serverError, unauthorized } from "@/lib/http";
import {
  mapSrsState,
  mapVocabItem,
  type SrsStateRow,
  type VocabItemRow,
} from "@/lib/mappers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const due = req.nextUrl.searchParams.get("due") === "true";
  const supabase = getServiceSupabase();

  const { data: vocabRows, error } = await supabase
    .from("vocab_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<VocabItemRow[]>();
  if (error) return serverError(error.message);

  const vocabIds = (vocabRows ?? []).map((row) => row.id);

  const { data: srsRows } =
    vocabIds.length > 0
      ? await supabase.from("srs_states").select("*").in("vocab_item_id", vocabIds).returns<SrsStateRow[]>()
      : { data: [] as SrsStateRow[] };

  const srsByVocabId = new Map((srsRows ?? []).map((row) => [row.vocab_item_id, row]));

  const now = Date.now();
  const items: (VocabItem & { srs: SrsState })[] = [];
  for (const row of vocabRows ?? []) {
    const srsRow = srsByVocabId.get(row.id);
    if (!srsRow) continue;
    // Words marked "known" leave the review loop entirely. Read defensively:
    // the column arrives with migration 0003 and older DBs simply lack it.
    if (due && (row as { known?: boolean }).known === true) continue;
    const srs = mapSrsState(srsRow);
    if (due && new Date(srs.dueAt).getTime() > now) continue;
    items.push({ ...mapVocabItem(row), srs });
  }

  return NextResponse.json({ items });
}
