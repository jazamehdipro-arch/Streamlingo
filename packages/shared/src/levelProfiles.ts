import type { CefrLevel, FrequencyRank } from "./types";

/**
 * The single source of truth for what a declared CEFR level changes across
 * the whole product. Every level-dependent behaviour — which words surface,
 * how dense the overlay is, whether example translations show by default,
 * quiz style, cloze intensity, explanation depth — is defined here, so the
 * product's "your level drives everything" promise has one place to reason
 * about and tune.
 *
 * Guiding principle (product spec §2): only words ABOVE the learner's level
 * are surfaced. A beginner has almost everything above them (many words); an
 * advanced learner only the rarest (few words).
 *
 * frequencyRank scale (assigned by the LLM at extraction):
 *   0 = A1 core (~top 1000)      the, want, house
 *   1 = A2 (1000-2000)           borrow, weather, neighbour
 *   2 = B1 (2000-4000)           achievement, complain, threat
 *   3 = B2 (4000-8000)           thorough, resent, leverage
 *   4 = C1+/idiomatic            ubiquitous, to kick in, white-knuckle
 */
export interface LevelProfile {
  /** French persona label, shown in onboarding / account UI. */
  persona: string;
  /** Surface only words at or above this rarity. */
  minFrequencyRank: FrequencyRank;
  /** Cap on keyword cues per segment, to keep the overlay uncluttered. */
  maxPerSegment: number;
  /** Show the example sentence's translation without a click (helpful for lower levels). */
  showExampleTranslationByDefault: boolean;
  /** Show phonetic pronunciation hints (more useful for lower levels). */
  showPhonetic: boolean;
  /** Cloze ("sous-titres à trous") availability and density. */
  cloze: "none" | "light" | "medium" | "dense";
  /** Language the quiz questions/choices are written in. */
  quizLanguage: "native" | "target";
  /** Prompt fragment steering quiz difficulty and question type. */
  quizStyle: string;
  /** Prompt fragment steering the "explain what was just said" depth. */
  explanationStyle: string;
  /** French one-liner: what content to start with at this level. */
  contentTip: string;
}

export const LEVEL_PROFILES: Record<CefrLevel, LevelProfile> = {
  A1: {
    persona: "Grand débutant",
    minFrequencyRank: 1,
    maxPerSegment: 15,
    showExampleTranslationByDefault: true,
    showPhonetic: true,
    cloze: "none",
    quizLanguage: "native",
    quizStyle:
      "Very simple yes/no or single-fact recall questions. Ask in the learner's NATIVE language " +
      "about the gist of the passage. Keep every sentence short.",
    explanationStyle:
      "Explain in very simple terms, short sentences, as if to an absolute beginner. Avoid jargon.",
    contentTip: "Commence par des vidéos lentes sur des sujets du quotidien (routines, cuisine, voyages).",
  },
  A2: {
    persona: "Débutant à l'aise",
    minFrequencyRank: 1,
    maxPerSegment: 11,
    showExampleTranslationByDefault: true,
    showPhonetic: true,
    cloze: "none",
    quizLanguage: "native",
    quizStyle:
      "Simple comprehension questions about explicit facts in the passage. Ask in the learner's " +
      "NATIVE language; keep choices short and concrete.",
    explanationStyle: "Explain simply, with short sentences and everyday words.",
    contentTip: "Les vlogs, tutoriels et interviews calmes sont parfaits à ton niveau.",
  },
  B1: {
    persona: "Intermédiaire",
    minFrequencyRank: 2,
    maxPerSegment: 8,
    showExampleTranslationByDefault: true,
    showPhonetic: false,
    cloze: "light",
    quizLanguage: "target",
    quizStyle:
      "Comprehension questions IN THE TARGET LANGUAGE about what was said. One may require light " +
      "inference. Explanations in the native language.",
    explanationStyle: "Explain clearly at an intermediate level; you may keep a few key terms in the target language.",
    contentTip: "Tu peux viser des podcasts grand public et des vidéos explicatives.",
  },
  B2: {
    persona: "Avancé",
    minFrequencyRank: 3,
    maxPerSegment: 5,
    showExampleTranslationByDefault: false,
    showPhonetic: false,
    cloze: "medium",
    quizLanguage: "target",
    quizStyle:
      "Comprehension questions IN THE TARGET LANGUAGE, including nuance, tone, or the speaker's " +
      "intent — not just explicit facts. Explanations in the native language.",
    explanationStyle:
      "Explain with nuance; assume solid comprehension. Focus on subtleties, tone, and less obvious meaning.",
    contentTip: "Débats, documentaires et contenus d'opinion sont dans tes cordes.",
  },
  C1: {
    persona: "Quasi-bilingue",
    minFrequencyRank: 4,
    maxPerSegment: 3,
    showExampleTranslationByDefault: false,
    showPhonetic: false,
    cloze: "dense",
    quizLanguage: "target",
    quizStyle:
      "Questions IN THE TARGET LANGUAGE testing inference, implicit meaning, register, and idiom. " +
      "Distractors should be genuinely tempting. Explanations in the native language.",
    explanationStyle:
      "Be concise; the learner is near-fluent. Focus almost entirely on idioms, slang, register, and " +
      "cultural or implicit meaning they might miss.",
    contentTip: "Regarde ce que tu veux, y compris du contenu natif rapide et argotique.",
  },
};

export function levelProfile(level: CefrLevel): LevelProfile {
  return LEVEL_PROFILES[level];
}
