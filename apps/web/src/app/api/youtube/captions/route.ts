import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { TranscriptCue } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { badRequest, serverError, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Server-side YouTube caption fetch for the no-extension watch mode
 * (mobile). Uses the InnerTube player API with the ANDROID client — the
 * same fallback that proved reliable in the extension against pot-token
 * gating. Server IPs are more likely to be challenged by YouTube than a
 * real browser, so every failure returns a structured reason the client
 * can surface honestly instead of a generic error.
 */

const bodySchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{5,20}$/),
  language: z.string().min(2).max(8),
});

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

interface TimedTextJson3 {
  events?: Array<{
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string }>;
  }>;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);
  const { videoId, language } = parsed.data;

  let playerData: unknown;
  try {
    const response = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            androidSdkVersion: 30,
            hl: "en",
          },
        },
        videoId,
      }),
    });
    if (!response.ok) {
      return serverError(`YouTube player API: HTTP ${response.status}`);
    }
    playerData = await response.json();
  } catch (err) {
    return serverError(`YouTube unreachable from server: ${err instanceof Error ? err.message : String(err)}`);
  }

  const tracks: CaptionTrack[] =
    (playerData as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } })
      .captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  if (tracks.length === 0) {
    return NextResponse.json(
      { error: "Cette vidéo n'a pas de sous-titres.", reason: "no_tracks" },
      { status: 404 }
    );
  }

  const track =
    tracks.find((t) => t.languageCode === language) ??
    tracks.find((t) => t.languageCode.startsWith(language)) ??
    tracks[0];

  try {
    const url = new URL(track.baseUrl);
    url.searchParams.set("fmt", "json3");
    const response = await fetch(url.toString());
    const body = await response.text();
    if (!response.ok || body.length === 0) {
      return NextResponse.json(
        {
          error: "Sous-titres bloqués par YouTube côté serveur.",
          reason: "gated",
          status: response.status,
          bytes: body.length,
        },
        { status: 502 }
      );
    }

    const cues: TranscriptCue[] = [];
    for (const event of (JSON.parse(body) as TimedTextJson3).events ?? []) {
      if (event.tStartMs === undefined || !event.segs) continue;
      const text = event.segs
        .map((seg) => seg.utf8 ?? "")
        .join("")
        .replace(/\n/g, " ")
        .trim();
      if (!text) continue;
      cues.push({
        text,
        startSeconds: event.tStartMs / 1000,
        durSeconds: (event.dDurationMs ?? 2000) / 1000,
      });
    }

    if (cues.length === 0) {
      return NextResponse.json(
        { error: "Piste de sous-titres vide.", reason: "empty" },
        { status: 404 }
      );
    }

    return NextResponse.json({ cues, languageCode: track.languageCode, kind: track.kind ?? "manual" });
  } catch (err) {
    return serverError(`Caption fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
