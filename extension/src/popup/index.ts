import { authStatus, getVocab } from "../lib/api";
import { CONNECT_EXTENSION_PATH, STORAGE_KEYS, WEB_APP_BASE_URL } from "../config";

const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"];

async function init(): Promise<void> {
  const dot = document.getElementById("status-dot") as HTMLSpanElement;
  const text = document.getElementById("status-text") as HTMLSpanElement;
  const unpairedHelp = document.getElementById("unpaired-help") as HTMLDivElement;
  const connectLink = document.getElementById("connect-link") as HTMLAnchorElement;
  const statsEl = document.getElementById("stats") as HTMLDivElement;
  const statTotal = document.getElementById("stat-total") as HTMLDivElement;
  const statDue = document.getElementById("stat-due") as HTMLDivElement;
  const reviewLink = document.getElementById("review-link") as HTMLAnchorElement;
  const pauseCheck = document.getElementById("pause-check") as HTMLInputElement;

  connectLink.href = `${WEB_APP_BASE_URL}${CONNECT_EXTENSION_PATH}`;
  reviewLink.href = `${WEB_APP_BASE_URL}/vocab/review`;
  for (const id of ["options-btn", "options-link-2"]) {
    document.getElementById(id)?.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  const { paired } = await authStatus();
  dot.classList.add(paired ? "paired" : "unpaired");
  text.textContent = paired ? "Connecté" : "Non connecté";
  unpairedHelp.hidden = paired;

  if (paired) {
    statsEl.hidden = false;
    try {
      const { items } = await getVocab();
      const now = Date.now();
      statTotal.textContent = String(items.length);
      statDue.textContent = String(items.filter((i) => new Date(i.srs.dueAt).getTime() <= now).length);
    } catch {
      statTotal.textContent = "–";
      statDue.textContent = "–";
    }
  }

  const stored = await chrome.storage.local.get([STORAGE_KEYS.overlayPosition, STORAGE_KEYS.pauseOnPopover]);
  const currentPosition = POSITIONS.includes(stored[STORAGE_KEYS.overlayPosition] as string)
    ? (stored[STORAGE_KEYS.overlayPosition] as string)
    : "top-right";

  const posButtons = document.querySelectorAll<HTMLButtonElement>(".pos-btn");
  const refresh = (active: string) => {
    posButtons.forEach((b) => b.classList.toggle("active", b.dataset.pos === active));
  };
  refresh(currentPosition);
  posButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const pos = btn.dataset.pos ?? "top-right";
      void chrome.storage.local.set({ [STORAGE_KEYS.overlayPosition]: pos });
      refresh(pos);
    });
  });

  pauseCheck.checked = stored[STORAGE_KEYS.pauseOnPopover] === true;
  pauseCheck.addEventListener("change", () => {
    void chrome.storage.local.set({ [STORAGE_KEYS.pauseOnPopover]: pauseCheck.checked });
  });
}

void init();
