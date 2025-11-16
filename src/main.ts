import './style.css';
import { parseDeck } from './deck';
import { slideHtml } from './render';
import { Presenter } from './present';
import { applyTheme, DEFAULT_THEME_ID, THEMES, themeById } from './themes';

const SAMPLE = `---
title: maku の使い方
theme: ${DEFAULT_THEME_ID}
---

<!-- layout: title -->

# maku

## Markdown を、そのままスライドに

---

## 書くだけで分かれる

\`---\` を置くと、そこで次のスライドに分かれます。

- 箇条書き
- **強調** や \`コード\` も使えます
- ネストも:
  - 子の項目
  - もうひとつ

---

<!-- incremental -->

## 一つずつ見せる

\`<!-- incremental -->\` を置くと、

矢印キーで

ひとつずつ現れます。

---

## コードも表も

\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}\`;
}
\`\`\`

| 機能 | 対応 |
|:--|:--:|
| 表 | できる |
| コード | できる |

---

<!-- layout: split -->

## 左右に並べる

\`layout: split\` と \`===\` で段組に。

===

### 右側

- 比較に便利
- 図と説明を並べる

---

<!-- layout: center -->
<!-- bg: https://picsum.photos/seed/maku-cover/1600/900?grayscale -->
<!-- class: on-image -->

# 背景に写真も

中央寄せ・背景画像も指定できます

???

ここはスピーカーノート。本番では聴衆に見えません。
S キーでノートと発表者タイマーを開けます。
`;

const MD_KEY = 'maku.md';

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つからない');

const ICON = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 4h6v6H4zM4 14h16v6H4zM14 4h6v6h-6z" opacity="0"/><path d="M8 5v14l11-7z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7z" opacity="0"/><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.1 11l7.8-4M8.1 13l7.8 4"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18 3 3 0 0 0 0-6 1.5 1.5 0 0 1 0-3 3 3 0 0 0 0-6z" fill="currentColor" stroke="none"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.7-2 2-2 3.5"/><circle cx="12" cy="17.5" r="0.6" fill="currentColor"/></svg>',
};

app.innerHTML = `
  <header class="bar">
    <span class="logo">maku</span>
    <span class="bar-title" id="bar-title"></span>
    <div class="bar-actions">
      <button class="ico" id="edit" title="編集 (E)">${ICON.edit}</button>
      <button class="ico" id="overview" title="一覧 (O)">${ICON.grid}</button>
      <button class="ico" id="notes-btn" title="ノートと発表者タイマー (S)">${ICON.notes}</button>
      <button class="ico" id="theme-btn" title="テーマ (T)">${ICON.theme}</button>
      <button class="ico" id="pdf" title="PDFに書き出し (P)">${ICON.pdf}</button>
      <button class="ico" id="share" title="リンクをコピー">${ICON.share}</button>
      <button class="ico" id="present" title="全画面 (F)">${ICON.play}</button>
      <button class="ico" id="help-btn" title="ヘルプ (?)">${ICON.help}</button>
    </div>
  </header>

  <main class="work">
    <aside class="editor" id="editor" hidden>
      <textarea id="md" spellcheck="false" aria-label="Markdown入力"></textarea>
    </aside>
    <section class="viewer">
      <div class="deck-root" id="deck-root">
        <div class="stage" id="stage"></div>
        <button class="nav nav-prev" id="prev" aria-label="前へ">‹</button>
        <button class="nav nav-next" id="next" aria-label="次へ">›</button>
        <div class="deck-foot">
          <div class="bar-progress"><span id="progress"></span></div>
          <span class="counter" id="counter"></span>
        </div>
      </div>
    </section>
  </main>

  <div class="panel notes" id="notes-panel" hidden>
    <div class="notes-head">
      <span>発表者ノート</span>
      <span class="timer" id="timer">00:00</span>
      <button class="mini" id="timer-toggle">開始</button>
      <button class="mini" id="timer-reset">0</button>
    </div>
    <div class="notes-body" id="notes-body"></div>
  </div>

  <div class="overlay" id="overview-overlay" hidden>
    <div class="overlay-head"><span>スライド一覧</span><button class="mini" data-close="overview-overlay">閉じる</button></div>
    <div class="overview-grid" id="overview-grid"></div>
  </div>

  <div class="overlay modal" id="theme-modal" hidden>
    <div class="overlay-head">
      <span>テーマ(100種類)</span>
      <input id="theme-search" type="search" placeholder="色名で絞り込み" aria-label="テーマ検索" />
      <button class="mini" data-close="theme-modal">閉じる</button>
    </div>
    <div class="theme-grid" id="theme-grid"></div>
  </div>

  <div class="overlay help" id="help-overlay" hidden>
    <div class="help-card">
      <h2>キー操作</h2>
      <dl>
        <dt>→ / Space</dt><dd>次へ(段階表示も進む)</dd>
        <dt>←</dt><dd>戻る</dd>
        <dt>Home / End</dt><dd>最初 / 最後</dd>
        <dt>F</dt><dd>全画面</dd>
        <dt>O</dt><dd>スライド一覧</dd>
        <dt>S</dt><dd>発表者ノート・タイマー</dd>
        <dt>E</dt><dd>編集パネル</dd>
        <dt>T</dt><dd>テーマ選択</dd>
        <dt>P</dt><dd>PDF書き出し</dd>
        <dt>Esc</dt><dd>パネルを閉じる</dd>
      </dl>
      <button class="mini" data-close="help-overlay">閉じる</button>
    </div>
  </div>

  <div id="print-deck" aria-hidden="true"></div>
`;

