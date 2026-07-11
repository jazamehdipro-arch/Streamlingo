import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { CefrLevel, ClozeItem, KeywordCue, QuizQuestion } from "@streamlingo/shared";

const MODEL_ID = "claude-sonnet-5";

let client: Anthropic | null = null;

/** Constructed lazily so importing this module never requires ANTHROPIC_API_KEY at build time. */
function getClient(): Anthropic {
  if (client) return client;
  client = new Anthropic();
  return client;
}

const frequencyRankSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

const keywordSchema = z.object({
  word: z.string().min(1),
  lemma: z.string().min(1),
  translation: z.string().min(1),
  exampleSentence: z.string().min(1),
  exampleTranslation: z.string().min(1),
  phonetic: z.string().nullable(),
  frequencyRank: frequencyRankSchema,
});

const extractKeywordsResponseSchema = z.object({
  keywords: z.array(keywordSchema),
});

const quizQuestionSchema = z.object({
  question: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().min(1),
});

const generateQuizResponseSchema = z.object({
  questions: z.array(quizQuestionSchema).min(2).max(3),
});

const clozeAnswerSchema = z.object({
  position: z.number().int().min(0),
  word: z.string().min(1),
});

const generateClozeResponseSchema = z.object({
  transcriptWithBlanks: z.string().min(1),
  answers: z.array(clozeAnswerSchema).min(1),
});

const replayResponseSchema = z.object({
  transcript: z.string().min(1),
  translation: z.string().min(1),
});

/**
 * Sends a single-turn request instructing Claude to reply with JSON only,
 * then validates the parsed result against `schema`. Kept close to each
 * caller (rather than a generic "LLM client" abstraction) per docs/API.md:
 * prompts and zod schemas belong next to the function that owns them.
 */
async function requestJson<T>(system: string, userPrompt: string, schema: z.ZodType<T>): Promise<T> {
  const response = await getClient().messages.create({
    model: MODEL_ID,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM response contained no text block");
  }

  const jsonText = extractJsonObject(textBlock.text);

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (cause) {
    throw new Error(
      `LLM response was not valid JSON: ${(cause as Error).message}\nRaw text: ${textBlock.text.slice(0, 500)}`
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`LLM response failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

/** Strips any prose Claude wrapped around the JSON (or a ```json fence) down to the outermost object. */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate.trim();
  return candidate.slice(start, end + 1);
}

export async function extractKeywords(
  transcript: string,
  level: CefrLevel,
  targetLang: string,
  nativeLang: string
): Promise<Array<Omit<KeywordCue, "startSeconds">>> {
  const system =
    "You are a language-learning content pipeline. You extract vocabulary from a transcript and " +
    "translate it for a learner. You always reply with a single JSON object and nothing else — no " +
    "prose, no markdown fences.";

  const prompt = `Transcript (in ${targetLang}):
"""
${transcript}
"""

The learner's native language is ${nativeLang} and their CEFR level is ${level}.

Extract up to 20 notable vocabulary words or short phrases as they literally appear in the
transcript (so they can be located by substring search), across a mix of common and rare
difficulty — a downstream step will filter by level, so include more than just ${level}-appropriate
words. For each one, return:
- "word": the exact surface form as it appears in the transcript
- "lemma": its dictionary form
- "translation": translation into ${nativeLang}
- "exampleSentence": a short new example sentence in ${targetLang} using the word
- "exampleTranslation": that example sentence translated into ${nativeLang}
- "phonetic": a simple phonetic/pronunciation hint in ${nativeLang}-friendly notation, or null if not useful
- "frequencyRank": an integer 0-4 rating rarity/difficulty (0 = very common/basic, 4 = rare/idiomatic)

Reply with JSON: { "keywords": [ ... ] }`;

  const result = await requestJson(system, prompt, extractKeywordsResponseSchema);
  return result.keywords;
}

export async function generateQuiz(
  transcript: string,
  level: CefrLevel,
  targetLang: string,
  nativeLang: string
): Promise<Array<Omit<QuizQuestion, "id" | "segmentId">>> {
  const system =
    "You are a language-learning quiz generator. You write short comprehension quizzes calibrated " +
    "to a CEFR level. You always reply with a single JSON object and nothing else — no prose, no " +
    "markdown fences.";

  const prompt = `Transcript (in ${targetLang}):
"""
${transcript}
"""

Write 2-3 multiple-choice comprehension questions about this passage, calibrated to a ${level}
learner (question phrasing and choice complexity should match ${level}). Questions and choices
should be in ${targetLang}; the explanation should be in ${nativeLang} so the learner understands
the feedback. Each question needs 3-4 choices with exactly one correct answer.

Reply with JSON:
{
  "questions": [
    { "question": "...", "choices": ["...", "..."], "correctIndex": 0, "explanation": "..." }
  ]
}`;

  const result = await requestJson(system, prompt, generateQuizResponseSchema);
  return result.questions;
}

export async function generateCloze(
  transcript: string,
  level: CefrLevel,
  targetLang: string
): Promise<Omit<ClozeItem, "segmentId">> {
  const system =
    "You are a language-learning cloze-exercise generator. You blank out words in a transcript so " +
    "a learner can guess them by ear. You always reply with a single JSON object and nothing else — " +
    "no prose, no markdown fences.";

  const prompt = `Transcript (in ${targetLang}):
"""
${transcript}
"""

Produce a cloze version of this transcript for a ${level} learner: replace a reasonable number of
words (content words the learner should be able to infer or recall — not every word, and not
purely function words) with the literal placeholder "___", keeping everything else, including
punctuation, unchanged. "position" is the 0-indexed order of the blank within the transcript
(0 = first blank, 1 = second blank, ...).

Reply with JSON:
{
  "transcriptWithBlanks": "...text with ___ placeholders...",
  "answers": [ { "position": 0, "word": "the original word" } ]
}`;

  return requestJson(system, prompt, generateClozeResponseSchema);
}

/** Not one of the three functions API.md names explicitly, but the replay endpoint needs an LLM call too. */
export async function generateReplay(
  transcript: string,
  targetLang: string,
  nativeLang: string
): Promise<{ transcript: string; translation: string }> {
  const system =
    "You produce word-for-word transcripts and translations for language learners revisiting a " +
    "passage they didn't understand. You always reply with a single JSON object and nothing else — " +
    "no prose, no markdown fences.";

  const prompt = `Transcript (in ${targetLang}):
"""
${transcript}
"""

Reformat this into a clean, word-for-word transcript in ${targetLang} (fix only obvious
transcription noise, keep the actual words spoken), and provide a full, natural translation into
${nativeLang}.

Reply with JSON: { "transcript": "...", "translation": "..." }`;

  return requestJson(system, prompt, replayResponseSchema);
}
