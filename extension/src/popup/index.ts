import { authStatus } from "../lib/api";
import { CONNECT_EXTENSION_PATH, STORAGE_KEYS, WEB_APP_BASE_URL } from "../config";

async function init(): Promise<void> {
  const dot = document.getElementById("status-dot") as HTMLSpanElement;
  const text = document.getElementById("status-text") as HTMLSpanElement;
  const unpairedActions = document.getElementById("unpaired-actions") as HTMLDivElement;
  const connectLink = document.getElementById("connect-link") as HTMLAnchorElement;
  const optionsLink = document.getElementById("options-link") as HTMLAnchorElement;

  connectLink.href = `${WEB_APP_BASE_URL}${CONNECT_EXTENSION_PATH}`;
  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const { paired } = await authStatus();
  dot.classList.add(paired ? "paired" : "unpaired");
  text.textContent = paired ? "Connecté" : "Non connecté";
  unpairedActions.hidden = paired;

  const stored = await chrome.storage.local.get(STORAGE_KEYS.overlayPosition);
  const currentPosition = stored[STORAGE_KEYS.overlayPosition] === "top-left" ? "top-left" : "top-right";

  const radios = document.querySelectorAll<HTMLInputElement>('input[name="position"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === currentPosition;
    radio.addEventListener("change", () => {
      if (radio.checked) {
        void chrome.storage.local.set({ [STORAGE_KEYS.overlayPosition]: radio.value });
      }
    });
  });
}

void init();