const $ = <T extends HTMLElement>(id: string): T => app.querySelector<T>(`#${id}`)!;
const deckRoot = $('deck-root');
const stage = $('stage');
const mdInput = $<HTMLTextAreaElement>('md');
const barTitle = $('bar-title');

const presenter = new Presenter(
  { stage, progress: $('progress'), counter: $('counter'), notes: $('notes-body') },
  (i) => {
    if (location.hash !== `#${i + 1}`) history.replaceState(null, '', `#${i + 1}${themeQuery()}`);
  },
);

let currentTheme = themeById(readTheme());

function readTheme(): string {
  const params = new URLSearchParams(location.search);
  return params.get('theme') ?? localStorage.getItem('maku.theme') ?? DEFAULT_THEME_ID;
}

function themeQuery(): string {
  return `?theme=${currentTheme.id}`;
}

function setTheme(id: string, persist = true): void {
  currentTheme = themeById(id);
  applyTheme(deckRoot, currentTheme);
  applyTheme($('print-deck'), currentTheme);
  if (persist) {
    try {
      localStorage.setItem('maku.theme', currentTheme.id);
    } catch {
      // 保存できなくても表示は反映する
    }
    history.replaceState(null, '', `#${presenter.index + 1}${themeQuery()}`);
  }
}

function rebuild(keepIndex = true): void {
  const deck = parseDeck(mdInput.value);
  presenter.setDeck(deck, keepIndex);
  barTitle.textContent = deck.meta.title ?? '';
  try {
    localStorage.setItem(MD_KEY, mdInput.value);
  } catch {
    // 保存失敗は無視
  }
}

// ── 初期化 ──
mdInput.value = localStorage.getItem(MD_KEY) ?? SAMPLE;
setTheme(currentTheme.id, false);
{
  const firstDeck = parseDeck(mdInput.value);
  // URLにテーマ指定が無く、文書がテーマを指定していればそれを使う
  if (!new URLSearchParams(location.search).get('theme') && firstDeck.meta.theme) {
    setTheme(firstDeck.meta.theme, false);
  }
}
rebuild(false);
{
  const start = Number(location.hash.replace('#', '')) - 1;
  if (Number.isFinite(start) && start > 0) presenter.go(start);
}

// ── ナビ ──
$('next').addEventListener('click', () => presenter.next());
$('prev').addEventListener('click', () => presenter.prev());

mdInput.addEventListener('input', () => rebuild(true));

// ── パネル開閉 ──
function toggle(id: string, force?: boolean): void {
  const el = $(id);
  el.hidden = force === undefined ? !el.hidden : !force;
  if (id === 'editor') $('edit').classList.toggle('on', !el.hidden);
}
$('edit').addEventListener('click', () => toggle('editor'));
$('notes-btn').addEventListener('click', () => toggle('notes-panel'));
$('overview').addEventListener('click', () => {
  buildOverview();
  toggle('overview-overlay', true);
});
$('theme-btn').addEventListener('click', () => {
  buildThemeGrid();
  toggle('theme-modal', true);
});
$('help-btn').addEventListener('click', () => toggle('help-overlay', true));
app.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
  b.addEventListener('click', () => toggle(b.dataset.close!, false)),
);

// ── 全画面 ──
$('present').addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void deckRoot.requestFullscreen?.();
});

