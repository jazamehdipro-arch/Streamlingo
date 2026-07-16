import type {
  ClozeItem,
  ContentSource,
  KeywordCue,
  QuizQuestion,
  Segment,
  UserProfile,
} from "@streamlingo/shared";
import type { ApiRequestMessage, ApiResult, AuthStatusResult, PairMessage } from "./messages";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (!result.ok) {
    throw new ApiError(result.error, result.status);
  }
  return result.data;
}

function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const message: ApiRequestMessage = { type: "streamlingo/api-request", method, path, body };
  return chrome.runtime.sendMessage(message).then((result: ApiResult<T>) => unwrap(result));
}

export function pairExtension(code: string): Promise<{ paired: true }> {
  const message: PairMessage = { type: "streamlingo/pair", code };
  return chrome.runtime.sendMessage(message).then((result: ApiResult<{ paired: true }>) => unwrap(result));
}

export function authStatus(): Promise<AuthStatusResult> {
  return chrome.runtime.sendMessage({ type: "streamlingo/auth-status" });
}

export function signOut(): Promise<void> {
  return chrome.runtime.sendMessage({ type: "streamlingo/sign-out" }).then(() => undefined);
}

export function getProfile(): Promise<UserProfile | null> {
  return request<UserProfile | null>("GET", "/api/profile");
}

export function createSource(input: {
  kind: "youtube";
  externalId: string;
  title: string;
  durationSeconds?: number;
}): Promise<ContentSource> {
  return request<ContentSource>("POST", "/api/sources", input);
}

export function postSegment(
  sourceId: string,
  input: {
    index: number;
    startSeconds: number;
    endSeconds: number;
    transcript: string;
    cues: { text: string; startSeconds: number; durSeconds: number }[];
  }
): Promise<{ segment: Segment; keywordCues: KeywordCue[] }> {
  return request<{ segment: Segment; keywordCues: KeywordCue[] }>(
    "POST",
    `/api/sources/${sourceId}/segments`,
    input
  );
}

export function getQuiz(segmentId: string): Promise<{ questions: QuizQuestion[] }> {
  return request<{ questions: QuizQuestion[] }>("POST", `/api/segments/${segmentId}/quiz`);
}

export function attemptQuizQuestion(
  questionId: string,
  chosenIndex: number
): Promise<{ isCorrect: boolean; explanation: string }> {
  return request<{ isCorrect: boolean; explanation: string }>(
    "POST",
    `/api/quiz-questions/${questionId}/attempt`,
    { chosenIndex }
  );
}

export function getCloze(segmentId: string): Promise<ClozeItem> {
  return request<ClozeItem>("POST", `/api/segments/${segmentId}/cloze`);
}

export function getReplay(segmentId: string): Promise<{ transcript: string; translation: string }> {
  return request<{ transcript: string; translation: string }>("POST", `/api/segments/${segmentId}/replay`);
}

export function markKnown(cue: {
  lemma: string;
  translation: string;
  exampleSentence: string;
  exampleTranslation: string;
  phonetic: string | null;
}): Promise<{ known: true; lemma: string }> {
  return request<{ known: true; lemma: string }>("POST", "/api/vocab/known", cue);
}

export function generateExample(cue: {
  lemma: string;
  word: string;
  translation: string;
}): Promise<{ exampleSentence: string; exampleTranslation: string }> {
  return request("POST", "/api/vocab/example", cue);
}

export function explainRecent(
  transcript: string
): Promise<{ summary: string; details: string; tricky: { phrase: string; meaning: string }[] }> {
  return request("POST", "/api/explain", { transcript });
}

export function getVocab(): Promise<{ items: Array<{ srs: { dueAt: string } }> }> {
  return request<{ items: Array<{ srs: { dueAt: string } }> }>("GET", "/api/vocab");
}
