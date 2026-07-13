/**
 * Extracts YouTube's own caption track for the current video. Per
 * docs/RISKS.md this is a best-effort, not-commercially-validated source:
 * quality varies (often auto-generated), coverage is inconsistent, and the
 * per-cue timestamps are coarse (a "cue" is a whole caption line, not a
 * word).
 *
 * YouTube actively hardens this surface (2025: timedtext requests
 * increasingly return an empty 200 body without a proof-of-origin "pot"
 * token), so extraction is a fallback chain, most-reliable first:
 *   1. player response parsed from the live document (first load) and from
 *      a fresh watch-page fetch (SPA navigations) — brace-counted, not
 *      regex-terminated, so `};` inside JSON strings can't truncate it;
 *   2. the InnerTube player API with the ANDROID client, whose caption
 *      baseUrls historically skip the pot requirement;
 *   3. each candidate baseUrl tried as json3 then as legacy XML.
 * Every stage logs to the console with a [StreamLingo] prefix so a field
 * failure can be diagnosed from DevTools without a debug build.
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
}

interface PlayerResponseCaptions {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
}

function log(...args: unknown[]): void {
  console.warn("[StreamLingo]", ...args);
}

/**
 * Extracts the balanced JSON object that starts at the first `{` after
 * `marker`, honouring strings and escapes — a lazy regex up to `};` breaks
 * whenever the payload contains that byte sequence inside a string.
 */
function extractJsonObjectAfter(marker: string, text: string): unknown | null {
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = text.indexOf("{", markerIdx);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function tracksFrom(source: unknown): CaptionTrack[] {
  const pr = source as PlayerResponseCaptions | null;
  return pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}

async function fetchWatchPageHtml(videoId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      credentials: "include",
    });
    if (!response.ok) {
      log(`watch page fetch failed: HTTP ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (err) {
    log("watch page fetch threw", err);
    return null;
  }
}

/** The ANDROID InnerTube client's caption URLs have historically not required the pot token. */
async function fetchTracksViaInnertube(videoId: string, apiKey: string | null): Promise<CaptionTrack[]> {
  try {
    const url = apiKey
      ? `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`
      : "https://www.youtube.com/youtubei/v1/player";
    const response = await fetch(url, {
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
      log(`innertube player failed: HTTP ${response.status}`);
      return [];
    }
    return tracksFrom(await response.json());
  } catch (err) {
    log("innertube player threw", err);
    return [];
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

function parseLegacyXml(xml: string): CaptionCue[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const cues: CaptionCue[] = [];
  for (const node of Array.from(doc.querySelectorAll("text"))) {
    const start = parseFloat(node.getAttribute("start") ?? "");
    if (Number.isNaN(start)) continue;
    const text = (node.textContent ?? "").replace(/\n/g, " ").trim();
    if (!text) continue;
    cues.push({
      text,
      startSeconds: start,
      durSeconds: parseFloat(node.getAttribute("dur") ?? "2") || 2,
    });
  }
  return cues;
}

async function fetchCuesFromTrack(track: CaptionTrack): Promise<CaptionCue[] | null> {
  const json3Url = new URL(track.baseUrl);
  json3Url.searchParams.set("fmt", "json3");
  try {
    const response = await fetch(json3Url.toString(), { credentials: "include" });
    const body = await response.text();
    if (response.ok && body.length > 0) {
      const cues = parseJson3(JSON.parse(body) as TimedTextJson3);
      if (cues.length > 0) return cues;
    }
    log(`timedtext json3: HTTP ${response.status}, ${body.length} bytes — trying XML`);
  } catch (err) {
    log("timedtext json3 threw", err);
  }

  try {
    const response = await fetch(track.baseUrl, { credentials: "include" });
    const body = await response.text();
    if (response.ok && body.length > 0) {
      const cues = parseLegacyXml(body);
      if (cues.length > 0) return cues;
    }
    log(`timedtext xml: HTTP ${response.status}, ${body.length} bytes — empty (likely pot-token gating)`);
  } catch (err) {
    log("timedtext xml threw", err);
  }

  return null;
}

export async function fetchCaptionCues(
  videoId: string,
  targetLanguage: string | null
): Promise<CaptionCue[] | null> {
  // Source 1: the live document (valid for the initially-loaded video only —
  // YouTube's SPA leaves this stale after in-app navigation).
  const liveHtml = document.documentElement.innerHTML;
  const liveIsCurrent = window.location.href.includes(videoId);
  let tracks: CaptionTrack[] = liveIsCurrent
    ? tracksFrom(extractJsonObjectAfter("ytInitialPlayerResponse", liveHtml))
    : [];
  if (tracks.length > 0) log(`live document: ${tracks.length} caption track(s)`);

  // Source 2: fresh watch-page fetch.
  let apiKey: string | null = null;
  if (tracks.length === 0) {
    const html = await fetchWatchPageHtml(videoId);
    if (html) {
      apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? null;
      tracks = tracksFrom(extractJsonObjectAfter("ytInitialPlayerResponse", html));
      log(`fetched watch page: ${tracks.length} caption track(s)`);
    }
  }

  // Source 3: InnerTube ANDROID client.
  if (tracks.length === 0) {
    tracks = await fetchTracksViaInnertube(videoId, apiKey);
    log(`innertube fallback: ${tracks.length} caption track(s)`);
  }

  const track = pickTrack(tracks, targetLanguage);
  if (!track) {
    log("no caption track found by any method");
    return null;
  }
  log(`picked track lang=${track.languageCode} kind=${track.kind ?? "manual"}`);

  const cues = await fetchCuesFromTrack(track);
  if (cues) {
    log(`extracted ${cues.length} cues`);
    return cues;
  }

  // The chosen track's URL is gated — an ANDROID-client URL for the same
  // language may not be. One last attempt before giving up.
  const androidTracks = await fetchTracksViaInnertube(videoId, apiKey);
  const androidTrack = pickTrack(androidTracks, targetLanguage);
  if (androidTrack && androidTrack.baseUrl !== track.baseUrl) {
    log("retrying with innertube ANDROID track URL");
    const androidCues = await fetchCuesFromTrack(androidTrack);
    if (androidCues) {
      log(`extracted ${androidCues.length} cues via ANDROID URL`);
      return androidCues;
    }
  }

  log("caption track exists but every fetch returned empty — YouTube gating suspected");
  return null;
}