// ── PDF(印刷)──
$('pdf').addEventListener('click', () => doPrint());
function doPrint(): void {
  const deck = parseDeck(mdInput.value);
  $('print-deck').innerHTML = deck.slides
    .map((s) => `<div class="print-page">${slideHtml(s)}</div>`)
    .join('');
  window.print();
}

// ── リンク共有 ──
$('share').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    flash($('share'));
  } catch {
    // クリップボード不可環境では何もしない
  }
});
function flash(btn: HTMLElement): void {
  btn.classList.add('flash');
  window.setTimeout(() => btn.classList.remove('flash'), 700);
}

// ── 一覧 ──
function buildOverview(): void {
  const deck = parseDeck(mdInput.value);
  const grid = $('overview-grid');
  grid.innerHTML = '';
  deck.slides.forEach((s, i) => {
    const cell = document.createElement('button');
    cell.className = 'ov-cell';
    cell.innerHTML = `<div class="ov-thumb">${slideHtml(s)}</div><span class="ov-no">${i + 1}</span>`;
    cell.addEventListener('click', () => {
      presenter.go(i);
      toggle('overview-overlay', false);
    });
    grid.appendChild(cell);
  });
}

// ── テーマギャラリー ──
function buildThemeGrid(filter = ''): void {
  const grid = $('theme-grid');
  grid.innerHTML = '';
  const q = filter.trim();
  for (const t of THEMES) {
    if (q && !t.name.includes(q) && !t.id.includes(q)) continue;
    const cell = document.createElement('button');
    cell.className = 'th-cell' + (t.id === currentTheme.id ? ' on' : '');
    cell.style.setProperty('--c-bg', t.vars['--bg']!);
    cell.style.setProperty('--c-fg', t.vars['--fg']!);
    cell.style.setProperty('--c-accent', t.vars['--accent']!);
    cell.style.setProperty('--c-rule', t.vars['--rule']!);
    cell.innerHTML = `<span class="th-prev"><span class="th-aa">Aa</span><span class="th-dot"></span></span><span class="th-name">${t.name}</span>`;
    cell.addEventListener('click', () => {
      setTheme(t.id);
      buildThemeGrid(q);
    });
    grid.appendChild(cell);
  }
}
$<HTMLInputElement>('theme-search').addEventListener('input', (e) =>
  buildThemeGrid((e.target as HTMLInputElement).value),
);

// ── 発表者タイマー ──
let timerId = 0;
let elapsed = 0;
$('timer-toggle').addEventListener('click', () => {
  const btn = $('timer-toggle');
  if (timerId) {
    window.clearInterval(timerId);
    timerId = 0;
    btn.textContent = '再開';
  } else {
    timerId = window.setInterval(() => {
      elapsed += 1;
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      $('timer').textContent = `${m}:${s}`;
    }, 1000);
    btn.textContent = '停止';
  }
});
$('timer-reset').addEventListener('click', () => {
  elapsed = 0;
  $('timer').textContent = '00:00';
});

// ── キーボード ──
window.addEventListener('keydown', (ev) => {
  const target = ev.target as HTMLElement;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  switch (ev.key) {
    case 'ArrowRight':
    case ' ':
      ev.preventDefault();
      presenter.next();
      break;
    case 'ArrowLeft':
      presenter.prev();
      break;
    case 'Home':
      presenter.go(0);
      break;
    case 'End':
      presenter.go(presenter.total - 1);
      break;
    case 'f':
    case 'F':
      $('present').click();
      break;
    case 'o':
    case 'O':
      $('overview').click();
      break;
    case 's':
    case 'S':
      toggle('notes-panel');
      break;
    case 'e':
    case 'E':
      toggle('editor');
      break;
    case 't':
    case 'T':
      $('theme-btn').click();
      break;
    case 'p':
    case 'P':
      doPrint();
      break;
    case '?':
      toggle('help-overlay', true);
      break;
    case 'Escape':
      ['overview-overlay', 'theme-modal', 'help-overlay'].forEach((id) => toggle(id, false));
      break;
  }
});

// スワイプ
let touchX = 0;
deckRoot.addEventListener('touchstart', (e) => (touchX = e.changedTouches[0]!.clientX), {
  passive: true,
});
deckRoot.addEventListener(
  'touchend',
  (e) => {
    const dx = e.changedTouches[0]!.clientX - touchX;
    if (dx < -50) presenter.next();
    else if (dx > 50) presenter.prev();
  },
  { passive: true },
);
