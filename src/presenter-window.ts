// 発表者コンソール(別ウィンドウ)。本体と同じ純粋コア(parseDeck / render / themes / math / mermaid)を
// 再利用し、現在スライド・次スライド・ノート・経過時間・進捗を一画面で見せる。本文・テーマ・位置は
// BroadcastChannel 経由で本体から受け取る(本体が唯一の状態保持者)。チャンネルを真実とし、起動直後の
// 初期表示だけ localStorage を読む。前へ/次へは本体へコマンドとして送る。サーバ無し・実行時依存ゼロ。
import './style.css';
import { deckRatio, parseDeck, type Deck } from './deck';
import { fitSlideBody } from './fit';
import { renderMarkdown } from './markdown';
import { hasPendingMath, typesetMath } from './math';
import { hasPendingMermaid, typesetMermaid } from './mermaid';
import { hasPendingQr, typesetQr } from './qr';
import { applyOverlay, loadOverlay, slideOverlay } from './overlay';
import { deckTitles, slideHtml, slideHtmlMapped } from './render';
import { openSync, type SyncMsg } from './sync';
import { applyTheme, themeById, themeOverrides } from './themes';

const MD_KEY = 'maku.md';
const THEME_KEY = 'maku.theme';

const root = document.getElementById('pv')!;
root.innerHTML = `
  <div class="pv-app">
    <div class="pv-banner" id="pv-banner" hidden>このブラウザは同期に未対応です。操作・更新は本体ウィンドウで行ってください。</div>
    <div class="pv-main">
      <section class="pv-now">
        <div class="pv-label">現在のスライド</div>
        <div class="deck-root pv-deck" id="pv-cur"><div class="stage"></div></div>
      </section>
      <aside class="pv-side">
        <div class="pv-clockrow">
          <span class="pv-timer" id="pv-timer">00:00</span>
          <span class="pv-clock" id="pv-clock">--:--</span>
          <button class="pv-mini" id="pv-reset">タイマー0</button>
        </div>
        <div class="pv-label" id="pv-next-label">次のスライド</div>
        <div class="deck-root pv-deck pv-deck-next" id="pv-next"><div class="stage"></div></div>
        <div class="pv-label">ノート</div>
        <div class="pv-notes" id="pv-notes"></div>
      </aside>
    </div>
    <footer class="pv-bar">
      <button class="pv-btn" id="pv-prev" aria-label="前へ">◀ 前へ</button>
      <span class="pv-pos" id="pv-pos">0 / 0</span>
      <span class="pv-step" id="pv-step"></span>
      <button class="pv-btn" id="pv-next-btn" aria-label="次へ">次へ ▶</button>
    </footer>
  </div>`;

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const curHost = $('pv-cur');
const nextHost = $('pv-next');
const notesEl = $('pv-notes');
const posEl = $('pv-pos');
const stepEl = $('pv-step');
const nextLabel = $('pv-next-label');

let deck: Deck = { meta: {}, slides: [] };
let index = 0;
let step = 1;
let total = 0;
let startMs = Date.now();

// 本文(md)とテーマ id からデッキを構築し、両プレビューにテーマと縦横比を適用する。
function applyDeck(md: string, themeId: string): void {
  deck = parseDeck(md);
  total = deck.slides.length;
  const theme = themeById(themeId);
  const { w, h } = deckRatio(deck.meta);
  const ov = themeOverrides(deck.meta);
  for (const host of [curHost, nextHost]) {
    applyTheme(host, theme);
    host.style.setProperty('--deck-ar', `${w} / ${h}`);
    host.style.setProperty('--deck-ar-num', String(w / h));
    for (const [k, v] of Object.entries(ov)) host.style.setProperty(k, v);
  }
}

// 起動直後の初期表示。チャンネルの 'deck' が来たら上書きされる。
function bootstrapFromStorage(): void {
  try {
    applyDeck(localStorage.getItem(MD_KEY) ?? '', localStorage.getItem(THEME_KEY) ?? '');
  } catch {
    applyDeck('', '');
  }
}

