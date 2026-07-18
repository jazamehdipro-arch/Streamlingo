import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { TranscriptCue } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Server-side YouTube caption fetch for the no-extension watch mode
 * (mobile). YouTube challenges datacenter IPs far more than browsers, and
 * which InnerTube client identity gets through varies over time — so this
 * tries several (ANDROID, IOS, WEB), each with its matching User-Agent,
 * and reports per-client playability status in errors so field failures
 * are diagnosable from the response alone.
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

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
}

interface TimedTextJson3 {
  events?: Array<{
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string }>;
  }>;
}

const CLIENTS = [
  {
    label: "EMBEDDED",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    context: {
      clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
      clientVersion: "2.0",
      hl: "en",
    },
    thirdParty: { embedUrl: "https://www.youtube.com/" },
  },
  {
    label: "MWEB",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    context: { clientName: "MWEB", clientVersion: "2.20250110.01.00", hl: "en" },
  },
  {
    label: "ANDROID",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    context: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en" },
  },
  {
    label: "IOS",
    userAgent: "com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 17_5 like Mac OS X)",
    context: { clientName: "IOS", clientVersion: "20.10.38", deviceModel: "iPhone16,2", hl: "en" },
  },
  {
    label: "WEB",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    context: { clientName: "WEB", clientVersion: "2.20250110.00.00", hl: "en" },
  },
] as const;

/**
 * Optional residential/rotating proxy for every YouTube request — the
 * definitive answer to the datacenter bot wall. Set CAPTIONS_PROXY_URL
 * (e.g. http://user:pass@proxy-host:port) in Vercel env and all fetches
 * below route through it; unset, they go direct.
 */
function proxyDispatcher(): object | undefined {
  const proxyUrl = process.env.CAPTIONS_PROXY_URL;
  if (!proxyUrl) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ProxyAgent } = require("undici") as typeof import("undici");
  return { dispatcher: new ProxyAgent(proxyUrl) };
}

async function fetchPlayerResponse(
  videoId: string,
  client: (typeof CLIENTS)[number]
): Promise<{ tracks: CaptionTrack[]; status: string }> {
  try {
    const context: Record<string, unknown> = { client: client.context };
    if ("thirdParty" in client && client.thirdParty) context.thirdParty = client.thirdParty;
    const response = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": client.userAgent,
      },
      body: JSON.stringify({ context, videoId }),
      ...proxyDispatcher(),
    });
    if (!response.ok) return { tracks: [], status: `http_${response.status}` };
    const data = (await response.json()) as PlayerResponse;
    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const status = data.playabilityStatus?.status ?? "UNKNOWN";
    return { tracks, status: tracks.length > 0 ? `${status}(${tracks.length} tracks)` : status };
  } catch (err) {
    return { tracks: [], status: `error:${err instanceof Error ? err.message : String(err)}` };
  }
}

function parseJson3(body: string): TranscriptCue[] {
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
  return cues;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);
  const { videoId, language } = parsed.data;

  const statuses: Record<string, string> = {};

  for (const client of CLIENTS) {
    const { tracks, status } = await fetchPlayerResponse(videoId, client);
    statuses[client.label] = status;
    if (tracks.length === 0) continue;

    const track =
      tracks.find((t) => t.languageCode === language) ??
      tracks.find((t) => t.languageCode.startsWith(language)) ??
      tracks[0];

    try {
      const url = new URL(track.baseUrl);
      url.searchParams.set("fmt", "json3");
      const response = await fetch(url.toString(), {
        headers: { "user-agent": client.userAgent },
        ...proxyDispatcher(),
      });
      const body = await response.text();
      if (!response.ok || body.length === 0) {
        statuses[client.label] += ` timedtext:${response.status}/${body.length}b`;
        continue;
      }
      const cues = parseJson3(body);
      if (cues.length === 0) {
        statuses[client.label] += " timedtext:empty";
        continue;
      }
      return NextResponse.json({
        cues,
        languageCode: track.languageCode,
        kind: track.kind ?? "manual",
        client: client.label,
      });
    } catch (err) {
      statuses[client.label] += ` timedtext-error:${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const anyBotWall = Object.values(statuses).some((s) => /LOGIN_REQUIRED|UNPLAYABLE|http_4/.test(s));
  return NextResponse.json(
    {
      error: anyBotWall
        ? "YouTube bloque la récupération des sous-titres depuis le serveur pour cette vidéo."
        : "Aucun sous-titre accessible pour cette vidéo.",
      reason: anyBotWall ? "gated" : "no_tracks",
      statuses,
    },
    { status: 502 }
  );
}
