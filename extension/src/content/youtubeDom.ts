export function getVideoElement(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video.html5-main-video, video.video-stream");
}

export function waitForVideoElement(timeoutMs = 15000): Promise<HTMLVideoElement | null> {
  const existing = getVideoElement();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const video = getVideoElement();
      if (video) {
        observer.disconnect();
        resolve(video);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(getVideoElement());
    }, timeoutMs);
  });
}

export function getVideoIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("v");
}

const CLOZE_HIDE_STYLE_ID = "streamlingo-hide-native-captions";

/**
 * Hides YouTube's own caption renderer via CSS rather than clicking its CC
 * toggle button: the toggle mutates YouTube's own player state (and is a
 * different DOM element/class per YouTube frontend revision), while hiding
 * the caption window with a scoped stylesheet is reversible, doesn't fight
 * YouTube's internal state machine, and survives minor markup churn.
 */
export function hideNativeCaptions(): void {
  if (document.getElementById(CLOZE_HIDE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CLOZE_HIDE_STYLE_ID;
  style.textContent = ".ytp-caption-window-container { display: none !important; }";
  document.head.appendChild(style);
}

export function showNativeCaptions(): void {
  document.getElementById(CLOZE_HIDE_STYLE_ID)?.remove();
}
