import './style.css';
import { parseDeck } from './deck';
import { exportPdf, exportPptx } from './export';
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
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.1 11l7.8-4M8.1 13l7.8 4"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18 3 3 0 0 0 0-6 1.5 1.5 0 0 1 0-3 3 3 0 0 0 0-6z" fill="currentColor" stroke="none"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.7-2 2-2 3.5"/><circle cx="12" cy="17.5" r="0.6" fill="currentColor"/></svg>',
};

app.innerHTML = `
  <header class="bar">
    <span class="logo">maku</span>
    <span class="bar-title" id="bar-title"></span>
    <div class="bar-actions">
      <button class="ico" id="open" data-tip="Markdownを開く" aria-label="Markdownを開く">${ICON.open}</button>
      <button class="ico" id="edit" data-tip="編集 (E)" aria-label="編集">${ICON.edit}</button>
      <button class="ico" id="overview" data-tip="スライド一覧 (O)" aria-label="スライド一覧">${ICON.grid}</button>
      <button class="ico" id="notes-btn" data-tip="発表者ノートとタイマー (S)" aria-label="発表者ノートとタイマー">${ICON.notes}</button>
      <button class="ico" id="theme-btn" data-tip="テーマを選ぶ (T)" aria-label="テーマを選ぶ">${ICON.theme}</button>
      <button class="ico" id="export" data-tip="書き出し: PDF / PPTX / Google (P)" aria-label="書き出し">${ICON.pdf}</button>
      <button class="ico" id="share" data-tip="共有リンクをコピー" aria-label="共有リンクをコピー">${ICON.share}</button>
      <button class="ico" id="present" data-tip="全画面で発表 (F)" aria-label="全画面で発表">${ICON.play}</button>
      <button class="ico" id="help-btn" data-tip="ヘルプ (?)" aria-label="ヘルプ">${ICON.help}</button>
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
        <dt>P</dt><dd>書き出し(PDF / PPTX / Google)</dd>
        <dt>Esc</dt><dd>パネルを閉じる</dd>
      </dl>
      <button class="mini" data-close="help-overlay">閉じる</button>
    </div>
  </div>

  <div class="menu" id="export-menu" hidden>
    <button data-export="pdf">PDF を書き出す</button>
    <button data-export="pptx">PowerPoint (.pptx)</button>
    <button data-export="gslides">Google スライド用に書き出す</button>
    <button data-export="md">Markdown を保存</button>
    <button data-export="print">ブラウザで印刷</button>
  </div>

  <input type="file" id="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden />

  <div class="busy" id="busy" hidden>
    <div class="busy-card"><span class="spinner" aria-hidden="true"></span><span id="busy-text">書き出し中…</span></div>
  </div>

  <div class="overlay help" id="gslides-modal" hidden>
    <div class="help-card">
      <h2>Google スライドで開く</h2>
      <p class="gs-lead">.pptx を書き出しました。次の手順で Google スライドの編集可能なファイルになります。</p>
      <ol class="gs-steps">
        <li>Google ドライブに、書き出した <code>.pptx</code> をアップロード</li>
        <li>そのファイルを右クリック → 「アプリで開く」→「Google スライド」</li>
        <li>または Google スライドで「ファイル → スライドのインポート」から選択</li>
      </ol>
      <div class="gs-actions">
        <a class="mini" href="https://slides.google.com" target="_blank" rel="noopener">Google スライドを開く</a>
        <a class="mini" href="https://drive.google.com" target="_blank" rel="noopener">Google ドライブを開く</a>
        <button class="mini" data-close="gslides-modal">閉じる</button>
      </div>
    </div>
  </div>

  <div class="toast-wrap" id="toast-wrap" aria-live="polite"></div>

  <div id="print-deck" aria-hidden="true"></div>
`;

const $ = <T extends HTMLElement>(id: string): T => app.querySelector<T>(`#${id}`)!;
const deckRoot = $('deck-root');
const stage = $('stage');
const mdInput = $<HTMLTextAreaElement>('md');
const barTitle = $('bar-title');

// ツールバーはアイコンのみなので、ホバー/フォーカスで役割を示すツールチップを出す。
// 端のボタンでも見切れないよう、JSで左右をビューポート内にクランプして配置する。
const tip = document.createElement('div');
tip.className = 'tip';
tip.setAttribute('role', 'tooltip');
document.body.appendChild(tip);
let tipTimer = 0;

