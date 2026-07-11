import { API_BASE_URL, STORAGE_KEYS } from "../config";
import type {
  ApiResult,
  AuthStatusResult,
  BackgroundMessage,
} from "../lib/messages";

async function getToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.authToken);
  const token = stored[STORAGE_KEYS.authToken];
  return typeof token === "string" ? token : null;
}

async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.authToken]: token });
}

async function clearToken(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.authToken);
}

async function authenticatedFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const token = await getToken();
  if (!token) {
    return { ok: false, error: "not_paired" };
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: text || response.statusText, status: response.status };
    }

    if (response.status === 204) {
      return { ok: true, data: undefined as T };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "network_error" };
  }
}

async function pair(code: string): Promise<ApiResult<{ paired: true }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/extension/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: text || response.statusText, status: response.status };
    }

    const data = (await response.json()) as { accessToken: string };
    await setToken(data.accessToken);
    return { ok: true, data: { paired: true } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "network_error" };
  }
}

chrome.runtime.onMessage.addListener((rawMessage: BackgroundMessage, _sender, sendResponse) => {
  switch (rawMessage.type) {
    case "streamlingo/api-request":
      authenticatedFetch(rawMessage.method, rawMessage.path, rawMessage.body).then(sendResponse);
      return true;
    case "streamlingo/pair":
      pair(rawMessage.code).then(sendResponse);
      return true;
    case "streamlingo/auth-status":
      getToken()
        .then((token): AuthStatusResult => ({ paired: token !== null }))
        .then(sendResponse);
      return true;
    case "streamlingo/sign-out":
      clearToken().then(() => sendResponse({ ok: true, data: undefined }));
      return true;
    default:
      return false;
  }
});
