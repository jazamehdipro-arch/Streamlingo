/**
 * Pronunciation via the browser's built-in speech synthesis — free, offline,
 * no API key, exactly what the spec's "prononciation (audio)" asks for at
 * MVP quality. Voice quality varies by OS/browser but is universally "good
 * enough to hear the word once".
 */
export function speak(text: string, lang: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