function placeTip(btn: HTMLElement): void {
  const label = btn.dataset.tip;
  if (!label) return;
  tip.textContent = label;
  const b = btn.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, b.left + b.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(b.bottom + 8)}px`;
  tip.classList.add('show');
}

function hideTip(): void {
  window.clearTimeout(tipTimer);
  tip.classList.remove('show');
}

const barActions = app.querySelector<HTMLElement>('.bar-actions')!;
barActions.addEventListener('pointerover', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.ico');
  if (!btn) return;
  window.clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => placeTip(btn), 90);
});
barActions.addEventListener('pointerout', (e) => {
  const to = e.relatedTarget as HTMLElement | null;
  if (to && to.closest('.ico')) return;
  hideTip();
});
barActions.addEventListener('focusin', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.ico');
  if (btn) placeTip(btn);
});
barActions.addEventListener('focusout', hideTip);
barActions.addEventListener('click', hideTip);
window.addEventListener('scroll', hideTip, true);
window.addEventListener('resize', hideTip);

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

// ── 書き出し ──
const exportMenu = $('export-menu');
$('export').addEventListener('click', (e) => {
  e.stopPropagation();
  exportMenu.hidden = !exportMenu.hidden;
});
document.addEventListener('click', () => (exportMenu.hidden = true));
exportMenu.addEventListener('click', (e) => e.stopPropagation());

exportMenu.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((btn) => {
  btn.addEventListener('click', () => {
    exportMenu.hidden = true;
    void runExport(btn.dataset.export!);
  });
});

async function runExport(kind: string): Promise<void> {
  const deck = parseDeck(mdInput.value);
  if (deck.slides.length === 0) {
    toast('スライドがありません');
    return;
  }
  if (kind === 'print') {
    doPrint();
    return;
  }
  if (kind === 'md') {
    download(`${deck.meta.title || 'slides'}.md`, mdInput.value, 'text/markdown');
    toast('Markdown を保存しました');
    return;
  }
  setBusy(true, '書き出し中…');
  const onProgress = (done: number, total: number): void => setBusy(true, `書き出し中… ${done} / ${total}`);
  try {
    if (kind === 'pdf') {
      await exportPdf(deck, currentTheme, onProgress);
      toast('PDF を書き出しました');
    } else if (kind === 'pptx' || kind === 'gslides') {
      await exportPptx(deck, currentTheme, onProgress);
      if (kind === 'gslides') toggle('gslides-modal', true);
      else toast('PowerPoint (.pptx) を書き出しました');
    }
  } catch (err) {
    toast(`書き出しに失敗しました(外部画像はCORSで取り込めないことがあります)`);
    console.error(err);
  } finally {
    setBusy(false);
  }
}

function doPrint(): void {
  const deck = parseDeck(mdInput.value);
  $('print-deck').innerHTML = deck.slides
    .map((s) => `<div class="print-page">${slideHtml(s)}</div>`)
    .join('');
  window.print();
}

function setBusy(show: boolean, text = ''): void {
  $('busy').hidden = !show;
  if (show) $('busy-text').textContent = text;
}

function toast(message: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  $('toast-wrap').appendChild(el);
  window.setTimeout(() => el.classList.add('show'), 10);
  window.setTimeout(() => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 300);
  }, 2600);
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Markdownファイルを開く / ドロップ ──
$('open').addEventListener('click', () => $<HTMLInputElement>('file').click());
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void loadFile(file);
});
async function loadFile(file: File): Promise<void> {
  mdInput.value = await file.text();
  rebuild(false);
  toast(`${file.name} を読み込みました`);
}
['dragover', 'drop'].forEach((type) => {
  deckRoot.addEventListener(type, (e) => e.preventDefault());
});
deckRoot.addEventListener('drop', (e) => {
  const file = (e as DragEvent).dataTransfer?.files?.[0];
  if (file) void loadFile(file);
});

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
      $('export').click();
      break;
    case '?':
      toggle('help-overlay', true);
      break;
    case 'Escape':
      ['overview-overlay', 'theme-modal', 'help-overlay', 'gslides-modal'].forEach((id) =>
        toggle(id, false),
      );
      $('export-menu').hidden = true;
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