// 1枚のプレビューを描画する。current は段階表示の data-step を含む slideHtmlMapped を使い、
// コピーUIを外し、自由配置(図形/画像)を本体と同じ overlay で重ね、はみ出しは縮小する。
function renderPreview(
  host: HTMLElement,
  slide: Deck['slides'][number] | undefined,
  idx: number,
  mapped: boolean,
): void {
  const stage = host.querySelector<HTMLElement>('.stage')!;
  if (!slide) {
    stage.innerHTML = '<div class="slide"><div class="slide-body"></div></div>';
    return;
  }
  const ctx = {
    meta: deck.meta,
    index: idx,
    total,
    titles: slide.toc ? deckTitles(deck.slides) : undefined,
  };
  stage.innerHTML = mapped ? slideHtmlMapped(slide, ctx) : slideHtml(slide, ctx);
  stage.querySelectorAll('.code-copy').forEach((b) => b.remove());
  const slideEl = stage.querySelector<HTMLElement>('.slide');
  if (slideEl) {
    applyOverlay(slideEl, slideOverlay(loadOverlay(), slide.id ?? ''));
    fitSlideBody(slideEl);
  }
  const refit = (): void => {
    if (slideEl) fitSlideBody(slideEl);
  };
  if (hasPendingMath(stage)) void typesetMath(stage).then(refit);
  if (hasPendingMermaid(stage)) void typesetMermaid(stage).then(refit);
  if (hasPendingQr(stage)) void typesetQr(stage).then(refit);
}

function render(): void {
  const cur = deck.slides[index];
  const nx = deck.slides[index + 1];
  renderPreview(curHost, cur, index, true);
  nextHost.hidden = !nx; // 描画前に切り替え、隠れた状態で fit を計測しない(最後のスライドで空枠も出さない)
  renderPreview(nextHost, nx, index + 1, false);
  nextLabel.textContent = nx ? `次のスライド (${index + 2} / ${total})` : 'これが最後のスライドです';
  notesEl.innerHTML = cur?.notes
    ? renderMarkdown(cur.notes)
    : '<p class="notes-empty">このスライドにノートはありません</p>';
  posEl.textContent = `${total ? index + 1 : 0} / ${total}`;
  // 現在スライドの最大ステップを描画後の data-step から数え、進捗を表示する。
  let mx = 1;
  curHost.querySelectorAll<HTMLElement>('.slide-body [data-step]').forEach((el) => {
    mx = Math.max(mx, Number(el.dataset.step) || 0);
  });
  stepEl.textContent = mx > 1 ? `ステップ ${Math.min(step, mx)} / ${mx}` : '';
}

// ── 本体との同期 ──
const ch = openSync();
if (ch) {
  ch.onmessage = (e: MessageEvent<SyncMsg>): void => {
    const m = e.data;
    if (m.t === 'state') {
      // 受信値は信頼せず範囲・整数性を検査してから使う(壊れた表示を防ぐ)。
      total = Math.max(0, Math.trunc(m.total) || 0);
      index = Number.isFinite(m.index)
        ? Math.min(Math.max(0, Math.trunc(m.index)), Math.max(0, total - 1))
        : 0;
      step = Number.isFinite(m.step) ? Math.max(1, Math.trunc(m.step)) : 1;
      render();
    } else if (m.t === 'deck') {
      applyDeck(m.md, m.theme);
      render();
    }
  };
  ch.postMessage({ t: 'hello' } satisfies SyncMsg);
} else {
  $('pv-banner').hidden = false; // 同期不可を明示(操作が無反応に見えるのを防ぐ)
}
const send = (msg: SyncMsg): void => ch?.postMessage(msg);

// ── 操作(本体へコマンド送信) ──
$('pv-prev').addEventListener('click', () => send({ t: 'cmd', cmd: 'prev' }));
$('pv-next-btn').addEventListener('click', () => send({ t: 'cmd', cmd: 'next' }));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    send({ t: 'cmd', cmd: 'next' });
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    send({ t: 'cmd', cmd: 'prev' });
  } else if (e.key === 'Home') {
    send({ t: 'cmd', cmd: 'first' });
  } else if (e.key === 'End') {
    send({ t: 'cmd', cmd: 'last' });
  }
});

// ── 時計・経過タイマー ──
const pad = (n: number): string => String(n).padStart(2, '0');
function tick(): void {
  const d = new Date();
  $('pv-clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const s = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  $('pv-timer').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
$('pv-reset').addEventListener('click', () => {
  startMs = Date.now();
  tick();
});
window.setInterval(tick, 1000);
tick();

bootstrapFromStorage();
render();
