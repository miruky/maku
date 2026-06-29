import { parseAutoslideMs, type Deck, type Slide } from './deck';
import { renderMarkdown } from './markdown';
import { deckTitles, slideHtml, slideHtmlMapped } from './render';

export interface PresenterEls {
  stage: HTMLElement;
  progress: HTMLElement;
  counter: HTMLElement;
  notes: HTMLElement;
  next?: HTMLElement; // 発表者ノートの「次スライド」プレビュー(任意)
  step?: HTMLElement; // 発表者ノートの「ステップ k / N」表示(任意)
}

// スライドの表示・移動・段階表示・ノート・進捗を司る。描画はstageの差し替え。
export class Presenter {
  private deck: Deck = { meta: {}, slides: [] };
  private idx = 0;
  // 現在のステップ(1始まり)。step<=現在 のブロックが見える。0(ピン)は常時表示。
  private step = 1;
  // 編集中(authoring)は段階表示で隠さず全て見せる。発表/閲覧時のみ実際に段階表示する。
  private authoring = false;
  // 自動送り(キオスク)。autoOn のとき、各スライド/ステップを slideMs() 後に進める。
  private autoOn = false;
  private deckAutoMs = 0; // frontmatter autoslide(ms、0=無効)
  private loop = false; // frontmatter loop。末尾で先頭へ戻る
  private autoTimer: ReturnType<typeof setTimeout> | null = null;

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

  setDeck(deck: Deck, keepIndex = true, animate = false): void {
    this.deck = deck;
    this.deckAutoMs = parseAutoslideMs(deck.meta.autoslide ?? deck.meta.autoadvance ?? '') ?? 0;
    this.loop = /^(true|on|yes|1)$/i.test(deck.meta.loop ?? '');
    const max = Math.max(0, deck.slides.length - 1);
    this.idx = keepIndex ? Math.min(this.idx, max) : 0;
    this.step = 1;
    this.render('fwd', animate);
    this.step = this.minStep();
    this.applySteps();
  }

  // 編集中かどうか。編集中は段階表示で隠さない(全ブロックを見せて編集できるように)。
  setAuthoring(on: boolean): void {
    if (this.authoring === on) return;
    this.authoring = on;
    // 編集中は段階を進めない=stepが古い値で置き去りになる。切替時に先頭へ戻し、
    // 発表へ復帰したスライドが途中状態(全表示のまま)で始まらないようにする。
    this.step = this.minStep();
    this.applySteps();
  }

  // 現在スライドの段階表示を先頭へ戻す(発表開始時に呼ぶ。閲覧中に進めた途中状態で始めない)。
  resetSteps(): void {
    this.step = this.minStep();
    this.applySteps();
  }

  go(i: number, atEnd = false): void {
    const dir = i < this.idx ? 'back' : 'fwd';
    this.idx = Math.max(0, Math.min(this.total - 1, i));
    this.step = 1;
    this.render(dir, true);
    this.step = atEnd ? this.maxStep() : this.minStep();
    this.applySteps();
  }

  next(): void {
    // 編集中は段階表示で隠していない(全部見えている)ので、見えないステップを刻まず次スライドへ。
    if (!this.authoring && this.step < this.maxStep()) {
      this.step += 1;
      this.applySteps();
      return;
    }
    if (this.idx < this.total - 1) this.go(this.idx + 1);
  }

  prev(): void {
    if (!this.authoring && this.step > this.minStep()) {
      this.step -= 1;
      this.applySteps();
      return;
    }
    if (this.idx > 0) this.go(this.idx - 1, true);
  }

  private stepEls(): HTMLElement[] {
    return Array.from(this.els.stage.querySelectorAll<HTMLElement>('.slide-body [data-step]'));
  }

  private maxStep(): number {
    const slide = this.current();
    if (!slide || slide.reveal === 'none') return 1;
    let m = 1;
    for (const el of this.stepEls()) m = Math.max(m, Number(el.dataset.step) || 0);
    return m;
  }

  // 入場時の基準ステップ。最小の正のステップ(ピン=0は除く)。step:2 のみの構成でも空白にしない。
  private minStep(): number {
    const slide = this.current();
    if (!slide || slide.reveal === 'none') return 1;
    let m = Infinity;
    for (const el of this.stepEls()) {
      const s = Number(el.dataset.step) || 0;
      if (s > 0) m = Math.min(m, s);
    }
    return Number.isFinite(m) ? m : 1;
  }

