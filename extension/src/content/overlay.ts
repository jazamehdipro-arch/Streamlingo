import type { ClozeItem, KeywordCue, QuizQuestion } from "@streamlingo/shared";

export type OverlayPosition = "top-left" | "top-right";

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

  .card {
    pointer-events: auto;
    background: rgba(20, 20, 24, 0.92);
    color: #f4f4f5;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px;
    line-height: 1.4;
    box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.25s ease, transform 0.25s ease;
    cursor: pointer;
  }
  .card.visible { opacity: 1; transform: translateY(0); }
  .card .word { font-weight: 600; }
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
    background: rgba(20, 20, 24, 0.85);
    color: #d4d4d8;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
  }

  .prompt {
    pointer-events: auto;
    background: rgba(20, 20, 24, 0.92);
    color: #f4f4f5;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 6px;
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

    document.body.appendChild(this.host);
  }

  setPosition(position: OverlayPosition): void {
    this.root.className = `root pos-${position}`;
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
    const card = document.createElement("div");
    card.className = "card";

    const wordEl = document.createElement("span");
    wordEl.className = "word";
    wordEl.textContent = cue.word;
    card.appendChild(wordEl);

    const translationEl = document.createElement("span");
    translationEl.textContent = ` — ${cue.translation}`;
    card.appendChild(translationEl);

    if (isPreviouslyEncountered(cue)) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "déjà vu";
      card.appendChild(badge);
    }

    card.addEventListener("click", () => onExpand(cue));

    this.root.appendChild(card);
    requestAnimationFrame(() => card.classList.add("visible"));

    window.setTimeout(() => {
      card.classList.remove("visible");
      window.setTimeout(() => card.remove(), 300);
    }, CUE_VISIBLE_SECONDS * 1000);
  }

  showCuePopover(cue: KeywordCue, onReplay?: () => void): void {
    const { backdrop, modal } = this.buildModalShell();

    const title = document.createElement("h2");
    title.textContent = `${cue.word} — ${cue.translation}`;
    modal.appendChild(title);

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
