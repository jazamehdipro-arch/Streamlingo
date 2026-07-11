import { ApiError, authStatus, pairExtension } from "../lib/api";
import { CONNECT_EXTENSION_PATH, WEB_APP_BASE_URL } from "../config";

async function init(): Promise<void> {
  const connectLink = document.getElementById("connect-link") as HTMLAnchorElement;
  const form = document.getElementById("pair-form") as HTMLFormElement;
  const codeInput = document.getElementById("code") as HTMLInputElement;
  const feedback = document.getElementById("feedback") as HTMLDivElement;

  connectLink.href = `${WEB_APP_BASE_URL}${CONNECT_EXTENSION_PATH}`;

  const { paired } = await authStatus();
  if (paired) {
    feedback.textContent = "Déjà connecté.";
    feedback.className = "success";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    if (!code) return;

    feedback.textContent = "Association en cours…";
    feedback.className = "";

    try {
      await pairExtension(code);
      feedback.textContent = "Extension connectée avec succès.";
      feedback.className = "success";
      codeInput.value = "";
    } catch (error) {
      feedback.textContent =
        error instanceof ApiError ? `Échec de l'association : ${error.message}` : "Échec de l'association.";
      feedback.className = "error";
    }
  });
}

void init();