  // step に応じて各ブロックの表示/強調を切り替える。
  // key-first では、通過済みは frag-past で静かに退き、現在のステップは frag-current で立つ。
  private applySteps(): void {
    const slide = this.current();
    // 編集中(authoring)は隠さない。発表/閲覧時のみ実際に段階表示する。
    const active = !this.authoring && !!slide && slide.reveal !== 'none';
    const keyFirst = slide?.reveal === 'key-first';
    for (const el of this.stepEls()) {
      const s = Number(el.dataset.step) || 0;
      el.classList.toggle('frag-hidden', active && s > this.step);
      el.classList.toggle('frag-current', active && s > 0 && s === this.step);
      el.classList.toggle('frag-past', active && keyFirst && s > 0 && s < this.step);
    }
    this.updateAux();
    this.scheduleAuto();
  }

  // ── 自動送り(キオスク) ──
  // 自動送りの ON/OFF。発表開始/終了時に main から呼ぶほか、'A' キーで切り替える。
  setAutoPlay(on: boolean): void {
    this.autoOn = on;
    this.scheduleAuto();
  }
  get autoPlaying(): boolean {
    return this.autoOn;
  }
  // このデッキで自動送りが設定されているか(frontmatter か、いずれかのスライドに autoslide)。
  get hasAutoAdvance(): boolean {
    return this.deckAutoMs > 0 || this.deck.slides.some((s) => (s.autoslide ?? 0) > 0);
  }

  // 現在スライドの待ち時間(ms)。個別指定が優先(0=このスライドは送らない)、無指定はデッキ既定。
  private slideMs(): number {
    const per = this.current()?.autoslide;
    return per !== undefined ? per : this.deckAutoMs;
  }

  // 次の自動送りを予約し直す。applySteps から呼ぶので、手動移動でもタイマーが再起動する。
  private scheduleAuto(): void {
    if (this.autoTimer !== null) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    if (!this.autoOn || this.authoring) return;
    const ms = this.slideMs();
    if (!(ms > 0)) return; // このスライドは自動送りしない
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      this.autoTick();
    }, ms);
  }

  // タイマー発火時の進行。スライド末尾かつデッキ末尾なら loop で先頭へ、でなければ停止。
  private autoTick(): void {
    const atSlideEnd = this.authoring || this.step >= this.maxStep();
    const atDeckEnd = this.idx >= this.total - 1;
    if (atDeckEnd && atSlideEnd) {
      if (this.loop) this.go(0);
      else this.setAutoPlay(false); // 末尾で停止(無駄打ちしない)
      return;
    }
    this.next(); // applySteps 経由で次のタイマーを予約
  }

  // 発表者ノートの補助表示(次スライドのプレビュー / 現スライドのステップ進捗)を更新する。
  private updateAux(): void {
    if (this.els.step) {
      const mx = this.maxStep();
      // このスライドでまだ段階が残るときだけ「ステップ k / N」を出す。
      this.els.step.textContent = mx > 1 ? `ステップ ${Math.min(this.step, mx)} / ${mx}` : '';
    }
    if (this.els.next) {
      const nx = this.deck.slides[this.idx + 1];
      // 次が目次スライドのときはプレビューにも目次を出す(本表示と一致させる)。
      const nxCtx = nx
        ? {
            meta: this.deck.meta,
            index: this.idx + 1,
            total: this.total,
            titles: nx.toc ? deckTitles(this.deck.slides) : undefined,
          }
        : undefined;
      this.els.next.innerHTML = nx
        ? `<div class="np-label">次のスライド (${this.idx + 2} / ${this.total})</div><div class="np-thumb">${slideHtml(nx, nxCtx)}</div>`
        : '<div class="np-label np-end">これが最後のスライドです</div>';
    }
  }

  private render(dir: 'fwd' | 'back' = 'fwd', animate = true): void {
    const slide = this.current();
    // 入場演出の種類(スライド個別 → デッキ既定 → slide)。CSS が [data-transition] で分岐する。
    const t = (slide?.transition ?? this.deck.meta.transition ?? 'slide').toLowerCase();
    this.els.stage.dataset.transition = ['none', 'fade', 'slide', 'zoom'].includes(t) ? t : 'slide';
    this.els.stage.classList.remove('enter', 'enter-back');
    if (animate) void this.els.stage.offsetWidth;
    this.els.stage.innerHTML = slide
      ? slideHtmlMapped(slide, {
          meta: this.deck.meta,
          index: this.idx,
          total: this.total,
          titles: slide.toc ? deckTitles(this.deck.slides) : undefined,
        })
      : '<div class="slide"><div class="slide-body"><p class="empty">スライドがありません</p></div></div>';
    if (animate) this.els.stage.classList.add(dir === 'back' ? 'enter-back' : 'enter');

    this.applySteps();
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
