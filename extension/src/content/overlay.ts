import type { ClozeItem, KeywordCue, QuizQuestion } from "@streamlingo/shared";

export type OverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CUE_VISIBLE_SECONDS = 4;

function isPreviouslyEncountered(cue: KeywordCue): boolean {
  return cue.previouslyEncountered === true;
}

const STYLES = `
  :host { all: initial; }
  .root {
    position: fixed;
    top: 16px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 320px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    pointer-events: none;
  }
  .root.pos-top-left { left: 16px; align-items: flex-start; }
  .root.pos-top-right { right: 16px; align-items: flex-end; }
  .root.pos-bottom-left { top: auto; bottom: 80px; left: 16px; align-items: flex-start; flex-direction: column-reverse; }
  .root.pos-bottom-right { top: auto; bottom: 80px; right: 16px; align-items: flex-end; flex-direction: column-reverse; }

  .header {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(16, 16, 20, 0.82);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 999px;
    padding: 5px 10px;
    font-size: 12px;
    color: #e4e4e7;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  .header .brand {
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .header .brand .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: #818cf8;
    color: #0f0f13;
    border-radius: 5px;
    font-size: 9px;
  }
  .header .counter {
    background: rgba(129, 140, 248, 0.18);
    color: #c7d2fe;
    border: none;
    border-radius: 999px;
    padding: 2px 9px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .header .counter:hover { background: rgba(129, 140, 248, 0.32); }
  .header .toggle {
    background: none;
    border: none;
    color: #a1a1aa;
    cursor: pointer;
    font-size: 13px;
    padding: 0 2px;
    line-height: 1;
  }
  .header .toggle:hover { color: #f4f4f5; }

  .session-panel {
    pointer-events: auto;
    background: rgba(16, 16, 20, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 10px;
    max-height: 300px;
    overflow-y: auto;
    width: 280px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .session-panel .panel-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #a1a1aa;
    margin: 2px 4px 8px;
  }
  .session-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px;
    border-radius: 8px;
    font-size: 13px;
    color: #f4f4f5;
    cursor: pointer;
  }
  .session-row:hover { background: rgba(255,255,255,0.06); }
  .session-row .w { font-weight: 600; }
  .session-row .t { color: #c7d2fe; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-row .speak {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    opacity: 0.7;
  }
  .session-row .speak:hover { opacity: 1; }

  .recap-word {
    display: inline-block;
    background: rgba(129, 140, 248, 0.15);
    border: 1px solid rgba(129, 140, 248, 0.35);
    color: #e0e7ff;
    border-radius: 999px;
    padding: 3px 10px;
    margin: 3px 4px 3px 0;
    font-size: 12px;
    cursor: pointer;
  }
  .recap-word:hover { background: rgba(129, 140, 248, 0.3); }

  .card {
    pointer-events: auto;
    background: rgba(16, 16, 20, 0.82);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: #f4f4f5;
    border: 1px solid rgba(255,255,255,0.08);
    border-left: 3px solid #818cf8;
    border-radius: 12px;
    padding: 9px 13px;
    font-size: 13px;
    line-height: 1.45;
    box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
    transition: opacity 0.3s cubic-bezier(0.2, 0.7, 0.3, 1), transform 0.3s cubic-bezier(0.2, 0.7, 0.3, 1);
    cursor: pointer;
  }
  .card:hover { border-left-color: #c7d2fe; background: rgba(28, 28, 34, 0.9); }
  .card.visible { opacity: 1; transform: translateY(0) scale(1); }
  .card .word { font-weight: 700; letter-spacing: 0.01em; }
  .card .translation { color: #c7d2fe; }
  .card .badge {
    display: inline-block;
    margin-left: 6px;
    font-size: 10px;
    background: #6366f1;
    color: white;
    border-radius: 999px;
    padding: 1px 6px;
    vertical-align: middle;
  }

  .notice {
    pointer-events: auto;
    background: rgba(16, 16, 20, 0.82);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.08);
    color: #d4d4d8;
    border-radius: 10px;
    padding: 7px 11px;
    font-size: 12px;
  }

  .prompt {
    pointer-events: auto;
    background: rgba(16, 16, 20, 0.88);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.08);
    color: #f4f4f5;
    border-radius: 12px;
    padding: 11px 13px;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  }
  .prompt .actions { display: flex; gap: 8px; }
  button.sl-btn {
    pointer-events: auto;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  button.sl-btn.secondary { background: transparent; border: 1px solid #52525b; }
  button.sl-btn:hover { filter: brightness(1.1); }

  .overlay-backdrop {
    pointer-events: auto;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .modal {
    background: #18181b;
    color: #f4f4f5;
    border-radius: 12px;
    padding: 20px;
    width: min(480px, 92vw);
    max-height: 80vh;
    overflow-y: auto;
  }
  .modal h2 { margin: 0 0 12px; font-size: 16px; }
  .modal p { font-size: 13px; line-height: 1.5; }
  .modal .close-row { display: flex; justify-content: flex-end; margin-top: 14px; }
  .quiz-question { margin-bottom: 16px; }
  .quiz-choice {
    display: block;
    width: 100%;
    text-align: left;
    background: #27272a;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    padding: 8px 10px;
    margin-top: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  .quiz-choice:hover { background: #3f3f46; }
  .quiz-choice.correct { border-color: #22c55e; }
  .quiz-choice.incorrect { border-color: #ef4444; }
  .quiz-explanation { font-size: 12px; color: #a1a1aa; margin-top: 6px; }

  .cloze-panel {
    pointer-events: auto;
    background: rgba(20, 20, 24, 0.95);
    color: #f4f4f5;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
    line-height: 1.6;
  }
  .cloze-blank {
    display: inline-block;
    min-width: 34px;
    border-bottom: 2px solid #6366f1;
    text-align: center;
    cursor: pointer;
    margin: 0 2px;
  }
  .cloze-blank.revealed { border-bottom-color: #52525b; color: #a1a1aa; }
`;

