import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { CefrLevel, ClozeItem, KeywordCue, QuizQuestion } from "@streamlingo/shared";

const MODEL_ID = "claude-sonnet-5";
// Keyword extraction is on the hot path of overlay sync (a segment's words
// can't show until it returns); Haiku cuts that wall-clock wait ~3x and is
// fully adequate for extract+translate. Quiz/cloze/replay stay on Sonnet.
const FAST_MODEL_ID = "claude-haiku-4-5-20251001";

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

const quizQuestionSchema = z
  .object({
    question: z.string().min(1),
    choices: z.array(z.string().min(1)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    explanation: z.string().min(1),
  })
  .refine((q) => q.correctIndex < q.choices.length, {
    message: "correctIndex out of range for choices",
  });

const generateQuizResponseSchema = z.object({
  questions: z.array(quizQuestionSchema).min(2).max(3),
});

const clozeAnswerSchema = z.object({
  position: z.number().int().min(0),
  word: z.string().min(1),
});

const generateClozeResponseSchema = z
  .object({
    transcriptWithBlanks: z.string().min(1),
    answers: z.array(clozeAnswerSchema).min(1),
  })
  .refine(
    (c) => (c.transcriptWithBlanks.match(/___/g) ?? []).length === c.answers.length,
    { message: "blank count does not match answers length" }
  );

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
/** One retry on malformed/invalid JSON — transient formatting slips are the common failure mode. */
async function requestJson<T>(
  system: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  model: string = MODEL_ID
): Promise<T> {
  try {
    return await requestJsonOnce(system, userPrompt, schema, model);
  } catch {
    return requestJsonOnce(system, userPrompt, schema, model);
  }
}

async function requestJsonOnce<T>(
  system: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  model: string
): Promise<T> {
  const response = await getClient().messages.create({
    model,
    max_tokens: 4096,
    // No temperature: claude-sonnet-5 rejects the parameter outright
    // ("temperature is deprecated for this model") — passing it 400s every call.
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
words. Rules:
- List keywords in the order they appear in the transcript.
- One entry per lemma: if a word recurs, include only its first occurrence.
- Skip proper nouns (people, places, brands) and pure function words (articles, basic
  prepositions, pronouns) — they teach nothing translatable.
- Prefer words and short idiomatic phrases a learner would actually want to save to a
  vocabulary deck.

For each one, return:
- "word": the exact surface form as it appears in the transcript
- "lemma": its dictionary form
- "translation": translation into ${nativeLang}, matching the sense used in THIS transcript
  (not the most common sense of the word in general)
- "exampleSentence": a short new example sentence in ${targetLang} using the word in the same sense
- "exampleTranslation": that example sentence translated into ${nativeLang}
- "phonetic": a simple phonetic/pronunciation hint in ${nativeLang}-friendly notation, or null if not useful
- "frequencyRank": an integer 0-4 rating rarity/difficulty, anchored to CEFR:
  0 = A1 core vocabulary, 1 = A2, 2 = B1, 3 = B2, 4 = C1+/rare/idiomatic

Reply with JSON: { "keywords": [ ... ] }`;

  const result = await requestJson(system, prompt, extractKeywordsResponseSchema, FAST_MODEL_ID);
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
the feedback. Each question needs 3-4 choices with exactly one correct answer. Rules:
- Test comprehension of what was said, not trivia recall of exact numbers or side details.
- Wrong choices must be plausible (same topic, right grammatical form) but clearly wrong to
  someone who understood the passage — never "all of the above" or joke options.
- Vary the position of the correct answer across questions; do not always put it first.
- The explanation should say WHY the answer is right, quoting or paraphrasing the relevant
  part of the passage.

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

Produce a cloze version of this transcript for a ${level} learner: replace content words the
learner should be able to infer or recall — not every word, and not purely function words —
with the literal placeholder "___" (exactly three underscores), keeping everything else,
including punctuation, unchanged. Blank roughly one word per sentence for B1, slightly more
for B2/C1. Every blank must have a matching entry in "answers", in order. "position" is the
0-indexed order of the blank within the transcript (0 = first blank, 1 = second blank, ...).

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

const explainResponseSchema = z.object({
  summary: z.string().min(1),
  details: z.string().min(1),
  tricky: z.array(z.object({ phrase: z.string().min(1), meaning: z.string().min(1) })).max(5),
});

/**
 * "Explique-moi ce qui vient d'être dit" — the user is lost mid-video. Not a
 * translation (replay covers that): a plain-language explanation in the
 * learner's native language. Stays on Sonnet: comprehension help for a
 * confused learner is exactly where model quality shows.
 */
export async function explainPassage(
  transcript: string,
  level: CefrLevel,
  targetLang: string,
  nativeLang: string
): Promise<{ summary: string; details: string; tricky: { phrase: string; meaning: string }[] }> {
  const system =
    "You help a confused language learner understand what was just said in a video. You always " +
    "reply with a single JSON object and nothing else — no prose, no markdown fences.";

  const prompt = `A ${level} learner of ${targetLang} (native ${nativeLang}) just heard this passage
in a video and did not understand it:
"""
${transcript}
"""

Explain it to them in ${nativeLang}, simply:
- "summary": one short sentence — what is being said, in essence
- "details": 2-4 sentences unpacking the point being made, plainly, as if to a friend
- "tricky": up to 5 expressions from the passage likely to have caused the confusion (idioms,
  slang, fast constructions), each with its meaning in ${nativeLang}. Empty array if none.

Reply with JSON: { "summary": "...", "details": "...", "tricky": [ { "phrase": "...", "meaning": "..." } ] }`;

  return requestJson(system, prompt, explainResponseSchema);
}
