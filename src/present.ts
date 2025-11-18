import type { Deck, Slide } from './deck';
import { renderMarkdown } from './markdown';
import { slideHtmlMapped } from './render';

export interface PresenterEls {
  stage: HTMLElement;
  progress: HTMLElement;
  counter: HTMLElement;
  notes: HTMLElement;
}

// スライドの表示・移動・段階表示・ノート・進捗を司る。描画はstageの差し替え。
export class Presenter {
  private deck: Deck = { meta: {}, slides: [] };
  private idx = 0;
  private frag = 0;

  constructor(
    private readonly els: PresenterEls,
    private readonly onChange?: (index: number) => void,
    private readonly onAfterRender?: () => void,
  ) {}

  get index(): number {
    return this.idx;
  }
  get total(): number {
    return this.deck.slides.length;
  }
  current(): Slide | undefined {
    return this.deck.slides[this.idx];
  }

  setDeck(deck: Deck, keepIndex = true): void {
    this.deck = deck;
    const max = Math.max(0, deck.slides.length - 1);
    this.idx = keepIndex ? Math.min(this.idx, max) : 0;
    this.frag = 0;
    this.render();
  }

  go(i: number, atEnd = false): void {
    this.idx = Math.max(0, Math.min(this.total - 1, i));
    this.render();
    this.frag = atEnd ? this.maxFrag() : 0;
    this.applyFrags();
  }

  next(): void {
    if (this.frag < this.maxFrag()) {
      this.frag += 1;
      this.applyFrags();
      return;
    }
    if (this.idx < this.total - 1) this.go(this.idx + 1);
  }

  prev(): void {
    if (this.frag > 0) {
      this.frag -= 1;
      this.applyFrags();
      return;
    }
    if (this.idx > 0) this.go(this.idx - 1, true);
  }

  private maxFrag(): number {
    const slide = this.current();
    if (!slide?.incremental) return 0;
    const body = this.els.stage.querySelector('.slide-body');
    return body ? Math.max(0, body.children.length - 1) : 0;
  }

  private applyFrags(): void {
    const slide = this.current();
    const body = this.els.stage.querySelector('.slide-body');
    if (!body) return;
    Array.from(body.children).forEach((el, i) => {
      el.classList.toggle('frag-hidden', !!slide?.incremental && i > this.frag);
    });
  }

  private render(): void {
    const slide = this.current();
    this.els.stage.classList.remove('enter');
    void this.els.stage.offsetWidth;
    this.els.stage.innerHTML = slide
      ? slideHtmlMapped(slide)
      : '<div class="slide"><div class="slide-body"><p class="empty">スライドがありません</p></div></div>';
    this.els.stage.classList.add('enter');

    this.applyFrags();
    const pct = this.total ? ((this.idx + 1) / this.total) * 100 : 0;
    this.els.progress.style.width = `${pct}%`;
    this.els.counter.textContent = `${this.total ? this.idx + 1 : 0} / ${this.total}`;
    this.els.notes.innerHTML = slide?.notes
      ? renderMarkdown(slide.notes)
      : '<p class="notes-empty">このスライドにノートはありません</p>';
    this.onChange?.(this.idx);
    this.onAfterRender?.();
  }
}