export class Overlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private root: HTMLDivElement;
  private noticeEl: HTMLDivElement | null = null;
  private promptEl: HTMLDivElement | null = null;
  private clozePanelEl: HTMLDivElement | null = null;
  private modalBackdrop: HTMLDivElement | null = null;
  private language: string | null = null;
  private headerEl: HTMLDivElement;
  private counterBtn: HTMLButtonElement;
  private toggleBtn: HTMLButtonElement;
  private sessionPanelEl: HTMLDivElement | null = null;
  private sessionWords: KeywordCue[] = [];
  private enabled = true;
  private onModalClose: (() => void) | null = null;
  private onWordExpand: ((cue: KeywordCue) => void) | null = null;

  constructor(position: OverlayPosition) {
    this.host = document.createElement("div");
    this.host.id = "streamlingo-overlay-host";
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    this.shadow.appendChild(style);

    this.root = document.createElement("div");
    this.root.className = `root pos-${position}`;
    this.shadow.appendChild(this.root);

    this.headerEl = document.createElement("div");
    this.headerEl.className = "header";
    const brand = document.createElement("span");
    brand.className = "brand";
    brand.innerHTML = '<span class="logo">\u25b6</span>StreamLingo';
    this.headerEl.appendChild(brand);

    this.counterBtn = document.createElement("button");
    this.counterBtn.className = "counter";
    this.counterBtn.textContent = "0 mot";
    this.counterBtn.title = "Voir les mots de cette session";
    this.counterBtn.addEventListener("click", () => this.toggleSessionPanel());
    this.headerEl.appendChild(this.counterBtn);

    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "toggle";
    this.toggleBtn.textContent = "\ud83d\udc41";
    this.toggleBtn.title = "Activer / d\u00e9sactiver l'overlay pour cette vid\u00e9o";
    this.toggleBtn.addEventListener("click", () => this.setEnabled(!this.enabled));
    this.headerEl.appendChild(this.toggleBtn);

    this.root.appendChild(this.headerEl);

    document.body.appendChild(this.host);
  }

  /** Registered by the content script so session-panel and recap word chips reuse the same popover. */
  setWordExpandHandler(handler: (cue: KeywordCue) => void): void {
    this.onWordExpand = handler;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.toggleBtn.textContent = enabled ? "\ud83d\udc41" : "\ud83d\ude48";
    this.toggleBtn.style.opacity = enabled ? "1" : "0.5";
    if (!enabled) {
      for (const card of Array.from(this.root.querySelectorAll(".card"))) card.remove();
      this.hideSessionPanel();
    }
  }

  getSessionWords(): KeywordCue[] {
    return [...this.sessionWords];
  }

  private speakWord(word: string): void {
    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = this.language ?? "en";
    utterance.rate = 0.9;
    window.speechSynthesis?.speak(utterance);
  }

  private toggleSessionPanel(): void {
    if (this.sessionPanelEl) {
      this.hideSessionPanel();
      return;
    }
    const panel = document.createElement("div");
    panel.className = "session-panel";
    const title = document.createElement("p");
    title.className = "panel-title";
    title.textContent = `Mots de cette session (${this.sessionWords.length})`;
    panel.appendChild(title);

    if (this.sessionWords.length === 0) {
      const empty = document.createElement("p");
      empty.style.cssText = "font-size:12px;color:#a1a1aa;margin:4px;";
      empty.textContent = "Aucun mot pour l'instant \u2014 laisse la vid\u00e9o tourner.";
      panel.appendChild(empty);
    }

    for (const cue of [...this.sessionWords].reverse()) {
      const row = document.createElement("div");
      row.className = "session-row";
      const w = document.createElement("span");
      w.className = "w";
      w.textContent = cue.word;
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = `\u2014 ${cue.translation}`;
      const speak = document.createElement("button");
      speak.className = "speak";
      speak.textContent = "\ud83d\udd0a";
      speak.addEventListener("click", (e) => {
        e.stopPropagation();
        this.speakWord(cue.word);
      });
      row.append(w, t, speak);
      row.addEventListener("click", () => this.onWordExpand?.(cue));
      panel.appendChild(row);
    }

    this.sessionPanelEl = panel;
    this.root.appendChild(panel);
  }

  private hideSessionPanel(): void {
    this.sessionPanelEl?.remove();
    this.sessionPanelEl = null;
  }

  /** End-of-video recap: every word encountered, clickable chips, per spec's "after the video" moment. */
  showRecap(): void {
    if (this.sessionWords.length === 0) return;
    const { backdrop, modal } = this.buildModalShell();

    const title = document.createElement("h2");
    title.textContent = `\ud83c\udfac Vid\u00e9o termin\u00e9e \u2014 ${this.sessionWords.length} mot${this.sessionWords.length > 1 ? "s" : ""} rencontr\u00e9${this.sessionWords.length > 1 ? "s" : ""}`;
    modal.appendChild(title);

    const intro = document.createElement("p");
    intro.style.color = "#a1a1aa";
    intro.textContent = "Ils sont d\u00e9j\u00e0 dans ta banque de vocabulaire. Clique un mot pour le revoir, ou r\u00e9vise-les en flashcards sur le site.";
    modal.appendChild(intro);

    const cloud = document.createElement("div");
    cloud.style.margin = "12px 0";
    for (const cue of this.sessionWords) {
      const chip = document.createElement("button");
      chip.className = "recap-word";
      chip.textContent = cue.word;
      chip.title = cue.translation;
      chip.addEventListener("click", () => this.onWordExpand?.(cue));
      cloud.appendChild(chip);
    }
    modal.appendChild(cloud);

    const closeRow = document.createElement("div");
    closeRow.className = "close-row";
    const closeBtn = document.createElement("button");
    closeBtn.className = "sl-btn";
    closeBtn.textContent = "Fermer";
    closeBtn.addEventListener("click", () => this.closeModal());
    closeRow.appendChild(closeBtn);
    modal.appendChild(closeRow);

    this.mountModal(backdrop);
  }

  setPosition(position: OverlayPosition): void {
    this.root.className = `root pos-${position}`;
  }

  /** BCP-47 code of the learner's target language, used for pronunciation TTS. */
  setLanguage(lang: string): void {
    this.language = lang;
  }

  showNotice(text: string, timeoutMs = 6000): void {
    this.noticeEl?.remove();
    const el = document.createElement("div");
    el.className = "notice";
    el.textContent = text;
    this.noticeEl = el;
    this.root.prepend(el);
    if (timeoutMs > 0) {
      window.setTimeout(() => el.remove(), timeoutMs);
    }
  }

  showCue(cue: KeywordCue, onExpand: (cue: KeywordCue) => void): void {
    if (!this.sessionWords.some((w) => w.lemma === cue.lemma)) {
      this.sessionWords.push(cue);
      const n = this.sessionWords.length;
      this.counterBtn.textContent = `${n} mot${n > 1 ? "s" : ""}`;
    }
    if (!this.enabled) return;
    const card = document.createElement("div");
    card.className = "card";

    const wordEl = document.createElement("span");
    wordEl.className = "word";
    wordEl.textContent = cue.word;
    card.appendChild(wordEl);

    const translationEl = document.createElement("span");
    translationEl.className = "translation";
    translationEl.textContent = ` — ${cue.translation}`;
    card.appendChild(translationEl);

    if (isPreviouslyEncountered(cue)) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "déjà vu";
      card.appendChild(badge);
    }

    card.addEventListener("click", () => onExpand(cue));

    const existing = Array.from(this.root.querySelectorAll(".card"));
    for (const old of existing.slice(0, Math.max(0, existing.length - 3))) {
      old.classList.remove("visible");
      window.setTimeout(() => old.remove(), 300);
    }
    this.root.appendChild(card);
    requestAnimationFrame(() => card.classList.add("visible"));

    window.setTimeout(() => {
      card.classList.remove("visible");
      window.setTimeout(() => card.remove(), 300);
    }, CUE_VISIBLE_SECONDS * 1000);
  }

  showCuePopover(cue: KeywordCue, onReplay?: () => void): void {
    const { backdrop, modal } = this.buildModalShell();

    const titleRow = document.createElement("div");
    titleRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:12px;";
    const title = document.createElement("h2");
    title.style.margin = "0";
    title.textContent = `${cue.word} — ${cue.translation}`;
    titleRow.appendChild(title);
    const speakBtn = document.createElement("button");
    speakBtn.className = "sl-btn secondary";
    speakBtn.textContent = "🔊";
    speakBtn.title = "Écouter la prononciation";
    speakBtn.addEventListener("click", () => this.speakWord(cue.word));
    titleRow.appendChild(speakBtn);
    modal.appendChild(titleRow);

    if (cue.phonetic) {
      const phon = document.createElement("p");
      phon.textContent = cue.phonetic;
      modal.appendChild(phon);
    }

    const example = document.createElement("p");
    example.textContent = cue.exampleSentence;
    modal.appendChild(example);

    const exampleTranslation = document.createElement("p");
    exampleTranslation.textContent = cue.exampleTranslation;
    exampleTranslation.style.color = "#a1a1aa";
    modal.appendChild(exampleTranslation);

    const closeRow = document.createElement("div");
    closeRow.className = "close-row";

    if (onReplay) {
      const replayBtn = document.createElement("button");
      replayBtn.className = "sl-btn secondary";
      replayBtn.textContent = "Réécouter ce passage";
      replayBtn.addEventListener("click", onReplay);
      closeRow.appendChild(replayBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "sl-btn";
    closeBtn.textContent = "Fermer";
    closeBtn.addEventListener("click", () => this.closeModal());
    closeRow.appendChild(closeBtn);

    modal.appendChild(closeRow);
    this.mountModal(backdrop);
  }

  showSegmentPrompt(options: { offerCloze: boolean; onQuiz: () => void; onCloze: () => void; onDismiss: () => void }): void {
    this.promptEl?.remove();
    const el = document.createElement("div");
    el.className = "prompt";

    const text = document.createElement("span");
    text.textContent = "Se tester sur ce passage ?";
    el.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "actions";

    const quizBtn = document.createElement("button");
    quizBtn.className = "sl-btn";
    quizBtn.textContent = "Quiz";
    quizBtn.addEventListener("click", () => {
      options.onQuiz();
      this.hideSegmentPrompt();
    });
    actions.appendChild(quizBtn);

    if (options.offerCloze) {
      const clozeBtn = document.createElement("button");
      clozeBtn.className = "sl-btn secondary";
      clozeBtn.textContent = "Sous-titres à trous";
      clozeBtn.addEventListener("click", () => {
        options.onCloze();
        this.hideSegmentPrompt();
      });
      actions.appendChild(clozeBtn);
    }

    const dismissBtn = document.createElement("button");
    dismissBtn.className = "sl-btn secondary";
    dismissBtn.textContent = "Non merci";
    dismissBtn.addEventListener("click", () => {
      options.onDismiss();
      this.hideSegmentPrompt();
    });
    actions.appendChild(dismissBtn);

    el.appendChild(actions);
    this.promptEl = el;
    this.root.appendChild(el);
  }

  hideSegmentPrompt(): void {
    this.promptEl?.remove();
    this.promptEl = null;
  }

  showClozePanel(item: ClozeItem, onRevealed?: (position: number) => void): void {
    this.hideClozePanel();
    const el = document.createElement("div");
    el.className = "cloze-panel";

    const answerByPosition = new Map(item.answers.map((a) => [a.position, a.word]));
    const parts = item.transcriptWithBlanks.split("___");

    parts.forEach((part, i) => {
      el.appendChild(document.createTextNode(part));
      if (i < parts.length - 1) {
        const blank = document.createElement("span");
        blank.className = "cloze-blank";
        blank.textContent = "___";
        blank.addEventListener("click", () => {
          const word = answerByPosition.get(i);
          if (!word) return;
          blank.textContent = word;
          blank.classList.add("revealed");
          onRevealed?.(i);
        });
        el.appendChild(blank);
      }
    });

    this.clozePanelEl = el;
    this.root.appendChild(el);
  }

  hideClozePanel(): void {
    this.clozePanelEl?.remove();
    this.clozePanelEl = null;
  }

  showQuizModal(
    questions: QuizQuestion[],
    onAnswer: (questionId: string, chosenIndex: number) => Promise<{ isCorrect: boolean; explanation: string }>
  ): void {
    const { backdrop, modal } = this.buildModalShell();

    const title = document.createElement("h2");
    title.textContent = "Quiz de compréhension";
    modal.appendChild(title);

    for (const question of questions) {
      const block = document.createElement("div");
      block.className = "quiz-question";

      const q = document.createElement("p");
      q.textContent = question.question;
      block.appendChild(q);

      const explanation = document.createElement("div");
      explanation.className = "quiz-explanation";

      question.choices.forEach((choice, index) => {
        const btn = document.createElement("button");
        btn.className = "quiz-choice";
        btn.textContent = choice;
        btn.addEventListener("click", async () => {
          const buttons = block.querySelectorAll<HTMLButtonElement>(".quiz-choice");
          buttons.forEach((b) => (b.disabled = true));
          const result = await onAnswer(question.id, index);
          btn.classList.add(result.isCorrect ? "correct" : "incorrect");
          explanation.textContent = result.explanation;
        });
        block.appendChild(btn);
      });

      block.appendChild(explanation);
      modal.appendChild(block);
    }

    const closeRow = document.createElement("div");
    closeRow.className = "close-row";
    const closeBtn = document.createElement("button");
    closeBtn.className = "sl-btn";
    closeBtn.textContent = "Fermer";
    closeBtn.addEventListener("click", () => this.closeModal());
    closeRow.appendChild(closeBtn);
    modal.appendChild(closeRow);

    this.mountModal(backdrop);
  }

  showReplayModal(transcript: string, translation: string, onSeekBack: () => void): void {
    const { backdrop, modal } = this.buildModalShell();

    const title = document.createElement("h2");
    title.textContent = "Réécoute active";
    modal.appendChild(title);

    const transcriptEl = document.createElement("p");
    transcriptEl.textContent = transcript;
    modal.appendChild(transcriptEl);

    const translationEl = document.createElement("p");
    translationEl.textContent = translation;
    translationEl.style.color = "#a1a1aa";
    modal.appendChild(translationEl);

    const closeRow = document.createElement("div");
    closeRow.className = "close-row";

    const seekBtn = document.createElement("button");
    seekBtn.className = "sl-btn secondary";
    seekBtn.textContent = "Revenir à ce passage";
    seekBtn.addEventListener("click", () => {
      onSeekBack();
      this.closeModal();
    });
    closeRow.appendChild(seekBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sl-btn";
    closeBtn.textContent = "Fermer";
    closeBtn.addEventListener("click", () => this.closeModal());
    closeRow.appendChild(closeBtn);

    modal.appendChild(closeRow);
    this.mountModal(backdrop);
  }

  closeModal(): void {
    this.modalBackdrop?.remove();
    this.modalBackdrop = null;
    const cb = this.onModalClose;
    this.onModalClose = null;
    cb?.();
  }

  /** Invoked once when the currently-open modal closes (any path: button, backdrop). */
  setModalCloseListener(cb: () => void): void {
    this.onModalClose = cb;
  }

  private buildModalShell(): { backdrop: HTMLDivElement; modal: HTMLDivElement } {
    this.closeModal();
    const backdrop = document.createElement("div");
    backdrop.className = "overlay-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) this.closeModal();
    });

    const modal = document.createElement("div");
    modal.className = "modal";
    backdrop.appendChild(modal);
    return { backdrop, modal };
  }

  private mountModal(backdrop: HTMLDivElement): void {
    this.modalBackdrop = backdrop;
    this.shadow.appendChild(backdrop);
  }
}
