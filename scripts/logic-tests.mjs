// Dependency-free smoke tests for the pure logic that the product's
// correctness hangs on: keyword timing, SM-2 scheduling, level filtering.
// Bundles the TS sources with esbuild (hoisted from the extension workspace)
// then asserts against the compiled output — no test framework needed.
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = path.dirname(new URL(".", import.meta.url).pathname);
const outDir = await mkdtemp(path.join(tmpdir(), "streamlingo-tests-"));

async function bundle(entry, name) {
  const outfile = path.join(outDir, `${name}.mjs`);
  await build({ entryPoints: [path.join(root, entry)], bundle: true, format: "esm", outfile, logLevel: "silent" });
  return import(pathToFileURL(outfile).href);
}

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL  ${label}: ${err.message}`);
  }
}

// ---- wordTiming ----
{
  const { estimateWordTimings } = await bundle("apps/web/src/lib/wordTiming.ts", "wordTiming");
  const cues = [
    { text: "Bonjour et bienvenue dans la boulangerie", startSeconds: 10, durSeconds: 4 },
    { text: "où nous allons pétrir la pâte ensemble", startSeconds: 14, durSeconds: 5 },
    { text: "avant de déguster un croissant chaud", startSeconds: 19, durSeconds: 4 },
  ];
  const transcript = cues.map((c) => c.text).join(" ");
  const kw = (word) => ({ word, lemma: word, translation: "x", exampleSentence: "x", exampleTranslation: "x", phonetic: null, frequencyRank: 2 });
  const within = (k, lo, hi) => k.startSeconds >= lo && k.startSeconds <= hi;

  console.log("wordTiming:");
  check("keywords anchor to their containing cue", () => {
    const [a, b, c] = estimateWordTimings(transcript, 10, 23, [kw("boulangerie"), kw("pétrir"), kw("croissant")], cues);
    assert.ok(within(a, 10, 14) && within(b, 14, 19) && within(c, 19, 23));
  });
  check("out-of-order keywords wrap back to earlier cues", () => {
    const [c, a] = estimateWordTimings(transcript, 10, 23, [kw("croissant"), kw("bonjour")], cues);
    assert.ok(within(c, 19, 23) && within(a, 10, 14));
  });
  check("repeated word advances to the next cue", () => {
    const cues2 = [
      { text: "le chat dort", startSeconds: 0, durSeconds: 3 },
      { text: "et le chat mange", startSeconds: 3, durSeconds: 3 },
    ];
    const [first, second] = estimateWordTimings("le chat dort et le chat mange", 0, 6, [kw("chat"), kw("chat")], cues2);
    assert.ok(first.startSeconds < 3 && second.startSeconds >= 3);
  });
  check("no cues falls back to segment-linear interpolation", () => {
    const [k] = estimateWordTimings(transcript, 10, 23, [kw("croissant")]);
    assert.ok(within(k, 10, 23));
  });
  check("keyword missing from cues does not crash", () => {
    const [k] = estimateWordTimings(transcript, 10, 23, [kw("fantôme")], cues);
    assert.ok(within(k, 10, 23));
  });
  check("overlapping ASR cue durations don't push timing past the next cue", () => {
    const overlapping = [
      { text: "the quick brown fox", startSeconds: 0, durSeconds: 6 },
      { text: "jumps over the lazy dog", startSeconds: 2, durSeconds: 6 },
    ];
    const [k] = estimateWordTimings("the quick brown fox jumps over the lazy dog", 0, 8, [kw("fox")], overlapping);
    assert.ok(k.startSeconds < 2, `fox timed at ${k.startSeconds}, expected before next cue at 2s`);
  });
}

// ---- SM-2 ----
{
  const { createInitialSrsState, reviewSrsState, isDue } = await bundle("packages/shared/src/srs.ts", "srs");
  const now = new Date("2026-01-01T00:00:00Z");
  const day = (n) => new Date(now.getTime() + n * 86400000);

  console.log("srs (SM-2):");
  check("new item is due immediately", () => {
    assert.ok(isDue(createInitialSrsState("v1"), new Date()));
  });
  check("good reviews follow the 1d, 6d, then EF-scaled ladder", () => {
    let s = createInitialSrsState("v1");
    s = reviewSrsState(s, 4, now);
    assert.equal(s.intervalDays, 1);
    s = reviewSrsState(s, 4, day(1));
    assert.equal(s.intervalDays, 6);
    s = reviewSrsState(s, 4, day(7));
    assert.ok(s.intervalDays > 6);
  });
  check("a failed review resets the streak and re-queues today", () => {
    let s = createInitialSrsState("v1");
    s = reviewSrsState(s, 4, now);
    s = reviewSrsState(s, 4, day(1));
    s = reviewSrsState(s, 1, day(7));
    assert.equal(s.repetitions, 0);
    assert.equal(s.intervalDays, 0);
    assert.ok(isDue(s, day(7)));
  });
  check("ease factor never drops below 1.3", () => {
    let s = createInitialSrsState("v1");
    for (let i = 0; i < 10; i++) s = reviewSrsState(s, 0, day(i));
    assert.ok(s.easeFactor >= 1.3);
  });
}

// ---- level filter ----
{
  const { filterKeywordsForLevel } = await bundle("packages/shared/src/levelFilter.ts", "levelFilter");
  const cue = (rank, t) => ({ word: `w${rank}${t}`, lemma: `w${rank}${t}`, translation: "x", exampleSentence: "x", exampleTranslation: "x", phonetic: null, startSeconds: t, frequencyRank: rank });

  console.log("levelFilter:");
  check("C1 sees only the rarest words", () => {
    const cues = [cue(1, 1), cue(2, 2), cue(3, 3), cue(4, 4)];
    const out = filterKeywordsForLevel(cues, "C1");
    assert.ok(out.every((c) => c.frequencyRank === 4));
  });
  check("A2 sees far more than B2", () => {
    const cues = Array.from({ length: 20 }, (_, i) => cue((i % 4) + 1, i));
    assert.ok(filterKeywordsForLevel(cues, "A2").length > filterKeywordsForLevel(cues, "B2").length);
  });
  check("output stays in chronological order after capping", () => {
    const cues = Array.from({ length: 20 }, (_, i) => cue((i % 4) + 1, i));
    const out = filterKeywordsForLevel(cues, "A2");
    const sorted = [...out].sort((a, b) => a.startSeconds - b.startSeconds);
    assert.deepEqual(out, sorted);
  });
}

await rm(outDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll logic tests passed");
