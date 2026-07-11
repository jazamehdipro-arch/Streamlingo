/**
 * Message-passing protocol between the background worker (which holds the
 * bearer token and is the only context that ever calls fetch()) and every
 * other context (content script, popup, options). The content script runs
 * inside youtube.com's page — anything it holds is reachable by any other
 * extension/content-script sharing that page, and youtube.com's own CSP can
 * also interfere with cross-origin fetches issued from that world. Routing
 * every authenticated call through the background worker keeps the token
 * out of that exposed context and keeps host-permission-gated fetches in
 * the one place that reliably has them.
 */

export type HttpMethod = "GET" | "POST";

export interface ApiRequestMessage {
  type: "streamlingo/api-request";
  method: HttpMethod;
  path: string;
  body?: unknown;
}

export interface PairMessage {
  type: "streamlingo/pair";
  code: string;
}

export interface AuthStatusMessage {
  type: "streamlingo/auth-status";
}

export interface SignOutMessage {
  type: "streamlingo/sign-out";
}

export type BackgroundMessage =
  | ApiRequestMessage
  | PairMessage
  | AuthStatusMessage
  | SignOutMessage;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: string;
  status?: number;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface AuthStatusResult {
  paired: boolean;
}
