import { NextRequest, NextResponse } from "next/server";
import { createInitialSrsState, type SrsState, type VocabItem } from "@streamlingo/shared";
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
    // Words marked "known" leave the review loop entirely. Read defensively:
    // the column arrives with migration 0003 and older DBs simply lack it.
    const known = (row as { known?: boolean }).known === true;

    if (due) {
      if (known || !srsRow) continue;
      const srs = mapSrsState(srsRow);
      if (new Date(srs.dueAt).getTime() > now) continue;
      items.push({ ...mapVocabItem(row), srs });
    } else {
      // Full bank: keep known words too (they may lack an SRS row when marked
      // known straight from the overlay), synthesizing a default state so the
      // page can still show a mastery badge and stats.
      const srs = srsRow ? mapSrsState(srsRow) : createInitialSrsState(row.id);
      items.push({ ...mapVocabItem(row), srs });
    }
  }

  return NextResponse.json({ items });
}
