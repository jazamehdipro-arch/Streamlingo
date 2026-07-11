/**
 * Extracts YouTube's own caption track for the current video. Per
 * docs/RISKS.md this is a best-effort, not-commercially-validated source:
 * quality varies (often auto-generated), coverage is inconsistent, and the
 * per-cue timestamps are coarse (a "cue" is a whole caption line, not a
 * word). We fetch a *fresh* copy of the watch page HTML rather than reading
 * `window.ytInitialPlayerResponse` off the live DOM because YouTube is a
 * SPA: navigating between videos updates internal JS state without a full
 * document reload, so a script tag parsed at content-script injection time
 * would go stale after the first video.
 */

export interface CaptionCue {
  text: string;
  startSeconds: number;
  durSeconds: number;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  isTranslatable?: boolean;
}

interface PlayerResponseCaptions {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
}

async function fetchWatchPageHtml(videoId: string): Promise<string> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    credentials: "include",
  });
  return response.text();
}

function extractPlayerResponse(html: string): PlayerResponseCaptions | null {
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var |<\/script>)/s);
  const jsonText = match?.[1];
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as PlayerResponseCaptions;
  } catch {
    return null;
  }
}

function pickTrack(tracks: CaptionTrack[], preferredLanguage: string | null): CaptionTrack | null {
  if (tracks.length === 0) return null;
  if (preferredLanguage) {
    const exact = tracks.find((t) => t.languageCode === preferredLanguage);
    if (exact) return exact;
    const prefixMatch = tracks.find((t) => t.languageCode.startsWith(preferredLanguage));
    if (prefixMatch) return prefixMatch;
  }
  return tracks[0] ?? null;
}

interface TimedTextJson3 {
  events?: Array<{
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string }>;
  }>;
}

function parseJson3(payload: TimedTextJson3): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const event of payload.events ?? []) {
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

export async function fetchCaptionCues(
  videoId: string,
  targetLanguage: string | null
): Promise<CaptionCue[] | null> {
  const html = await fetchWatchPageHtml(videoId);
  const playerResponse = extractPlayerResponse(html);
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickTrack(tracks, targetLanguage);
  if (!track) return null;

  const url = new URL(track.baseUrl);
  url.searchParams.set("fmt", "json3");
  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const json = (await response.json()) as TimedTextJson3;
  const cues = parseJson3(json);
  return cues.length > 0 ? cues : null;
}
