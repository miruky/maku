import './style.css';
import { deckRatio, deleteStartWithMarkers, parseDeck, setBlockMarker, stripRevealDirectiveLines, type BlockMarker, type RevealMode } from './deck';
import { blockToMd } from './edit';
import {
  deckFilename,
  exportHtml,
  exportPdf,
  exportPptx,
  renderSlidePng,
  slideImageName,
} from './export';
import {
  applyOverlay,
  clampBox,
  ensureSlide,
  fitBoxKeepingAspect,
  isImageShape,
  isTextShape,
  loadOverlay,
  newId,
  saveOverlay,
  shapeLabel,
  slideOverlay,
  type Box,
  type ImageShape,
  type Shape,
  type VectorKind,
} from './overlay';
import { deckTitles, slideHtml } from './render';
import { Annotator } from './annot';
import { hasPendingMath, typesetMath } from './math';
import { hasPendingMermaid, resetMermaid, typesetMermaid } from './mermaid';
import { Presenter } from './present';
import {
  applyTheme,
  BRAND_VAR_NAMES,
  DEFAULT_THEME_ID,
  themeById,
  themeOverrides,
  THEMES,
} from './themes';

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

<!-- reveal: key-first -->

# 要点から、順に。

\`<!-- reveal: key-first -->\` で、

まずキーメッセージを見せて、

それから詳細を一つずつ。

---

<!-- layout: section -->

02
===
# レイアウトいろいろ
===
14種類。\`<!-- layout: 名前 -->\` で切り替えられます。

---

<!-- layout: stats -->

# 数字で見せる

===

#### テーマ
264

===

#### レイアウト
14

===

#### 実行時依存
0

---

<!-- layout: split -->

## 左右に並べる

\`layout: split\` と \`===\` で段組に。

===

### 右側

- 比較に便利
- 図と説明を並べる

---

<!-- layout: quote -->

シンプルさは、**究極の洗練**である。

— レオナルド・ダ・ヴィンチ

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

## 画像も置ける

ツールバーの画像ボタン・ドラッグ&ドロップ・貼り付けで取り込めます。
**Markdown に挿入**するか、**スライドに自由配置**するかを選べます。

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

// localStorage はプライベートモードやポリシーで参照自体が例外になることがある。
// 起動時の読み取りで落ちて真っ白にならないよう、安全に包む。
const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つからない');

const ICON = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>',
  inplace:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9M4 12h6M4 17h7"/><path d="M14.6 14.4l5-5a1.6 1.6 0 0 0-2.3-2.3l-5 5-.6 2.9z"/></svg>',
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
    <span class="logo">
      <svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor">
        <rect class="card-back" x="20" y="24" width="30" height="20" rx="4" stroke-width="3" />
        <rect x="14" y="18" width="30" height="20" rx="4" stroke-width="3.5" />
        <path class="play" d="M25 23 25 33 34 28Z" fill="currentColor" stroke="none" />
      </svg>
      <span class="logo-word">maku</span>
    </span>
    <span class="bar-title" id="bar-title"></span>
    <div class="bar-actions">
      <button class="ico" id="open" data-tip="Markdownを開く" aria-label="Markdownを開く">${ICON.open}</button>
      <button class="ico" id="edit" data-tip="Markdownエディタ (E)" aria-label="Markdownエディタ">${ICON.edit}</button>
      <button class="ico" id="live-edit" data-tip="スライドを直接編集" aria-label="スライドを直接編集">${ICON.inplace}</button>
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
    <div class="step-now" id="notes-step"></div>
    <div class="notes-body" id="notes-body"></div>
    <div class="notes-next" id="notes-next"></div>
  </div>

  <div class="overlay" id="overview-overlay" hidden>
    <div class="overlay-head">
      <div class="head-titles">
        <span class="kicker">Gallery</span>
        <span class="head-title">スライド一覧</span>
      </div>
      <button class="mini" data-close="overview-overlay">閉じる</button>
    </div>
    <div class="overview-grid" id="overview-grid"></div>
  </div>

  <div class="overlay modal" id="theme-modal" hidden>
    <div class="overlay-head">
      <div class="head-titles">
        <span class="kicker">Theme</span>
        <span class="head-title">テーマ<span class="head-sub">${THEMES.length}種類</span></span>
      </div>
      <input id="theme-search" type="search" placeholder="色名で絞り込み" aria-label="テーマ検索" />
      <button class="mini" data-close="theme-modal">閉じる</button>
    </div>
    <div class="theme-grid" id="theme-grid"></div>
  </div>

  <div class="overlay guide" id="help-overlay" hidden>
    <div class="guide-head">
      <div class="head-titles">
        <span class="kicker">Guide</span>
        <span class="head-title">使い方<span class="head-sub">ヘルプ & FAQ</span></span>
      </div>
      <input id="guide-search" type="search" placeholder="検索(段階表示 / 書き出し / 画像 / CORS …)" aria-label="ヘルプ内検索" />
      <button class="mini" id="load-sample">サンプル</button>
      <button class="mini" data-close="help-overlay">閉じる</button>
    </div>
    <div class="guide-body">
      <nav class="guide-nav" id="guide-nav">
        <button data-goto="g-start">はじめに</button>
        <button data-goto="g-md">Markdown 記法</button>
        <button data-goto="g-layout">レイアウト</button>
        <button data-goto="g-reveal">段階表示</button>
        <button data-goto="g-edit">直接編集</button>
        <button data-goto="g-image">画像</button>
        <button data-goto="g-theme">テーマ</button>
        <button data-goto="g-export">書き出し</button>
        <button data-goto="g-keys">キーボード</button>
        <button data-goto="g-faq">FAQ</button>
        <button data-goto="g-from">他ツールから</button>
      </nav>
      <div class="guide-content" id="guide-content">
        <section class="g-sec" id="g-start">
          <h3>はじめに</h3>
          <p>maku は <b>Markdown を書くだけでスライドになる</b>ツールです。すべてブラウザの中で動き、サーバーには何も送りません。流れは「<b>書く → テーマで装う → 発表・書き出し</b>」。</p>
          <p class="g-warn">⚠️ 作ったデータはこのブラウザの localStorage にだけ保存されます。別の端末・シークレットウィンドウ・サイトデータの消去では消えます。大切な内容は <b>書き出し → Markdown を保存</b> でバックアップしてください。</p>
        </section>

        <section class="g-sec" id="g-md">
          <h3>Markdown 記法</h3>
          <ul>
            <li><code>---</code>(単独行) … スライドの区切り</li>
            <li>先頭の <code>---</code> ブロック … フロントマター(<code>title:</code> / <code>theme:</code>)</li>
            <li>見出し <code>#</code>〜<code>######</code>、<b>**強調**</b>、<i>*斜体*</i>、~~打ち消し~~、<code>\`コード\`</code></li>
            <li>リンク <code>[文字](URL)</code>、画像 <code>![代替](URL)</code>、引用 <code>&gt;</code>、箇条書き <code>-</code>(入れ子可)、番号 <code>1.</code>、タスク <code>- [ ]</code>、表、コードブロック、水平線</li>
            <li><code>???</code> 以降 … 発表者ノート(本番では聴衆に見えません)</li>
          </ul>
          <pre class="g-code">---
title: 提案
theme: ai-hiru-mincho
---

# タイトル

- 箇条書き
- **強調** と \`コード\`

???
ここは発表者ノート。</pre>
        </section>

        <section class="g-sec" id="g-layout">
          <h3>レイアウト(14種類)</h3>
          <p><code>&lt;!-- layout: 名前 --&gt;</code> をスライド先頭に置いて切り替えます。</p>
          <ul>
            <li><b>default / center / title / full</b> … 既定・中央寄せ・表紙・全面</li>
            <li><b>split</b> 段組 / <b>grid</b> 格子 / <b>cards</b> カード / <b>stats</b> 数値強調 / <b>timeline</b> 年表 / <b>quote</b> 引用 / <b>section</b> 章扉 / <b>compare</b> 対比 / <b>image-left・image-right</b> 画像分割</li>
          </ul>
          <p><code>===</code>(単独行)で各部を区切ります(split / grid / cards / stats / compare / section / quote / image-左右)。</p>
          <pre class="g-code">&lt;!-- layout: stats --&gt;

#### 継続率
98.6%
前年比 +4.2pt

===

#### 月間処理
1.2B</pre>
        </section>

        <section class="g-sec" id="g-reveal">
          <h3>段階表示(一つずつ見せる)</h3>
          <p>「開いたら①、→ で②、また → で③…」のように順番に見せる機能です。</p>
          <p><b>いちばん簡単(右クリックで番号を付ける):</b> 「スライドを直接編集」をオンにし、見せたいブロックを<b>右クリック → 「順番を付ける」</b>で 1・2・3… と番号を振ります。番号を付けたブロックだけがその順で現れ、付けていないブロックは<b>最初から表示</b>されます(段階表示は自動でオンになります)。各ブロック左肩の番号バッジをクリックしても同じメニューが開きます。</p>
          <ul>
            <li><b>順番を付ける ▸ 1 / 2 / 3 / 次の番号</b> … この順で現れる</li>
            <li><b>複数まとめて同時に:</b> ブロックを <b>Shift+クリック</b> で複数選び、右クリック →「<b>まとめて同時に出す</b>」(グループ化)</li>
            <li><b>直前と同時に出す</b> / <b>要点として先に出す</b> / <b>ずっと表示する</b> / <b>この順番から外す</b> … 右クリックから個別に指定</li>
          </ul>
          <p>スライドの何もない所を<b>右クリック →「段階表示」</b>から、<b>順番に(上から)</b>・<b>要点を先に</b>・<b>番号で指定</b>・<b>なし</b> をまとめて切り替えることもできます。編集中は全ブロックが見えています(番号で順序を確認)。実際に隠れて段階表示になるのは<b>発表・閲覧のとき</b>で、書き出し(PDF / PPTX / PNG)では<b>最終状態(全部表示)</b>になります。</p>
          <p class="g-note">上級者向けに記法でも指定できます: <code>&lt;!-- reveal: sequential | key-first | manual --&gt;</code> と、ブロックの直前に <code>&lt;!-- step: N --&gt;</code>(順番)・<code>&lt;!-- group --&gt;</code>(前と同時)・<code>&lt;!-- key --&gt;</code>(要点)・<code>&lt;!-- pin --&gt;</code>(常に表示)。右クリック操作はこの記法を自動で書き込みます。</p>
        </section>

        <section class="g-sec" id="g-edit">
          <h3>スライドを直接編集</h3>
          <p>ツールバーの「スライドを直接編集」をオンにします。</p>
          <ul>
            <li><b>本文の文字</b> … クリックで選択 → もう一度クリック/ダブルクリックでその場編集。Markdown 側にも即反映されます。本文の<b>位置はレイアウトが決めます</b>(自由には動かしません)。</li>
            <li><b>右クリックメニュー</b> … 本文ブロックを右クリックすると、段階表示の<b>順番付け</b>・グループ化・編集・削除など。何もない所を右クリックすると<b>テキスト/図形/画像の追加</b>と<b>段階表示</b>の切り替え。図形・画像を右クリックすると<b>複製・重なり順(最前面/最背面)・削除</b>。</li>
            <li><b>自由配置</b> … テキストボックス・図形・画像を追加し、ドラッグで移動、角ハンドルでリサイズ、矢印キーで微調整(Shiftで大きく)、Delete で削除。これらは Markdown には入りません(レイアウト情報として別に保存)。</li>
            <li><b>整列ガイド</b> … 移動中、スライドの中心・端や他の要素の辺に近づくと自動で吸着し、ガイド線が出ます。<b>Cmd / Ctrl(または Alt)</b>を押しながら動かすと吸着を一時的に無効化できます。</li>
          </ul>
        </section>

        <section class="g-sec" id="g-image">
          <h3>画像</h3>
          <ul>
            <li>取り込み: 挿入ツールバーの画像ボタン / スライドへ<b>ドラッグ&ドロップ</b> / <b>貼り付け</b>(Cmd・Ctrl+V)</li>
            <li><b>Markdown に挿入</b> するか <b>スライドに自由配置</b> するかを選べます</li>
            <li>自由配置の画像は角ハンドルで<b>縦横比を保って</b>リサイズ(Shiftで自由変形)</li>
          </ul>
          <p class="g-warn">⚠️ 外部URLの画像は、相手サーバーが CORS を許可していないと書き出し(PNG / PPTX)で空になることがあります。取り込んで埋め込むのが確実です。</p>
        </section>

        <section class="g-sec" id="g-theme">
          <h3>テーマ</h3>
          <p><b>T</b> キー、またはツールバーのテーマボタンで <b>264種類</b>から選べます(色名で検索可)。選んだテーマはURLに乗るので、リンクを共有すれば同じ見た目で開けます。本文・リンク・小見出しの配色は全テーマで <b>WCAG AA</b>(コントラスト比4.5以上)を満たします。</p>
        </section>

        <section class="g-sec" id="g-export">
          <h3>書き出し</h3>
          <ul>
            <li><b>PDF</b> … 各スライドを実寸の画像にして1ページずつ並べます。背景・図形・画像もそのまま含まれます。</li>
            <li><b>PowerPoint(.pptx)</b> … 各スライドを<b>画像として</b>配置(PowerPoint上での再編集はできません)。発表者ノートも引き継ぎます。</li>
            <li><b>Google スライド</b> … 同じ .pptx を Google ドライブにアップ →「アプリで開く / スライドのインポート」。</li>
            <li><b>画像(.png)</b> … 表示中の1枚。<b>Markdown を保存</b> も。<b>ブラウザで印刷</b>する場合は印刷ダイアログで「背景のグラフィック」をON・用紙=横に。</li>
          </ul>
          <p class="g-note">段階表示は書き出しでは<b>最終状態</b>(全部表示)になります。外部URLの画像は CORS の都合で空になることがあります。</p>
        </section>

        <section class="g-sec" id="g-keys">
          <h3>キーボード</h3>
          <dl class="g-keys">
            <dt>→ / Space</dt><dd>次へ(段階表示も進む)</dd>
            <dt>←</dt><dd>戻る</dd>
            <dt>Home / End</dt><dd>最初 / 最後</dd>
            <dt>数字 + Enter</dt><dd>その番号のスライドへジャンプ</dd>
            <dt>F</dt><dd>全画面で発表</dd>
            <dt>O</dt><dd>スライド一覧</dd>
            <dt>S</dt><dd>発表者ノート(次スライドのプレビュー・ステップ進捗・タイマーつき)</dd>
            <dt>E</dt><dd>Markdown エディタ</dd>
            <dt>T</dt><dd>テーマ選択</dd>
            <dt>P</dt><dd>書き出し</dd>
            <dt>B / W</dt><dd>画面を黒 / 白で覆う(注目誘導。もう一度で戻る)</dd>
            <dt>D / L</dt><dd>手書きペン / レーザーポインタ(C で手書き消去・Esc/同キーで終了)</dd>
            <dt>A</dt><dd>自動送り(キオスク)の一時停止 / 再開 ※ frontmatter に autoslide</dd>
            <dt>?</dt><dd>このヘルプ</dd>
            <dt>Esc</dt><dd>開いているダイアログ / 全画面 / 図形選択を閉じる(編集パネル・ノートは E / S で切替)</dd>
            <dt>矢印 / Shift+矢印</dt><dd>選択中の図形を微調整 / 大きく</dd>
            <dt>Delete</dt><dd>選択中の図形を削除</dd>
          </dl>
        </section>

        <section class="g-sec" id="g-faq">
          <h3>FAQ</h3>
          <div class="g-qa"><b>Q. データはどこに保存される？</b><p>このブラウザの localStorage だけです。サーバーには送りません。端末を変えると引き継げないので、大事な内容は Markdown を保存してバックアップを。</p></div>
          <div class="g-qa"><b>Q. ブラウザ印刷で背景が白くなる</b><p>印刷ダイアログで「背景のグラフィック」をONにしてください(既定でOFFのことが多い)。なお <b>PDF ボタン</b>での書き出しは背景も含めて出力されます。</p></div>
          <div class="g-qa"><b>Q. PowerPoint で文字を編集したい</b><p>.pptx は各スライドを画像として書き出します(再編集は不可)。文章を直したいときは maku の Markdown を編集して再書き出しを。</p></div>
          <div class="g-qa"><b>Q. Google スライドに出せる？</b><p>直接の書き出しはありません。.pptx を書き出し、Google スライドの「ファイル → スライドのインポート」で取り込めます。</p></div>
          <div class="g-qa"><b>Q. 画像が書き出しに出てこない</b><p>外部URLの画像はサーバーが CORS を許可しないとコピーできず、書き出しで空になります。取り込んで埋め込むと確実です。</p></div>
          <div class="g-qa"><b>Q. 文字が□(豆腐)になる/フォントが違う</b><p>書き出しは閲覧環境のフォントを使います。日本語フォントが無い環境では崩れることがあります。</p></div>
          <div class="g-qa"><b>Q. 段階表示が書き出しで消える</b><p>仕様です。書き出しは最終状態(全部表示)になります。</p></div>
          <div class="g-qa"><b>Q. 一覧やリンク共有は？</b><p><b>O</b> でスライド一覧、共有ボタンで現在のURL(テーマ・ページ番号つき)をコピーできます。</p></div>
          <div class="g-qa"><b>Q. スマホで使える？</b><p>閲覧・スワイプ移動はできます。精密な配置や PDF/PPTX 書き出しはデスクトップ(Chrome 系)が確実です。</p></div>
        </section>

        <section class="g-sec" id="g-from">
          <h3>他ツールから</h3>
          <dl class="g-keys">
            <dt>スライド区切り</dt><dd><code>---</code>(Marp / Slidev / reveal と同じ)</dd>
            <dt>発表者ノート</dt><dd><code>???</code> 以降</dd>
            <dt>段組</dt><dd><code>&lt;!-- layout: split --&gt;</code> + <code>===</code></dd>
            <dt>段階表示</dt><dd>GUIの「段階表示」、または <code>&lt;!-- reveal: … --&gt;</code></dd>
            <dt>テーマ</dt><dd>フロントマターの <code>theme:</code> か T キー</dd>
          </dl>
        </section>
      </div>
    </div>
  </div>

  <div class="menu" id="export-menu" hidden>
    <button data-export="pdf">PDF を書き出す</button>
    <button data-export="pptx">PowerPoint (.pptx)</button>
    <button data-export="gslides">Google スライド用に書き出す</button>
    <button data-export="png">現在のスライドを画像で保存 (.png)</button>
    <button data-export="html">単体HTML(配布用・サーバー不要)</button>
    <button data-export="md">Markdown を保存</button>
    <button data-export="print">ブラウザで印刷</button>
  </div>

  <input type="file" id="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden />

  <div class="busy" id="busy" hidden>
    <div class="busy-card">
      <span id="busy-text">書き出し中…</span>
      <div class="busy-track" id="busy-track" role="progressbar" aria-valuemin="0" aria-valuenow="0" aria-valuemax="0">
        <span class="busy-fill" id="busy-fill"></span>
      </div>
      <span class="busy-count" id="busy-count"></span>
    </div>
  </div>

  <div class="overlay help" id="gslides-modal" hidden>
    <div class="help-card">
      <span class="kicker">Export</span>
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

  <div id="live-region" class="sr-only" aria-live="polite" role="status"></div>

  <div id="print-deck" aria-hidden="true"></div>
`;

const $ = <T extends HTMLElement>(id: string): T => app.querySelector<T>(`#${id}`)!;
const deckRoot = $('deck-root');
const stage = $('stage');
const mdInput = $<HTMLTextAreaElement>('md');
const barTitle = $('bar-title');
// 発表中の手書き注釈/レーザーポインタ(deck-root を覆う透明キャンバス。発表支援専用)。
const annot = new Annotator(deckRoot);

// 一覧・発表者ノート・各オーバーレイを deck-root の配下へ移す。これらは position:fixed のため
// 通常表示では変わらず画面全体に出るが、全画面(requestFullscreen(deck-root))のときも
// フルスクリーンのサブツリーに含まれるので、発表中に O(一覧)・S(ノート)・?(ヘルプ)が見える。
for (const id of ['overview-overlay', 'notes-panel', 'theme-modal', 'help-overlay', 'gslides-modal']) {
  const el = document.getElementById(id);
  if (el) deckRoot.appendChild(el);
}

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
barActions.addEventListener('click', (e) => {
  hideTip();
  // クリック後はフォーカスを外し、続く矢印/スペースがボタンに吸われないように。
  (e.target as HTMLElement).closest<HTMLElement>('.ico')?.blur();
});
window.addEventListener('scroll', hideTip, true);
window.addEventListener('resize', hideTip);

const presenter = new Presenter(
  { stage, progress: $('progress'), counter: $('counter'), notes: $('notes-body'), next: $('notes-next'), step: $('notes-step') },
  (i) => {
    if (location.hash !== `#${i + 1}`) history.replaceState(null, '', urlFor(i + 1));
    const lr = document.getElementById('live-region');
    if (lr) lr.textContent = `スライド ${i + 1} / ${presenter.total}`;
    annot.clearInk(); // スライドを移ったら前ページの手書きは消す(モードは維持)
  },
  () => decorateStage(),
);

let currentTheme = themeById(readTheme());

function readTheme(): string {
  const params = new URLSearchParams(location.search);
  return params.get('theme') ?? lsGet('maku.theme') ?? DEFAULT_THEME_ID;
}

// テーマは本来のクエリ文字列(? は # の前)に、スライド番号はフラグメント(#N)に置く。
// 旧実装は #N?theme=… とフラグメント内にクエリを入れていたため、location.search から読めず
// (共有でテーマ喪失)、Number('#N?theme=…') が NaN になり(リロードで毎回1枚目)になっていた。
function urlFor(slide1: number): string {
  return `${location.pathname}?theme=${currentTheme.id}#${slide1}`;
}

function setTheme(id: string, persist = true): void {
  const prevDark = currentTheme.dark;
  currentTheme = themeById(id);
  applyTheme(deckRoot, currentTheme);
  applyTheme($('print-deck'), currentTheme);
  applyBrand(currentMeta); // テーマ適用で消えた accent 上書きを戻す
  // Mermaid は配色を SVG に焼き込むため、明暗が変わったら描き直す(CSS変数では追従できない)。
  if (currentTheme.dark !== prevDark) {
    resetMermaid(stage);
    void typesetMermaid(stage).then(() => presenter.refit());
  }
  if (persist) {
    try {
      localStorage.setItem('maku.theme', currentTheme.id);
    } catch {
      // 保存できなくても表示は反映する
    }
    history.replaceState(null, '', urlFor(presenter.index + 1));
  }
}

// デッキの縦横比(frontmatter size/ratio)を deck-root の CSS 変数に反映する。既定は 16:9。
function applyAspect(meta: Record<string, string>): void {
  const { w, h } = deckRatio(meta);
  deckRoot.style.setProperty('--deck-ar', `${w} / ${h}`);
  deckRoot.style.setProperty('--deck-ar-num', String(w / h));
}

// 直近のデッキ meta(テーマ切替時にブランド色上書きを再適用するために保持)。
let currentMeta: Record<string, string> = {};

// frontmatter のブランド色上書き(accent 等)を表示・印刷に反映する。上書きが無いキーは
// 一旦テーマ値へ戻してから適用し、前デッキの上書き残りが居座らないようにする。
function applyBrand(meta: Record<string, string>): void {
  const ov = themeOverrides(meta);
  for (const el of [deckRoot, $('print-deck')]) {
    for (const name of BRAND_VAR_NAMES) {
      el.style.setProperty(name, ov[name] ?? currentTheme.vars[name] ?? '');
    }
  }
}

function rebuild(keepIndex = true): void {
  const deck = parseDeck(mdInput.value);
  currentMeta = deck.meta;
  applyAspect(deck.meta);
  applyBrand(deck.meta);
  // 編集での再描画(keepIndex)は入場アニメを再生しない(選択枠のズレ防止)。読み込み時のみアニメ。
  presenter.setDeck(deck, keepIndex, !keepIndex);
  barTitle.textContent = deck.meta.title ?? '';
  try {
    localStorage.setItem(MD_KEY, mdInput.value);
  } catch {
    // 保存失敗は無視
  }
}

// ── スライド直接編集(PowerPoint風の自由配置 + view ⇄ md の双方向) ──
// 文字内容だけが Markdown。位置・サイズ・図形は overlay(localStorage)に持ち、md は汚さない。
// 描画ブロックは data-src(原文の絶対オフセット)と data-bi(描画順index)を持つ。
const LIVE_KEY = 'maku.liveedit';
let liveEdit = lsGet(LIVE_KEY) !== 'off';
let presenting = false;
let viewDirty = false;
// editingBlock: 編集中の要素。md ブロック(kind 'block')か、テキスト図形の .ov-text(kind 'text')。
let editingBlock: HTMLElement | null = null;
let editingKind: 'block' | 'text' = 'block';
let editingShapeId = '';
let editStart = 0;
let editEnd = 0;
const overlay = loadOverlay();

function rangeOf(el: HTMLElement): [number, number] {
  const m = /^(\d+)-(\d+)$/.exec(el.dataset.src ?? '');
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}
function setRange(el: HTMLElement, s: number, e: number): void {
  el.dataset.src = `${s}-${e}`;
}

function persistMd(): void {
  try {
    localStorage.setItem(MD_KEY, mdInput.value);
  } catch {
    // 保存失敗は無視
  }
}

// ── 選択・編集 ──
// block: Markdown 本文ブロック(レイアウトが配置。その場でテキスト編集のみ、自由移動はしない)。
// shape: 自由配置のオーバーレイ要素(テキストボックス/図形/画像。移動・リサイズ・削除できる)。
type Selection = { kind: 'block'; el: HTMLElement } | { kind: 'shape'; el: HTMLElement; id: string };
let sel: Selection | null = null;

// 選択枠(8ハンドル)。stageは再描画で中身が入れ替わるので deckRoot 側に置く。
const frame = document.createElement('div');
frame.className = 'sel-frame';
frame.hidden = true;
frame.innerHTML = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  .map((h) => `<div class="sel-h sel-${h}" data-h="${h}"></div>`)
  .join('');
deckRoot.appendChild(frame);

// 段階表示の番号バッジを描く専用レイヤ。ブロック内に入れるとレイアウトのパディングや
// overflow と衝突し、本文(Markdown)へ混入する恐れもあるため、計測した座標でこの層に重ねる。
const stepLayer = document.createElement('div');
stepLayer.className = 'step-badge-layer';
stepLayer.setAttribute('aria-hidden', 'true');
deckRoot.appendChild(stepLayer);

// 自由配置のドラッグ中に出すスナップ用のガイド線レイヤ(スライドの中心・端・他図形の辺に吸着)。
const snapLayer = document.createElement('div');
snapLayer.className = 'snap-guides';
snapLayer.setAttribute('aria-hidden', 'true');
deckRoot.appendChild(snapLayer);

// 挿入ツールバー。
const insertBar = document.createElement('div');
insertBar.className = 'insert-bar';
insertBar.hidden = true;
insertBar.innerHTML = `
  <button data-insert="text" title="テキストボックス" aria-label="テキストボックス"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 6h14M9 6v12M7 18h4"/><path d="M14 12h6M17 12v6M15 18h4" opacity="0"/></svg></button>
  <button data-insert="rect" title="四角形" aria-label="四角形"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg></button>
  <button data-insert="ellipse" title="円・楕円" aria-label="円・楕円"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="12" rx="8" ry="6.5"/></svg></button>
  <button data-insert="triangle" title="三角形" aria-label="三角形"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 5l8 14H4z"/></svg></button>
  <button data-insert="line" title="直線" aria-label="直線"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 19L19 5"/></svg></button>
  <button data-insert="arrow" title="矢印" aria-label="矢印"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L18 6M10 6h8v8"/></svg></button>
  <button data-insert="image" title="画像を取り込む" aria-label="画像を取り込む"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 15l-5-4-11 8"/></svg></button>
  <span class="insert-sep"></span>
  <button data-insert="delete" title="選択を削除 (Delete)" aria-label="削除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13"/></svg></button>
`;
deckRoot.appendChild(insertBar);

// 画像取り込み用の隠しファイル入力と、インライン/自由配置の選択メニュー。
const imgFile = document.createElement('input');
imgFile.type = 'file';
imgFile.accept = 'image/*';
imgFile.multiple = true;
imgFile.hidden = true;
deckRoot.appendChild(imgFile);

const imgChooser = document.createElement('div');
imgChooser.className = 'menu img-chooser';
imgChooser.hidden = true;
imgChooser.innerHTML =
  '<button data-mode="free">スライドに自由配置</button>' +
  '<button data-mode="inline">Markdown に挿入</button>';
deckRoot.appendChild(imgChooser);

let pendingImages: File[] = [];
function openImagePicker(): void {
  imgFile.value = '';
  imgFile.click();
}
imgFile.addEventListener('change', () => {
  const files = Array.from(imgFile.files ?? []).filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  pendingImages = files;
  imgChooser.hidden = false;
});
imgChooser.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
  if (!btn) return;
  const mode = btn.dataset.mode === 'inline' ? 'inline' : 'free';
  imgChooser.hidden = true;
  const files = pendingImages;
  pendingImages = [];
  files.forEach((f, i) => {
    const at = mode === 'free' ? { x: 50 + i * 4, y: 46 + i * 4 } : undefined;
    void importImageFile(f, mode, at);
  });
});
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (!imgChooser.hidden && !t.closest('.img-chooser') && !t.closest('[data-insert="image"]')) {
    imgChooser.hidden = true;
  }
});

// ── 複数選択(本文ブロック) ──
// primary は単一 sel(既存の frame/drag/編集が依存)。multi は選択ブロックの data-src 開始オフセット集合。
// HTML要素ではなくオフセットを持つので rebuild で DOM が作り直されても [data-src^] で再解決できる。
const multi = new Set<number>();
const multiLayer = document.createElement('div');
multiLayer.className = 'multi-sel-layer';
multiLayer.setAttribute('aria-hidden', 'true');
deckRoot.appendChild(multiLayer);
function clearMultiOutlines(): void {
  multiLayer.replaceChildren();
}
function drawMultiOutlines(): void {
  clearMultiOutlines();
  if (!liveEdit || presenting || multi.size < 2) return;
  const dr = deckRoot.getBoundingClientRect();
  for (const start of multi) {
    const el = stage.querySelector<HTMLElement>(`.slide-body [data-src^="${start}-"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const o = document.createElement('div');
    o.className = 'multi-sel-box';
    o.style.left = `${r.left - dr.left}px`;
    o.style.top = `${r.top - dr.top}px`;
    o.style.width = `${r.width}px`;
    o.style.height = `${r.height}px`;
    multiLayer.appendChild(o);
  }
}

// ── 右クリック コンテキストメニュー ──
type CtxItem = { label: string; run?: () => void; disabled?: boolean; sub?: CtxItem[] } | 'sep';
const ctxMenu = document.createElement('div');
ctxMenu.className = 'ctx-menu';
ctxMenu.hidden = true;
deckRoot.appendChild(ctxMenu);
ctxMenu.addEventListener('pointerdown', (e) => e.stopPropagation());
ctxMenu.addEventListener('contextmenu', (e) => e.preventDefault());
// メニュー外(右のエディタ・上部ツールバー等 deckRoot 外も含む)を押したら閉じる。
// メニュー自身の pointerdown は上で stopPropagation 済みなので、ここには伝わらない。
document.addEventListener('pointerdown', () => closeCtxMenu());
function closeCtxMenu(): void {
  if (ctxMenu.hidden) return;
  ctxMenu.hidden = true;
  ctxMenu.replaceChildren();
}
function renderCtxItems(items: CtxItem[], into: HTMLElement): void {
  for (const it of items) {
    if (it === 'sep') {
      const s = document.createElement('div');
      s.className = 'ctx-sep';
      into.appendChild(s);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctx-item';
    b.textContent = it.label;
    if (it.disabled) b.disabled = true;
    if (it.sub && it.sub.length) {
      b.classList.add('has-sub');
      const sub = document.createElement('div');
      sub.className = 'ctx-sub';
      renderCtxItems(it.sub, sub);
      b.appendChild(sub);
    } else if (it.run) {
      const run = it.run;
      b.addEventListener('click', () => {
        run();
        closeCtxMenu();
      });
    }
    into.appendChild(b);
  }
}
function openContextMenu(target: 'block' | 'shape' | 'multi' | 'canvas', e: { clientX: number; clientY: number }): void {
  ctxMenu.replaceChildren();
  renderCtxItems(buildCtxItems(target), ctxMenu);
  ctxMenu.hidden = false;
  const dr = deckRoot.getBoundingClientRect();
  const x = Math.min(e.clientX - dr.left, dr.width - ctxMenu.offsetWidth - 6);
  const y = Math.min(e.clientY - dr.top, dr.height - ctxMenu.offsetHeight - 6);
  ctxMenu.style.left = `${Math.max(4, x)}px`;
  ctxMenu.style.top = `${Math.max(4, y)}px`;
  // メニューが右寄りのときは、サブメニューを左側に開いて画面外に切れないようにする。
  ctxMenu.classList.toggle('flip-sub', x + ctxMenu.offsetWidth + 160 > dr.width);
}

// 番号バッジのクリック → 対象ブロックを選択してブロック用メニューを開く(段組では actionable 無し)。
stepLayer.addEventListener('pointerdown', (e) => e.stopPropagation());
stepLayer.addEventListener('click', (e) => {
  const badge = (e.target as HTMLElement).closest<HTMLElement>('.step-badge.actionable');
  const start = /^(\d+)-/.exec(badge?.dataset.src ?? '')?.[1];
  if (start == null) return;
  const block = stage.querySelector<HTMLElement>(`.slide-body [data-src^="${start}-"]`);
  if (!block) return;
  multi.clear();
  selectBlock(block);
  drawMultiOutlines();
  openContextMenu('block', { clientX: e.clientX, clientY: e.clientY });
});

// 現在スライドの最大ライブステップ(番号付けの「次の番号」算出用)。
function slideMaxStep(): number {
  return (presenter.current()?.steps ?? []).reduce((m, s) => Math.max(m, s.step), 0);
}
// 段組(item-layout)は data-src を持つ per-block マーカーが書けない → 順番系を無効化。
function perBlockEnabled(): boolean {
  return !presenter.current()?.columns;
}

// 現在スライドに reveal 指定が無ければ manual を前置(番号を振ったら自動で段階表示に)。
// ブロックへのマーカー書き込みの「後」に呼ぶこと(directive 前置はスライド先頭=ブロック群より前で
// オフセットを動かすため、先に呼ぶと書き込み位置がずれる)。呼び出し側が persist/rebuild する。
function ensureSlideManual(): void {
  const deck = parseDeck(mdInput.value);
  const slide = deck.slides[presenter.index];
  if (!slide || slide.reveal !== 'none') return;
  const v = mdInput.value;
  const region = stripRevealDirectiveLines(v.slice(slide.srcStart, slide.srcEnd));
  mdInput.value = v.slice(0, slide.srcStart) + '<!-- reveal: manual -->\n' + region + v.slice(slide.srcEnd);
}

// 複数選択ブロックをまとめて同じ番号(step:N)にする。全メンバーに明示 step:N を書くので、
// 非連続の選択でも(間に別ブロックがあっても)確実に同じステップになる。降順オフセットで書く。
function groupSelection(): void {
  const offsets = [...multi].sort((a, b) => a - b);
  if (offsets.length < 2) return;
  const n = slideMaxStep() + 1;
  commitEdit();
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  for (let i = offsets.length - 1; i >= 0; i -= 1) {
    mdInput.value = setBlockMarker(mdInput.value, offsets[i]!, `step:${n}`);
  }
  ensureSlideManual(); // マーカー書込の後に(前置でオフセットがずれないように)
  multi.clear();
  persistMd();
  rebuild(true);
  toast('まとめて同時に表示します');
}
function ungroupSelection(): void {
  const offsets = [...multi].sort((a, b) => a - b);
  if (!offsets.length) return;
  commitEdit();
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  for (let i = offsets.length - 1; i >= 0; i -= 1) mdInput.value = setBlockMarker(mdInput.value, offsets[i]!, 'auto');
  multi.clear();
  persistMd();
  rebuild(true);
  toast('グループを解除しました');
}
// 複数選択ブロックをまとめて削除(降順で範囲削除。直前のマーカー行も巻き込む)。
function deleteMultiBlocks(): void {
  const ranges: Array<[number, number]> = [];
  for (const start of multi) {
    const el = stage.querySelector<HTMLElement>(`.slide-body [data-src^="${start}-"]`);
    if (el) ranges.push(rangeOf(el));
  }
  ranges.sort((a, b) => b[0] - a[0]);
  commitEdit();
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  for (const [s, e] of ranges) {
    const ds = deleteStartWithMarkers(mdInput.value, s);
    mdInput.value = mdInput.value.slice(0, ds) + mdInput.value.slice(e);
  }
  multi.clear();
  deselect();
  persistMd();
  rebuild(true);
}

// 図形の重なり順(配列順=描画順)を変える。
function reorderShape(id: string, where: 'front' | 'back' | 'up' | 'down'): void {
  const arr = overlay[curId()]?.shapes;
  if (!arr) return;
  const i = arr.findIndex((s) => s.id === id);
  if (i < 0) return;
  const [sh] = arr.splice(i, 1);
  if (!sh) return;
  const j = where === 'front' ? arr.length : where === 'back' ? 0 : where === 'up' ? Math.min(arr.length, i + 1) : Math.max(0, i - 1);
  arr.splice(j, 0, sh);
  saveOverlay(overlay);
  decorateStage();
}
function duplicateShape(id: string): void {
  const arr = overlay[curId()]?.shapes;
  const sh = arr?.find((s) => s.id === id);
  if (!arr || !sh) return;
  const copy = { ...sh, id: newId(), x: Math.min(97, sh.x + 3), y: Math.min(97, sh.y + 3) } as Shape;
  arr.push(copy);
  if (!saveOverlay(overlay)) {
    arr.pop();
    toast('保存できませんでした(容量超過の可能性)');
    return;
  }
  decorateStage();
  const el = stage.querySelector<HTMLElement>(`.ov-shape[data-sid="${copy.id}"]`);
  if (el) selectShape(el);
}

// コンテキストメニューの項目をターゲット別に組み立てる。
function buildCtxItems(target: 'block' | 'shape' | 'multi' | 'canvas'): CtxItem[] {
  if (target === 'canvas') {
    const noReveal = NO_REVEAL_LAYOUTS.includes(presenter.current()?.layout ?? '');
    const items: CtxItem[] = [
      { label: 'テキストボックスを追加', run: () => insertTextShape() },
      {
        label: '図形を追加…',
        sub: (['rect', 'ellipse', 'triangle', 'line', 'arrow'] as VectorKind[]).map((k) => ({
          label: shapeLabel(k),
          run: () => insertShape(k),
        })),
      },
      { label: '画像を追加…', run: () => openImagePicker() },
    ];
    if (!noReveal) {
      items.push('sep', {
        label: '段階表示…',
        sub: [
          { label: 'なし', run: () => setSlideReveal('none') },
          { label: '順番に(上から)', run: () => setSlideReveal('sequential') },
          { label: '要点を先に', run: () => setSlideReveal('key-first') },
          { label: '番号で指定(手動)', run: () => setSlideReveal('manual') },
        ],
      });
    }
    return items;
  }
  if (target === 'shape') {
    const sh = sel?.kind === 'shape' ? findShape(sel.id) : undefined;
    const id = sel?.kind === 'shape' ? sel.id : '';
    const items: CtxItem[] = [{ label: '複製する', run: () => duplicateShape(id) }];
    if (sh && isTextShape(sh)) items.push({ label: 'テキストを編集', run: () => enterEditText(sel!.el, id) });
    items.push(
      'sep',
      { label: '最前面へ', run: () => reorderShape(id, 'front') },
      { label: '前面へ', run: () => reorderShape(id, 'up') },
      { label: '背面へ', run: () => reorderShape(id, 'down') },
      { label: '最背面へ', run: () => reorderShape(id, 'back') },
      'sep',
      { label: '削除する', run: () => deleteSelection() },
    );
    return items;
  }
  if (target === 'multi') {
    return [
      { label: `まとめて同時に出す(${multi.size}件)`, run: () => groupSelection(), disabled: !perBlockEnabled() },
      { label: 'グループを解除', run: () => ungroupSelection(), disabled: !perBlockEnabled() },
      'sep',
      { label: '選択をまとめて削除', run: () => deleteMultiBlocks() },
    ];
  }
  // block
  const start = sel?.kind === 'block' ? rangeOf(sel.el)[0] : -1;
  const canMark = perBlockEnabled() && start >= 0;
  const maxN = slideMaxStep();
  const nums: CtxItem[] = [];
  for (let i = 1; i <= Math.max(1, maxN) + 1; i += 1) {
    const n = i;
    nums.push({ label: n === maxN + 1 ? `${n}(次の番号)` : `${n}`, run: () => applyBlockMarker(start, `step:${n}`) });
  }
  return [
    { label: '文字を編集', run: () => enterEditBlock(sel!.el) },
    'sep',
    { label: '順番を付ける…', sub: nums, disabled: !canMark },
    { label: '直前と同時に出す', run: () => applyBlockMarker(start, 'group'), disabled: !canMark },
    { label: '要点として先に出す', run: () => applyBlockMarker(start, 'key'), disabled: !canMark },
    { label: 'ずっと表示する', run: () => applyBlockMarker(start, 'pin'), disabled: !canMark },
    { label: 'この順番から外す', run: () => applyBlockMarker(start, 'auto'), disabled: !canMark },
    'sep',
    { label: 'このブロックを削除', run: () => deleteSelection() },
  ];
}

// 対象ブロックの直前にマーカーを書き込み(または除去)、再描画する。
function applyBlockMarker(blockStart: number, marker: BlockMarker): void {
  commitEdit();
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  mdInput.value = setBlockMarker(mdInput.value, blockStart, marker);
  if (marker !== 'auto') ensureSlideManual(); // 番号/グループ/要点/常時表示を付けたら段階表示を自動ON(manual)
  persistMd();
  rebuild(true);
  const msg = marker === 'auto'
    ? 'このブロックを通常に戻しました'
    : marker === 'key'
      ? 'このブロックを要点にしました'
      : marker === 'group'
        ? '直前と同時に表示します'
        : marker === 'pin'
          ? '常に表示します'
          : `${marker.replace('step:', '')}番目に表示します`;
  toast(msg);
}

// 現在スライドの段階表示モードを Markdown のディレクティブとして設定する。
function setSlideReveal(mode: RevealMode): void {
  commitEdit(); // 進行中のテキスト編集を overlay に確定してから再描画(未確定テキストの消失を防ぐ)
  // parseDeck は \n 正規化後のオフセットを返す。textarea に \r が残っていると slice がずれるので揃える。
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  const deck = parseDeck(mdInput.value);
  const slide = deck.slides[presenter.index];
  if (!slide) return;
  const v = mdInput.value;
  const start = slide.srcStart;
  const end = slide.srcEnd;
  // 既存の reveal / incremental / fragment ディレクティブ行を取り除く(フェンス内の例示は残す)。先頭の空行も保つ。
  let region = stripRevealDirectiveLines(v.slice(start, end));
  if (mode !== 'none') region = `<!-- reveal: ${mode} -->\n` + region;
  mdInput.value = v.slice(0, start) + region + v.slice(end);
  persistMd();
  rebuild(true);
  toast(
    mode === 'none'
      ? '段階表示をオフにしました'
      : mode === 'key-first'
        ? '段階表示: 要点を先に'
        : mode === 'manual'
          ? '段階表示: 番号で指定'
          : '段階表示: 順番に',
  );
}

// 段階表示バッジ(専用レイヤ)を空にする。
function clearStepBadges(): void {
  stepLayer.replaceChildren();
}

// 現在スライドの段階表示モード。表示は「書かれた指定」に合わせる(段組系で key-first が内部的に
// sequential へ降格されても、ユーザーが押したボタンを正しく光らせる。降格は挙動上 sequential と同義)。
// 行全体がコメントの行だけを directive とみなす(パーサと一致。本文中の文字列リテラルで誤検出しない)。
function currentRevealMode(): RevealMode {
  const cur = presenter.current();
  let mode: RevealMode = cur?.reveal ?? 'none';
  if (cur) {
    const src = mdInput.value.slice(cur.srcStart, cur.srcEnd);
    if (/^[ \t]*<!--[ \t]*reveal[ \t]*:[ \t]*key-first[ \t]*-->[ \t]*$/im.test(src)) mode = 'key-first';
    else if (/^[ \t]*<!--[ \t]*(?:incremental|reveal[ \t]*:[ \t]*sequential)[ \t]*-->[ \t]*$/im.test(src)) mode = 'sequential';
  }
  return mode;
}

// 各 [data-step] ブロックの位置を実測し、専用レイヤに番号バッジを左上隅へ重ねる。
// レイヤは deckRoot 直下なので段組の overflow:hidden でも切れず、本文にも混入しない。
function positionStepBadges(): void {
  clearStepBadges();
  if (!liveEdit || presenting) return;
  const mode = currentRevealMode();
  if (mode === 'none') return;
  const manual = mode === 'manual';
  const dr = deckRoot.getBoundingClientRect();
  // フロー(段組でない)スライドでは、バッジをクリックして各ブロックの役割を設定できる。
  const actionable = !presenter.current()?.columns;
  for (const el of stage.querySelectorAll<HTMLElement>('.slide-body [data-step]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // 非表示要素は飛ばす
    const s = Number(el.dataset.step) || 0;
    // manual モードの無印ブロック(step0)はチップを出さない(半完成スライドが「常」だらけにならない)。
    if (manual && s === 0) continue;
    const badge = document.createElement('span');
    badge.className = 'step-badge';
    badge.textContent = s === 0 ? '常' : String(s);
    if (actionable && el.dataset.src) {
      badge.classList.add('actionable');
      badge.dataset.src = el.dataset.src; // ブロックの原文範囲(右クリックメニューで対象ブロックを解決)
      badge.title = 'クリックで段階表示の設定';
    }
    stepLayer.appendChild(badge);
    // バッジの実寸を測り、ブロック左上の角に少しはみ出して載せる(通知バッジ風。本文に被りにくい)。
    // 端ぴったりのブロック(full レイアウト等)で負座標になると deckRoot の overflow/角丸で切れるため 0 以上に。
    const bw = badge.offsetWidth || 18;
    const bh = badge.offsetHeight || 18;
    badge.style.left = `${Math.max(0, r.left - dr.left - bw * 0.35)}px`;
    badge.style.top = `${Math.max(0, r.top - dr.top - bh * 0.35)}px`;
  }
}

// 段階表示に対応しないレイアウト(これらは reveal を常に none に落とす)。バーを出さない。
const NO_REVEAL_LAYOUTS = ['quote', 'section', 'image-left', 'image-right'];
function updateRevealUi(): void {
  // 段階表示の操作は右クリックメニュー+番号バッジに集約(下部バーは廃止)。ここではバッジの更新のみ。
  positionStepBadges();
}

function slideEl(): HTMLElement | null {
  return stage.querySelector<HTMLElement>('.slide');
}

// 現在スライドの overlay キー(安定ID)。無指定なら ''(= overlay 無し扱い)。
function curId(): string {
  return presenter.current()?.id ?? '';
}
// 現在スライドに安定IDが無ければ生成して <!-- id: xxx --> を本文先頭に書き、再描画して返す。
// 図形を追加するときに呼ぶ(スライドを並べ替え/削除しても図形が追従するようにする)。
function ensureCurrentSlideId(): string {
  const cur = presenter.current();
  if (!cur) return '';
  if (cur.id) return cur.id;
  const id = newId();
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  const fresh = parseDeck(mdInput.value).slides[presenter.index];
  if (!fresh) return '';
  mdInput.value = mdInput.value.slice(0, fresh.srcStart) + `<!-- id: ${id} -->\n` + mdInput.value.slice(fresh.srcStart);
  persistMd();
  rebuild(true);
  return id;
}

function findShape(id: string): Shape | undefined {
  return overlay[curId()]?.shapes.find((s) => s.id === id);
}

// 選択中の図形の現在の箱(%)。図形がなければ無難な既定値。
function currentBox(id: string): Box {
  const sh = findShape(id);
  return sh ? { x: sh.x, y: sh.y, w: sh.w, h: sh.h } : { x: 0, y: 0, w: 10, h: 10 };
}

// ── スナップ(整列ガイド) ──
const SNAP_T = 1.4; // 吸着のしきい値(%)
function clearSnapGuides(): void {
  snapLayer.replaceChildren();
}
// 基準線: スライドの 0/50/100 と、自分以外の図形の左右上下と中心。
function snapTargets(dragId: string): { xs: number[]; ys: number[] } {
  const xs = [0, 50, 100];
  const ys = [0, 50, 100];
  for (const s of overlay[curId()]?.shapes ?? []) {
    if (s.id === dragId) continue;
    xs.push(s.x, s.x + s.w / 2, s.x + s.w);
    ys.push(s.y, s.y + s.h / 2, s.y + s.h);
  }
  return { xs, ys };
}
// 1本のガイド線を、スライド領域の実寸に合わせて配置する。
function makeGuide(kind: 'v' | 'h', pct: number): HTMLElement {
  const g = document.createElement('div');
  g.className = `snap-guide snap-${kind}`;
  const sr = (slideEl() ?? stage).getBoundingClientRect();
  const dr = deckRoot.getBoundingClientRect();
  if (kind === 'v') {
    g.style.left = `${sr.left - dr.left + (pct / 100) * sr.width}px`;
    g.style.top = `${sr.top - dr.top}px`;
    g.style.height = `${sr.height}px`;
  } else {
    g.style.top = `${sr.top - dr.top + (pct / 100) * sr.height}px`;
    g.style.left = `${sr.left - dr.left}px`;
    g.style.width = `${sr.width}px`;
  }
  return g;
}
// 移動中の箱を基準線へ吸着し、合った線をガイド表示して返す(move 用)。
type SnapHit = { d: number; shift: number; line: number } | null;
function bestSnap(edges: Array<[number, number]>, base: number, targets: number[]): SnapHit {
  let best: SnapHit = null;
  for (const [v, off] of edges) {
    for (const t of targets) {
      const d = Math.abs(v - t);
      if (d <= SNAP_T && (!best || d < best.d)) best = { d, shift: t - off - base, line: t };
    }
  }
  return best;
}
function snapMove(box: Box, dragId: string): Box {
  const { xs, ys } = snapTargets(dragId);
  const bestX = bestSnap(
    [
      [box.x, 0],
      [box.x + box.w / 2, box.w / 2],
      [box.x + box.w, box.w],
    ],
    box.x,
    xs,
  );
  const bestY = bestSnap(
    [
      [box.y, 0],
      [box.y + box.h / 2, box.h / 2],
      [box.y + box.h, box.h],
    ],
    box.y,
    ys,
  );
  const out = { ...box };
  const guides: HTMLElement[] = [];
  if (bestX) {
    out.x = box.x + bestX.shift;
    guides.push(makeGuide('v', bestX.line));
  }
  if (bestY) {
    out.y = box.y + bestY.shift;
    guides.push(makeGuide('h', bestY.line));
  }
  snapLayer.replaceChildren(...guides);
  return out;
}

function positionFrame(): void {
  if (!sel || !liveEdit || presenting || editingBlock) {
    frame.hidden = true;
    return;
  }
  const dr = deckRoot.getBoundingClientRect();
  const er = sel.el.getBoundingClientRect();
  frame.style.left = `${er.left - dr.left}px`;
  frame.style.top = `${er.top - dr.top}px`;
  frame.style.width = `${er.width}px`;
  frame.style.height = `${er.height}px`;
  frame.dataset.kind = sel.kind; // CSS: block=枠のみ / shape=8ハンドル付き
  frame.hidden = false;
}

function selectBlock(el: HTMLElement): void {
  sel = { kind: 'block', el };
  positionFrame();
}
function selectShape(el: HTMLElement): void {
  sel = { kind: 'shape', el, id: el.dataset.sid ?? '' };
  positionFrame();
}
function deselect(): void {
  sel = null;
  frame.hidden = true;
  multi.clear();
  clearMultiOutlines();
}

// 箱を選択中の図形へ反映(overlayデータと要素スタイル両方)。図形(shape)専用。
function applyBox(box: Box): void {
  if (sel?.kind !== 'shape') return;
  const sh = findShape(sel.id);
  if (sh) {
    sh.x = box.x;
    sh.y = box.y;
    sh.w = box.w;
    sh.h = box.h;
  }
  sel.el.style.left = `${box.x}%`;
  sel.el.style.top = `${box.y}%`;
  sel.el.style.width = `${box.w}%`;
  sel.el.style.height = `${box.h}%`;
  positionFrame();
}

function resizeBox(b: Box, handle: string, dx: number, dy: number): Box {
  const MIN = 3; // clampBox と同じ最小%。これ未満に潰さない。
  const r = { ...b };
  // 各ハンドルは「反対側の辺」を固定する。動かす辺をスライド枠(0–100)と最小サイズの範囲に
  // 収めたうえで寸法を逆算するので、壁際でも固定辺が動かず(後段の clampBox でも揺れない)。
  if (handle.includes('e')) {
    // 左端固定 → 右端を [x+MIN, 100] に。
    r.w = Math.max(MIN, Math.min(b.w + dx, 100 - b.x));
  }
  if (handle.includes('s')) {
    r.h = Math.max(MIN, Math.min(b.h + dy, 100 - b.y));
  }
  if (handle.includes('w')) {
    // 右端固定 → 左端を [0, right-MIN] に収め、幅は右端から逆算。
    const right = b.x + b.w;
    const nx = Math.max(0, Math.min(b.x + dx, right - MIN));
    r.x = nx;
    r.w = right - nx;
  }
  if (handle.includes('n')) {
    // 下端固定 → 上端を [0, bottom-MIN] に収め、高さは下端から逆算。
    const bottom = b.y + b.h;
    const ny = Math.max(0, Math.min(b.y + dy, bottom - MIN));
    r.y = ny;
    r.h = bottom - ny;
  }
  return r;
}

let drag: {
  mode: 'move' | 'resize';
  handle: string;
  startX: number;
  startY: number;
  box: Box;
  moved: boolean;
  reselect: boolean;
} | null = null;
// 1ジェスチャ中に図形を実際に動かしたか(スワイプ移動と区別するため)。
let draggedThisGesture = false;

// コードブロックのコピーボタン。キャプチャ段でブロック選択(下の pointerdown)より先に処理する。
// 発表中・直接編集中を問わず使え、stopPropagation で選択/編集の発火を防ぐ。
deckRoot.addEventListener(
  'pointerdown',
  (e) => {
    const btn = (e.target as HTMLElement).closest?.('.code-copy');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const code = btn.closest('.code-block')?.querySelector('code');
    const text = code?.textContent ?? '';
    if (!text) return;
    const ok = (): void => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1200);
      toast('コードをコピーしました');
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(ok, () => toast('コピーできませんでした'));
    } else {
      toast('コピーできませんでした');
    }
  },
  true,
);

deckRoot.addEventListener('pointerdown', (e) => {
  if (!liveEdit || presenting) return;
  if (e.button !== 0) return; // 右クリック等は contextmenu に任せる(選択や複数選択を壊さない)
  closeCtxMenu(); // キャンバス操作で右クリックメニューを閉じる(メニュー自身は伝播停止済み)
  if (drag) return; // 進行中のドラッグ中は二本目以降のポインタを無視
  let t = e.target as HTMLElement;
  // 編集中に外側を押したら確定。確定で再描画/図形再生成が起きて元の要素が切り離されるので、
  // ブロック編集・テキスト箱編集のどちらでも、押した座標から要素を取り直す。
  if (editingBlock && !editingBlock.contains(t)) {
    commitEdit();
    // commit でテキスト箱の選択枠が再表示されることがある。直後の座標解決が旧枠のハンドルを
    // 拾って誤ってリサイズを始めないよう、いったん枠を隠してから本当の対象を取り直す。
    frame.hidden = true;
    t = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null) ?? t;
  }
  // 編集中の要素の内側を押したときは素通し。caret配置・テキスト選択はブラウザに任せ、
  // 余計な preventDefault や図形ドラッグを起こさない(編集中は選択枠が隠れハンドルも無い)。
  if (editingBlock && editingBlock.contains(t)) return;
  // 図形のリサイズハンドル(図形選択中のみ)。
  const handle = t.closest<HTMLElement>('.sel-h');
  if (handle && sel?.kind === 'shape') {
    e.preventDefault();
    drag = { mode: 'resize', handle: handle.dataset.h ?? '', startX: e.clientX, startY: e.clientY, box: currentBox(sel.id), moved: false, reselect: false };
    deckRoot.setPointerCapture(e.pointerId);
    return;
  }
  // 自由配置の図形/テキスト/画像 → 選択して移動ドラッグ開始。
  const shape = t.closest<HTMLElement>('.ov-shape');
  if (shape) {
    e.preventDefault();
    multi.clear(); // 図形選択は本文ブロックの複数選択を解除(混在しない)
    clearMultiOutlines();
    const id = shape.dataset.sid ?? '';
    const was = sel?.kind === 'shape' && sel.id === id;
    selectShape(shape);
    drag = { mode: 'move', handle: '', startX: e.clientX, startY: e.clientY, box: currentBox(id), moved: false, reselect: was };
    deckRoot.setPointerCapture(e.pointerId);
    return;
  }
  // Markdown ブロック → 選択(枠のみ)。Shift/Cmd/Ctrl で複数選択トグル。再度押したら文字編集へ。
  const block = t.closest<HTMLElement>('.slide-body [data-src]');
  if (block) {
    e.preventDefault();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      if (sel?.kind === 'block') multi.add(rangeOf(sel.el)[0]); // 既存 primary も集合へ
      const [bstart] = rangeOf(block);
      if (multi.has(bstart)) multi.delete(bstart);
      else multi.add(bstart);
      if (multi.size <= 1) multi.clear();
      selectBlock(block);
      drawMultiOutlines();
      return;
    }
    multi.clear();
    clearMultiOutlines();
    if (sel?.kind === 'block' && sel.el === block) enterEditBlock(block, { x: e.clientX, y: e.clientY });
    else selectBlock(block);
    return;
  }
  // どれにも当たらない。直接編集に未対応なレイアウトのテキストなら案内する。
  if (t.closest('.stage')) {
    const s = slideEl();
    if (t.closest('.slide-body') && s && !s.querySelector('[data-src]')) {
      toast('このレイアウトの文字は Markdownエディタ(E)で編集できます');
    }
    deselect();
  }
});

// 右クリック → 文脈に応じたメニュー。ライブ編集外・編集中テキストはブラウザ標準メニューを残す。
deckRoot.addEventListener('contextmenu', (e) => {
  if (!liveEdit || presenting) return;
  const t = e.target as HTMLElement;
  if (editingBlock && editingBlock.contains(t)) return;
  const shape = t.closest<HTMLElement>('.ov-shape');
  const block = t.closest<HTMLElement>('.slide-body [data-src]');
  if (shape) {
    e.preventDefault();
    multi.clear();
    clearMultiOutlines();
    selectShape(shape);
    openContextMenu('shape', e);
  } else if (block) {
    e.preventDefault();
    const [bstart] = rangeOf(block);
    if (multi.size >= 2 && multi.has(bstart)) {
      openContextMenu('multi', e); // 既存の複数選択を保ったままグループ操作
    } else {
      multi.clear();
      clearMultiOutlines();
      selectBlock(block);
      openContextMenu('block', e);
    }
  } else if (t.closest('.stage')) {
    e.preventDefault();
    deselect();
    openContextMenu('canvas', e);
  }
});

deckRoot.addEventListener('pointermove', (e) => {
  if (!drag || sel?.kind !== 'shape') return;
  const sr = (slideEl() ?? stage).getBoundingClientRect();
  const dx = ((e.clientX - drag.startX) / sr.width) * 100;
  const dy = ((e.clientY - drag.startY) / sr.height) * 100;
  if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
    drag.moved = true;
    draggedThisGesture = true;
  }
  let box: Box;
  if (drag.mode === 'move') {
    box = { ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy };
    // Cmd/Ctrl/Alt を押している間はスナップ無効。それ以外は中心・端・他図形に吸着しガイド表示。
    if (e.metaKey || e.ctrlKey || e.altKey) clearSnapGuides();
    else box = snapMove(box, sel.id);
    box = clampBox(box);
  } else {
    clearSnapGuides();
    box = resizeBox(drag.box, drag.handle, dx, dy);
    const sh = findShape(sel.id);
    box =
      sh && isImageShape(sh) && typeof sh.ar === 'number' && Number.isFinite(sh.ar) && sh.ar > 0 && !e.shiftKey
        ? lockAspect(drag.box, box, drag.handle, sh.ar)
        : clampBox(box);
  }
  applyBox(box);
});

function endDrag(e: PointerEvent): void {
  if (!drag) return;
  clearSnapGuides();
  try {
    deckRoot.releasePointerCapture(e.pointerId);
  } catch {
    // capture が無くても無視
  }
  const clicked = !drag.moved;
  const reselect = drag.reselect;
  const mode = drag.mode;
  drag = null;
  if (clicked) {
    // 移動なしのクリック: 既選択のテキスト図形を再クリック → 文字編集へ。
    if (mode === 'move' && reselect && sel?.kind === 'shape') {
      const sh = findShape(sel.id);
      if (sh && isTextShape(sh)) enterEditText(sel.el, sel.id);
    }
  } else if (!saveOverlay(overlay)) {
    toast('保存できませんでした(容量超過の可能性)');
  }
}
deckRoot.addEventListener('pointerup', endDrag);
deckRoot.addEventListener('pointercancel', endDrag);
deckRoot.addEventListener('lostpointercapture', () => {
  if (drag) {
    if (drag.moved) saveOverlay(overlay);
    drag = null;
    clearSnapGuides();
  }
});

// 画像の縦横比固定リサイズ。掴んだハンドルが動かす辺で寸法を決め、反対側を固定し、枠内に収める。
function lockAspect(start: Box, box: Box, handle: string, ar: number): Box {
  const ratioH = 16 / 9 / ar; // 幅%あたりの高さ%
  const horiz = handle.includes('e') || handle.includes('w');
  const vert = handle.includes('n') || handle.includes('s');
  let w = box.w;
  let h = box.h;
  if (vert && !horiz) {
    w = h / ratioH; // 縦辺は高さ駆動
  } else {
    h = w * ratioH; // 横辺・角は幅駆動
  }
  const anchorX: 'l' | 'r' | 'c' = handle.includes('w') ? 'r' : handle.includes('e') ? 'l' : 'c';
  const anchorY: 't' | 'b' | 'c' = handle.includes('n') ? 'b' : handle.includes('s') ? 't' : 'c';
  let x = start.x;
  let y = start.y;
  if (anchorX === 'r') x = start.x + start.w - w;
  else if (anchorX === 'c') x = start.x + start.w / 2 - w / 2;
  if (anchorY === 'b') y = start.y + start.h - h;
  else if (anchorY === 'c') y = start.y + start.h / 2 - h / 2;
  return fitBoxKeepingAspect({ ...box, x, y, w, h }, anchorX, anchorY);
}

deckRoot.addEventListener('dblclick', (e) => {
  if (!liveEdit || presenting) return;
  const t = e.target as HTMLElement;
  const block = t.closest<HTMLElement>('.slide-body [data-src]');
  if (block) {
    selectBlock(block);
    enterEditBlock(block, { x: e.clientX, y: e.clientY });
    return;
  }
  const shape = t.closest<HTMLElement>('.ov-shape');
  const id = shape?.dataset.sid;
  if (shape && id) {
    const sh = findShape(id);
    if (sh && isTextShape(sh)) {
      selectShape(shape);
      enterEditText(shape, id);
    }
  }
});

// ── 文字編集(contenteditable)。view → md を即時反映 ──
function editTargets(block: HTMLElement): HTMLElement[] {
  if (block.tagName === 'TABLE') return Array.from(block.querySelectorAll<HTMLElement>('th, td'));
  if (block.tagName === 'PRE') return Array.from(block.querySelectorAll<HTMLElement>('code'));
  return [block];
}

// クリック/タップした座標にキャレットを落とす(対応ブラウザのみ)。座標が編集可能ターゲットの
// 内側に解決できたときだけ適用し、そのターゲットへフォーカスを合わせる。コードのパディングや
// 言語ラベル・表の枠など編集不可領域に落ちた場合は既定のキャレット(focus直後)を保つ。
function placeCaretAtPoint(x: number, y: number, targets: HTMLElement[]): void {
  const s = window.getSelection();
  if (!s) return;
  type CaretDoc = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const d = document as CaretDoc;
  let range: Range | null = null;
  if (d.caretRangeFromPoint) {
    range = d.caretRangeFromPoint(x, y);
  } else if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (p) {
      range = document.createRange();
      range.setStart(p.offsetNode, p.offset);
      range.collapse(true);
    }
  }
  if (!range) return;
  const host = targets.find((t) => t.contains(range.startContainer));
  if (!host) return; // 編集可能領域の外に落ちた → 既定キャレットのまま(打鍵消失を防ぐ)
  host.focus(); // キャレットのあるセル/要素へフォーカス(表のハイライト不一致も解消)
  s.removeAllRanges();
  s.addRange(range);
}

// md ブロックのその場編集に入る。押した座標があればそこへキャレットを置く(先頭固定を避ける)。
function enterEditBlock(block: HTMLElement, caretAt?: { x: number; y: number }): void {
  if (editingBlock === block) return;
  commitEdit();
  const targets = editTargets(block);
  for (const t of targets) {
    t.setAttribute('contenteditable', 'true');
    t.spellcheck = false;
  }
  editingBlock = block;
  editingKind = 'block';
  [editStart, editEnd] = rangeOf(block);
  deckRoot.classList.add('editing');
  frame.hidden = true;
  (targets[0] ?? block).focus();
  if (caretAt) placeCaretAtPoint(caretAt.x, caretAt.y, targets);
}

// テキスト図形の文字編集に入る(内容は overlay に保存。md は触らない)。
function enterEditText(shapeEl: HTMLElement, id: string): void {
  commitEdit();
  const fresh = stage.querySelector<HTMLElement>(`.ov-shape[data-sid="${id}"]`) ?? shapeEl;
  const tx = fresh.querySelector<HTMLElement>('.ov-text');
  if (!tx) return;
  const sh = findShape(id);
  const wasEmpty = !!(sh && isTextShape(sh) && sh.text.trim() === '');
  if (wasEmpty) tx.textContent = ''; // プレースホルダを消す
  tx.setAttribute('contenteditable', 'true');
  tx.spellcheck = false;
  sel = { kind: 'shape', el: fresh, id };
  editingBlock = tx;
  editingKind = 'text';
  editingShapeId = id;
  deckRoot.classList.add('editing');
  frame.hidden = true;
  tx.focus();
  // 既存文字はキャレットを末尾に置く(全選択して1打目で全消しになる事故を防ぐ)。空箱だけ先頭に。
  const r = document.createRange();
  r.selectNodeContents(tx);
  r.collapse(wasEmpty ? true : false);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

function textOf(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '');
}

function commitEdit(): void {
  if (!editingBlock) {
    flushView();
    return;
  }
  if (editingKind === 'text') {
    editingBlock.removeAttribute('contenteditable');
    const sh = findShape(editingShapeId);
    if (sh && isTextShape(sh)) {
      sh.text = textOf(editingBlock);
      saveOverlay(overlay);
    }
    editingBlock = null;
    deckRoot.classList.remove('editing');
    decorateStage();
    return;
  }
  for (const t of editTargets(editingBlock)) t.removeAttribute('contenteditable');
  editingBlock.removeAttribute('contenteditable');
  editingBlock = null;
  deckRoot.classList.remove('editing');
  flushView();
}

stage.addEventListener('input', () => {
  if (!editingBlock || !liveEdit) return;
  if (editingKind === 'text') return; // テキスト図形は commit 時にまとめて反映
  const md = blockToMd(editingBlock);
  const delta = md.length - (editEnd - editStart);
  const v = mdInput.value;
  mdInput.value = v.slice(0, editStart) + md + v.slice(editEnd);
  // 後続ブロックのオフセットを delta ぶんずらし、再描画せずに整合を保つ。
  stage.querySelectorAll<HTMLElement>('[data-src]').forEach((b) => {
    if (b === editingBlock) return;
    const [bs, be] = rangeOf(b);
    if (bs >= editEnd) setRange(b, bs + delta, be + delta);
  });
  setRange(editingBlock, editStart, editStart + md.length);
  editEnd = editStart + md.length;
  viewDirty = true;
  persistMd();
});

stage.addEventListener('focusout', () => {
  window.setTimeout(() => {
    if (editingBlock && !editingBlock.contains(document.activeElement)) commitEdit();
  }, 120);
});

// view側の編集をまだ原文に取り込んでいなければ取り込み、再パースして全体を同期する。
function flushView(): void {
  if (!viewDirty) return;
  viewDirty = false;
  rebuild(true);
}

// ── 挿入(テキストは md へ、図形は overlay のみ)──
function defaultShapeBox(kind: VectorKind): Box {
  if (kind === 'line' || kind === 'arrow') return { x: 28, y: 47, w: 44, h: 6 };
  if (kind === 'ellipse') return { x: 34, y: 33, w: 32, h: 30 };
  return { x: 34, y: 33, w: 32, h: 28 };
}

function insertShape(kind: VectorKind): void {
  const o = ensureSlide(overlay, ensureCurrentSlideId());
  const shape: Shape = { id: newId(), kind, ...defaultShapeBox(kind) };
  o.shapes.push(shape);
  if (!saveOverlay(overlay)) toast('保存できませんでした(容量超過の可能性)'); // 他の挿入経路と同じく失敗を通知
  decorateStage();
  const el = stage.querySelector<HTMLElement>(`.ov-shape[data-sid="${shape.id}"]`);
  if (el) selectShape(el);
}

// ── 画像のインポート(インライン=Markdown / 自由配置=オーバーレイ)──
const MAX_IMG_BYTES = 8 * 1024 * 1024; // これを超える画像は localStorage を壊すので拒否
const WARN_IMG_BYTES = 2.5 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('読み込み失敗'));
    r.readAsDataURL(file);
  });
}

async function importImageFile(file: File, mode: 'free' | 'inline', at?: { x: number; y: number }): Promise<void> {
  if (!file.type.startsWith('image/')) {
    toast('画像ファイルではありません');
    return;
  }
  if (file.size > MAX_IMG_BYTES) {
    toast('画像が大きすぎます(8MBまで)。縮小してから取り込んでください');
    return;
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    if (mode === 'inline') addInlineImage(dataUrl, file.name.replace(/\.[^.]+$/, ''));
    else addFreeImage(dataUrl, '', at);
    if (file.size > WARN_IMG_BYTES) toast('大きめの画像です。保存できない場合は縮小してください');
  } catch {
    toast('画像の読み込みに失敗しました');
  }
}

// 画像の自然な縦横比から、16:9スライド上での箱(%)を作る。正方形は正方形に見える。
function imageBox(ar: number, at?: { x: number; y: number }): Box {
  const a = ar > 0 ? ar : 1;
  let w = 40;
  let h = (w * (16 / 9)) / a;
  // 縦長で枠を超える場合は、縦横比を保ったまま幅を縮める(切り抜きを防ぐ)。
  if (h > 92) {
    h = 92;
    w = (h * a * 9) / 16;
  }
  const x = at ? at.x - w / 2 : (100 - w) / 2;
  const y = at ? at.y - h / 2 : (100 - h) / 2;
  return clampBox({ x, y, w, h });
}

function addFreeImage(src: string, alt: string, at?: { x: number; y: number }): void {
  const sid = ensureCurrentSlideId(); // 配置先スライドの安定IDを確定(非同期ロード後に移動しても追従)
  const probe = new Image();
  const place = (ar: number): void => {
    if (!sid) return;
    const o = ensureSlide(overlay, sid);
    const box = imageBox(ar, at);
    const shape: ImageShape = { id: newId(), kind: 'image', src, alt, ar, ...box };
    o.shapes.push(shape);
    if (!saveOverlay(overlay)) {
      o.shapes.pop();
      toast('保存容量を超えました。画像を縮小するか、数を減らしてください');
      return;
    }
    // 配置先スライドを今表示しているときだけ再描画して選択する(移動済みなら保存だけ)。
    if (curId() === sid) {
      decorateStage();
      const el = stage.querySelector<HTMLElement>(`.ov-shape[data-sid="${shape.id}"]`);
      if (el) selectShape(el);
    }
    toast('画像を配置しました');
  };
  probe.onload = () => {
    // 高さ0(viewBox無しSVG等)だと比が Infinity になり、リサイズで箱が爆発する。有限・正のみ採用。
    const raw = probe.naturalWidth / probe.naturalHeight;
    place(Number.isFinite(raw) && raw > 0 ? raw : 1);
  };
  probe.onerror = () => place(1);
  probe.src = src;
}

function addInlineImage(dataUrl: string, alt: string): void {
  const deck = parseDeck(mdInput.value);
  const slide = deck.slides[presenter.index];
  const lines = slide?.bodyLines ?? [];
  const at = lines.length
    ? lines[lines.length - 1]!.offset + lines[lines.length - 1]!.text.length
    : mdInput.value.length;
  const before = mdInput.value.slice(0, at);
  // alt に ] や ) が混ざると画像記法が壊れるので無害化する。
  const safeAlt = alt.replace(/[[\]()\n`]/g, ' ').trim();
  const md = `![${safeAlt}](${dataUrl})`;
  mdInput.value = before + (before === '' || before.endsWith('\n') ? '\n' : '\n\n') + md + mdInput.value.slice(at);
  persistMd();
  rebuild(true);
  toast('Markdown に画像を挿入しました');
}

// 自由配置のテキストボックスを追加(overlay。Markdown には書き込まない)。
function insertTextShape(): void {
  const o = ensureSlide(overlay, ensureCurrentSlideId());
  const shape: Shape = { id: newId(), kind: 'text', text: '', x: 30, y: 42, w: 40, h: 16 };
  o.shapes.push(shape);
  if (!saveOverlay(overlay)) {
    o.shapes.pop();
    toast('保存できませんでした(容量超過の可能性)');
    return;
  }
  decorateStage();
  const el = stage.querySelector<HTMLElement>(`.ov-shape[data-sid="${shape.id}"]`);
  if (el) {
    selectShape(el);
    enterEditText(el, shape.id);
  }
}

function deleteSelection(): void {
  if (!sel) return;
  if (sel.kind === 'shape') {
    const id = sel.id;
    const o = ensureSlide(overlay, curId());
    o.shapes = o.shapes.filter((s) => s.id !== id);
    saveOverlay(overlay);
    deselect();
    decorateStage();
    return;
  }
  // ブロック: md本文から該当範囲を除去する。直前の段階表示マーカー行も巻き込む(次へ継承させない)。
  const [start0, e0] = rangeOf(sel.el);
  const v0 = v0Normalized();
  const start = deleteStartWithMarkers(v0, start0);
  let end = e0;
  if (v0[end] === '\n') end += 1;
  if (v0[end] === '\n') end += 1;
  // 先頭スライドを空にする削除では、直後に残る区切り --- も一緒に消す
  // (先頭に --- が残ると以降がフロントマターと誤認され、スライドが崩れるため)。
  if (start === 0) {
    const m = /^[ \t]*\n*[ \t]*---[ \t]*(\n|$)/.exec(v0.slice(end));
    if (m) end += m[0].length;
  }
  mdInput.value = v0.slice(0, start) + v0.slice(end);
  persistMd();
  deselect();
  rebuild(true);
}
// 改行を正規化した現在の Markdown(オフセット系の操作で \r ずれを防ぐ)。
function v0Normalized(): string {
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  return mdInput.value;
}

// 矢印キーでの微調整は自由配置の図形のみ(ブロックはレイアウトが配置)。
function nudge(key: string, big: boolean): void {
  if (sel?.kind !== 'shape') return;
  const step = big ? 5 : 1;
  const b = currentBox(sel.id);
  if (key === 'ArrowLeft') b.x -= step;
  else if (key === 'ArrowRight') b.x += step;
  else if (key === 'ArrowUp') b.y -= step;
  else if (key === 'ArrowDown') b.y += step;
  applyBox(clampBox(b));
  saveOverlay(overlay);
}

insertBar.addEventListener('pointerdown', (e) => e.stopPropagation());
insertBar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-insert]');
  if (!btn) return;
  const what = btn.dataset.insert!;
  if (what === 'text') insertTextShape();
  else if (what === 'image') openImagePicker();
  else if (what === 'delete') deleteSelection();
  else insertShape(what as VectorKind);
  btn.blur(); // フォーカスを残すと keydown ガードが微調整/削除キーを飲み込む(挿入直後の図形を動かせない)
});

// 描画のたびに編集の見た目と選択枠を更新する(Presenter から onAfterRender 経由)。
function decorateStage(): void {
  // 数式・図は遅延ロードして描画する(描画済みは skip するので毎回呼んでよい)。
  // 描画でレイアウト(高さ)が変わるため、終わったら収まり直し(refit)を再計算する。
  void typesetMath($('notes-body'));
  void typesetMermaid($('notes-body')); // 発表者ノート内の Mermaid 図も描画する
  void Promise.all([typesetMath(stage), typesetMermaid(stage)]).then(() => presenter.refit());
  const enable = liveEdit && !presenting;
  presenter.setAuthoring(enable);
  deckRoot.classList.toggle('live', enable);
  insertBar.hidden = !enable;
  const el = slideEl();
  if (el) applyOverlay(el, slideOverlay(overlay, curId()));
  updateRevealUi(); // 段階表示のバッジ/ツールバー状態を更新
  if (!enable) {
    frame.hidden = true;
    return;
  }
  // 再描画で要素が入れ替わるので、選択を取り直す。
  if (sel?.kind === 'shape') {
    const s = stage.querySelector<HTMLElement>(`.ov-shape[data-sid="${sel.id}"]`);
    if (s) {
      sel.el = s;
      positionFrame();
    } else deselect();
  } else if (sel?.kind === 'block') {
    if (sel.el.isConnected) positionFrame();
    else deselect();
  }
  drawMultiOutlines(); // 複数選択の枠も再描画(DOM が安定しているとき)
}

function setLiveEdit(on: boolean): void {
  liveEdit = on;
  try {
    localStorage.setItem(LIVE_KEY, on ? 'on' : 'off');
  } catch {
    // 保存失敗は無視
  }
  $('live-edit').classList.toggle('on', on);
  $('live-edit').setAttribute('aria-pressed', String(on));
  if (!on) {
    commitEdit();
    deselect();
  }
  decorateStage();
}

// 発表(全画面)中は直接編集を止める。
document.addEventListener('fullscreenchange', () => {
  const wasPresenting = presenting;
  presenting = !!document.fullscreenElement || faux;
  if (presenting) {
    commitEdit();
    deselect();
    if (!wasPresenting) {
      presenter.resetSteps(); // 発表開始時は現在スライドを先頭ステップから
      if (presenter.hasAutoAdvance) presenter.setAutoPlay(true); // キオスク自動送りを開始
    }
  } else if (wasPresenting) {
    presenter.setAutoPlay(false); // 発表終了で自動送りを止める
  }
  decorateStage();
});

// requestFullscreen が無い環境(iOS Safari など)向けの擬似全画面。
// タッチ端末では Esc が無いので、抜けるための × ボタンを常に出す。
const fauxExit = document.createElement('button');
fauxExit.type = 'button';
fauxExit.className = 'faux-exit';
fauxExit.setAttribute('aria-label', '全画面を終了');
fauxExit.textContent = '×';
fauxExit.hidden = true;
document.body.appendChild(fauxExit);

let faux = false;
function fauxFull(on: boolean): void {
  const was = presenting;
  faux = on;
  document.body.classList.toggle('faux-full', on);
  fauxExit.hidden = !on;
  presenting = on;
  if (on) {
    commitEdit();
    deselect();
    if (!was) {
      presenter.resetSteps(); // 発表開始時は現在スライドを先頭ステップから
      if (presenter.hasAutoAdvance) presenter.setAutoPlay(true); // キオスク自動送りを開始
    }
  } else if (was) {
    presenter.setAutoPlay(false); // 発表終了で自動送りを止める
  }
  decorateStage();
}
fauxExit.addEventListener('click', () => fauxFull(false));

// 選択枠・段階表示バッジ・複数選択枠は、スライドの表示サイズ変化に追従させる(実測座標のため)。
new ResizeObserver(() => {
  positionFrame();
  positionStepBadges();
  drawMultiOutlines();
}).observe(deckRoot);
// 入場アニメ終了後に測り直す(アニメ中の transform で位置がズレないように)。
stage.addEventListener('animationend', () => {
  positionFrame();
  positionStepBadges();
  drawMultiOutlines();
});

// 移動前に編集を確定し、選択を解除してから動かす(Presenter内部のデッキを最新化)。
function nav(action: () => void): void {
  closeCtxMenu();
  commitEdit();
  deselect();
  flushView();
  action();
}

// ── 初期化 ──
// 改行は \n に正規化。parseDeck のオフセット(段階表示/その場編集/削除/画像挿入で使う)と
// textarea の中身を一致させ、過去に CRLF で保存された localStorage からの復元でもズレないようにする。
mdInput.value = (lsGet(MD_KEY) ?? SAMPLE).replace(/\r\n?/g, '\n');
setTheme(currentTheme.id, false);
{
  const firstDeck = parseDeck(mdInput.value);
  // URLにテーマ指定が無く、文書がテーマを指定していればそれを使う
  if (!new URLSearchParams(location.search).get('theme') && firstDeck.meta.theme) {
    setTheme(firstDeck.meta.theme, false);
  }
}
// 旧データ(スライド index をキーに保存された overlay)を、スライドの安定ID(<!-- id: xxx -->)へ
// 移す一度きりの移行。図形のあるスライドに id を書き、overlay のキーを index→id へ付け替える。
function migrateOverlayIds(): void {
  const numeric = Object.keys(overlay).filter((k) => /^\d+$/.test(k));
  if (!numeric.length) return;
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  let deck = parseDeck(mdInput.value);
  // index 降順で処理(id 前置は後続スライドのオフセットを動かすため、後ろから)。
  const idxs = numeric.map(Number).filter((i) => deck.slides[i]).sort((a, b) => b - a);
  for (const i of idxs) {
    const data = overlay[String(i)];
    if (!data || !data.shapes.length) {
      delete overlay[String(i)];
      continue;
    }
    const slide = deck.slides[i]!;
    let id = slide.id;
    if (!id) {
      id = newId();
      mdInput.value = mdInput.value.slice(0, slide.srcStart) + `<!-- id: ${id} -->\n` + mdInput.value.slice(slide.srcStart);
      deck = parseDeck(mdInput.value);
    }
    overlay[id] = data;
    delete overlay[String(i)];
  }
  // 残った数値キー(対応スライドが消えた孤児データ)は捨てる。
  for (const k of Object.keys(overlay)) if (/^\d+$/.test(k)) delete overlay[k];
  persistMd();
  saveOverlay(overlay);
}

// 同じ <!-- id --> を持つスライドが複数あると overlay を共有してしまう(スライドのコピペ等)。
// 最初の1枚はそのまま、以降の重複スライドだけ新しいIDへ振り直す(コピー先は空の overlay になる)。
// mdInput.value を書き換えるだけで rebuild はしない(呼び出し側が再描画する)。変更があれば true。
function dedupeSlideIds(): boolean {
  if (mdInput.value.includes('\r')) mdInput.value = mdInput.value.replace(/\r\n?/g, '\n');
  const deck = parseDeck(mdInput.value);
  const seen = new Set<string>();
  const dups: number[] = [];
  deck.slides.forEach((s, i) => {
    if (!s.id) return;
    if (seen.has(s.id)) dups.push(i);
    else seen.add(s.id);
  });
  if (!dups.length) return false;
  for (const i of [...dups].sort((a, b) => b - a)) {
    const s = deck.slides[i]!;
    const region = mdInput.value.slice(s.srcStart, s.srcEnd).replace(/<!--\s*id:\s*\S+\s*-->/, `<!-- id: ${newId()} -->`);
    mdInput.value = mdInput.value.slice(0, s.srcStart) + region + mdInput.value.slice(s.srcEnd);
  }
  persistMd();
  return true;
}

{
  // ディープリンクのスライド番号は rebuild の前に読む。rebuild の初回 render が onChange を
  // 同期発火させ、hash を #1 に書き換えてしまうため(先に読まないと常に1枚目に戻る)。
  // 先頭の数字だけ読む(新形式 #3、旧形式 #3?theme=… のどちらでも復元できる)。
  const start = Number.parseInt(location.hash.slice(1), 10) - 1;
  migrateOverlayIds(); // 旧 index データを id へ移行してから描画
  dedupeSlideIds(); // 保存済みデッキ内の重複 id を解消(コピペ由来の overlay 共有を防ぐ)
  rebuild(false);
  if (Number.isFinite(start) && start > 0) presenter.go(start);
}

// ── ナビ ──
$('next').addEventListener('click', () => {
  nav(() => presenter.next());
  $('next').blur();
});
$('prev').addEventListener('click', () => {
  nav(() => presenter.prev());
  $('prev').blur();
});

// 入力のたびに全体を再パース/再描画するのは重いので、軽くデバウンスする。
let rebuildTimer = 0;
function scheduleRebuild(): void {
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => {
    // その場編集中はスライドDOMを作り直さない(編集対象が破壊され入力が消える)。
    // 編集が終わるまで先送りし、確定後に textarea の変更を反映する。
    if (editingBlock) {
      scheduleRebuild();
      return;
    }
    dedupeSlideIds(); // テキスト編集(スライドのコピペ含む)で生じた重複 id を解消してから再描画
    rebuild(true);
  }, 120);
}
mdInput.addEventListener('input', scheduleRebuild);

// 直接編集トグル(既定はオン)。
$('live-edit').classList.toggle('on', liveEdit);
$('live-edit').setAttribute('aria-pressed', String(liveEdit));
$('live-edit').addEventListener('click', () => setLiveEdit(!liveEdit));

// ── パネル開閉 ──
const PANEL_BTN: Record<string, string> = { editor: 'edit', 'notes-panel': 'notes-btn' };
function toggle(id: string, force?: boolean): void {
  const el = $(id);
  el.hidden = force === undefined ? !el.hidden : !force;
  const btnId = PANEL_BTN[id];
  if (btnId) {
    const on = !el.hidden;
    $(btnId).classList.toggle('on', on);
    $(btnId).setAttribute('aria-pressed', String(on));
  }
}
$('edit').addEventListener('click', () => toggle('editor'));
// 既定で編集パネルを開いておく。横並びで原稿とプレビューを見渡せて書き始めやすい。
// 狭い画面では編集がスライド全面を覆うので、その場合だけ閉じたままにする。
if (window.matchMedia('(min-width: 821px)').matches) toggle('editor', true);
$('notes-btn').addEventListener('click', () => toggle('notes-panel'));
$('overview').addEventListener('click', () => {
  buildOverview();
  toggle('overview-overlay', true);
});
$('theme-btn').addEventListener('click', () => {
  buildThemeGrid();
  toggle('theme-modal', true);
});
// ガイドの検索フィルタを初期状態へ(全節を表示)。開き直し・目次ジャンプの前に呼ぶ。
function resetGuideFilter(): void {
  $<HTMLInputElement>('guide-search').value = '';
  for (const sec of $('guide-content').querySelectorAll<HTMLElement>('.g-sec')) sec.hidden = false;
}
function openGuide(): void {
  resetGuideFilter(); // 前回の検索が残って大半が隠れたまま開くのを防ぐ
  toggle('help-overlay', true);
}
$('help-btn').addEventListener('click', openGuide);

// ── ガイド(ヘルプ): 目次スクロール・検索・コードのコピー ──
{
  const guideContent = $('guide-content');
  $('guide-nav').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-goto]');
    if (!b) return;
    resetGuideFilter(); // 検索で隠れている節にも飛べるよう、まずフィルタを解除してから移動
    document.getElementById(b.dataset.goto!)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $<HTMLInputElement>('guide-search').addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    for (const sec of guideContent.querySelectorAll<HTMLElement>('.g-sec')) {
      sec.hidden = q !== '' && !(sec.textContent ?? '').toLowerCase().includes(q);
    }
  });
  for (const pre of guideContent.querySelectorAll<HTMLElement>('pre.g-code')) {
    const code = pre.textContent ?? '';
    const btn = document.createElement('button');
    btn.className = 'g-copy';
    btn.type = 'button';
    btn.textContent = 'コピー';
    btn.addEventListener('click', () => {
      navigator.clipboard
        ?.writeText(code)
        .then(() => {
          btn.textContent = 'コピーしました';
          window.setTimeout(() => (btn.textContent = 'コピー'), 1200);
        })
        .catch(() => {});
    });
    pre.appendChild(btn);
  }
}
$('load-sample').addEventListener('click', () => {
  mdInput.value = SAMPLE;
  rebuild(false);
  toggle('help-overlay', false);
  toast('サンプルを読み込みました');
});
app.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
  b.addEventListener('click', () => toggle(b.dataset.close!, false)),
);

// ── 全画面 ──
$('present').addEventListener('click', () => {
  if (faux) {
    fauxFull(false);
    return;
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  const req = deckRoot.requestFullscreen?.bind(deckRoot);
  if (req) req().catch(() => fauxFull(true));
  else fauxFull(true);
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
  commitEdit(); // 進行中の編集(本文/テキスト箱)を確定してから書き出す(古い内容で出力しない)
  const deck = parseDeck(mdInput.value);
  if (deck.slides.length === 0) {
    toast('スライドがありません');
    return;
  }
  if (kind === 'print') {
    await doPrint();
    return;
  }
  if (kind === 'md') {
    download(`${deckFilename(deck.meta)}.md`, mdInput.value, 'text/markdown');
    toast('Markdown を保存しました');
    return;
  }
  if (kind === 'html') {
    setBusy(true, 'HTML を作成中…', 0, 1);
    try {
      const html = await exportHtml(deck, currentTheme, overlay);
      download(`${deckFilename(deck.meta)}.html`, html, 'text/html');
      toast('単体HTML を書き出しました(ダブルクリックで再生)');
    } catch (err) {
      toast('HTML の書き出しに失敗しました');
      console.error(err);
    } finally {
      setBusy(false);
    }
    return;
  }
  if (kind === 'png') {
    setBusy(true, '画像を作成中…', 0, 1);
    try {
      const dataUrl = await renderSlidePng(deck, currentTheme, presenter.index, overlay);
      downloadDataUrl(slideImageName(deck.meta, presenter.index), dataUrl);
      toast('現在のスライドを画像で保存しました');
    } catch (err) {
      toast('画像の書き出しに失敗しました(外部画像はCORSで取り込めないことがあります)');
      console.error(err);
    } finally {
      setBusy(false);
    }
    return;
  }
  const total = deck.slides.length;
  setBusy(true, '書き出し中…', 0, total);
  const onProgress = (done: number, t: number): void => setBusy(true, '書き出し中…', done, t);
  try {
    if (kind === 'pdf') {
      await exportPdf(deck, currentTheme, onProgress, overlay);
      toast('PDF を書き出しました');
    } else if (kind === 'pptx' || kind === 'gslides') {
      await exportPptx(deck, currentTheme, onProgress, overlay);
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

async function doPrint(): Promise<void> {
  commitEdit(); // 進行中の編集(本文/テキスト箱)を確定してから出力(古い内容で印刷しない)
  const deck = parseDeck(mdInput.value);
  const host = $('print-deck');
  const titles = deckTitles(deck.slides);
  host.innerHTML = deck.slides
    .map(
      (s, i) =>
        `<div class="print-page">${slideHtml(s, { meta: deck.meta, index: i, total: deck.slides.length, titles })}</div>`,
    )
    .join('');
  // 自由配置(テキスト/図形/画像)も印刷に反映する。
  host.querySelectorAll<HTMLElement>('.print-page > .slide').forEach((el, i) => {
    applyOverlay(el, slideOverlay(overlay, deck.slides[i]?.id ?? ''));
  });
  // 数式(KaTeX)と図(Mermaid)を先に描画してから印刷する。未描画のままだと生の $…$ や
  // mermaid ソースがそのまま PDF に焼き付いてしまう。どちらも DOM のレイアウトに依存せず
  // 描画できるため、print-deck が画面上では display:none でも問題なく実体化できる。
  // 数式・図が無いデッキでは即座に返り、KaTeX/Mermaid の遅延チャンクも読み込まれない。
  if (hasPendingMath(host) || hasPendingMermaid(host)) {
    setBusy(true, '印刷用に数式・図を描画中…', 0, 1);
    try {
      await typesetMath(host);
      await typesetMermaid(host);
    } finally {
      setBusy(false);
    }
  }
  window.print();
}

function setBusy(show: boolean, text = '', done = 0, total = 0): void {
  $('busy').hidden = !show;
  if (!show) return;
  $('busy-text').textContent = text;
  const track = $('busy-track');
  const fill = $<HTMLElement>('busy-fill');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  fill.style.width = `${pct}%`;
  track.setAttribute('aria-valuenow', String(done));
  track.setAttribute('aria-valuemax', String(total));
  $('busy-count').textContent = total > 0 ? `${done} / ${total}` : '';
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

function downloadDataUrl(name: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  a.click();
}

// ── Markdownファイルを開く / ドロップ ──
$('open').addEventListener('click', () => $<HTMLInputElement>('file').click());
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void loadFile(file);
});
async function loadFile(file: File): Promise<void> {
  // 改行を \n に正規化。parseDeck は正規化後のオフセットを返すので、ここで揃えておかないと
  // CRLF ファイルで段階表示/その場編集/削除のスライス位置がずれて文書が壊れる。
  mdInput.value = (await file.text()).replace(/\r\n?/g, '\n');
  rebuild(false);
  toast(`${file.name} を読み込みました`);
}
['dragover', 'drop'].forEach((type) => {
  deckRoot.addEventListener(type, (e) => e.preventDefault());
});
function dropPercent(e: DragEvent): { x: number; y: number } {
  const r = (slideEl() ?? stage).getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
}
deckRoot.addEventListener('drop', (e) => {
  const dt = (e as DragEvent).dataTransfer;
  if (!dt) return;
  const files = Array.from(dt.files);
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (images.length) {
    if (!liveEdit || presenting) {
      toast('「スライドを直接編集」をオンにすると画像を配置できます');
      return;
    }
    const at = dropPercent(e as DragEvent);
    images.forEach((f, i) => void importImageFile(f, 'free', { x: at.x + i * 4, y: at.y + i * 4 }));
    return;
  }
  const md = files.find((f) => /\.(md|markdown|txt)$/i.test(f.name) || f.type.startsWith('text/'));
  if (md) {
    void loadFile(md);
    return;
  }
  const uri = (dt.getData('text/uri-list') || dt.getData('text/plain')).trim();
  if (/^https?:\/\//.test(uri) && liveEdit && !presenting) addFreeImage(uri, '', dropPercent(e as DragEvent));
});

// クリップボードの画像を貼り付けで自由配置(エディタ/直接編集中の入力は邪魔しない)。
window.addEventListener('paste', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
  if (!liveEdit || presenting) return;
  for (const it of Array.from(e.clipboardData?.items ?? [])) {
    if (it.type.startsWith('image/')) {
      const file = it.getAsFile();
      if (file) {
        e.preventDefault();
        void importImageFile(file, 'free', { x: 50, y: 47 });
        return;
      }
    }
  }
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
  commitEdit(); // 進行中の編集を確定してからサムネイル化(古い/プレースホルダ表示を防ぐ)
  const deck = parseDeck(mdInput.value);
  const grid = $('overview-grid');
  grid.innerHTML = '';
  const titles = deckTitles(deck.slides);
  deck.slides.forEach((s, i) => {
    const cell = document.createElement('button');
    cell.className = 'ov-cell';
    cell.style.setProperty('--i', String(i));
    // 一覧でも本表示と同じクローム(ヘッダ/フッタ/ページ番号)と目次を出す(全スライド一律)。
    const thumbCtx = { meta: deck.meta, index: i, total: deck.slides.length, titles };
    cell.innerHTML = `<div class="ov-thumb">${slideHtml(s, thumbCtx)}</div><span class="ov-no">${i + 1}</span>`;
    const thumbSlide = cell.querySelector<HTMLElement>('.ov-thumb > .slide');
    if (thumbSlide) applyOverlay(thumbSlide, slideOverlay(overlay, s.id ?? '')); // 自由配置(テキスト/図形/画像)も一覧に出す
    cell.addEventListener('click', () => {
      nav(() => presenter.go(i));
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
  btn.blur(); // フォーカスを残すと keydown ガードが矢印/スペースを飲み込み、発表中にスライドを送れなくなる
});
$('timer-reset').addEventListener('click', () => {
  elapsed = 0;
  $('timer').textContent = '00:00';
  $('timer-reset').blur();
});

// ── 画面ブラックアウト/ホワイトアウト(発表中の注目誘導。B=黒 / W=白) ──
// 全画面(requestFullscreen は deck-root)でも覆えるよう deckRoot のサブツリーに置く。
let blanked: 'black' | 'white' | null = null;
let autoPlayBeforeBlank = false; // 暗転前に自動送りが動いていたか(復帰時に戻す)
const blankEl = document.createElement('div');
blankEl.className = 'screen-blank';
blankEl.hidden = true;
deckRoot.appendChild(blankEl);
function setBlank(mode: 'black' | 'white' | null): void {
  const wasBlank = blanked !== null;
  blanked = mode;
  blankEl.hidden = !mode;
  if (mode) blankEl.dataset.mode = mode;
  // 暗転/白転の間は自動送り(キオスク)を止め、解除したら元の状態に戻す。
  if (mode && !wasBlank) {
    autoPlayBeforeBlank = presenter.autoPlaying;
    if (autoPlayBeforeBlank) presenter.setAutoPlay(false);
  } else if (!mode && wasBlank && autoPlayBeforeBlank) {
    presenter.setAutoPlay(true);
    autoPlayBeforeBlank = false;
  }
}
blankEl.addEventListener('pointerdown', () => setBlank(null));

// ── キーボード ──
// 数字を打って Enter でそのスライド番号へ飛ぶ(発表中の Q&A・長いデッキ向け)。
let jumpBuf = '';
let jumpTimer = 0;
const anyOverlayOpen = (): boolean =>
  !$('overview-overlay').hidden ||
  !$('theme-modal').hidden ||
  !$('help-overlay').hidden ||
  !$('gslides-modal').hidden ||
  !$('export-menu').hidden;

window.addEventListener('keydown', (ev) => {
  const target = ev.target as HTMLElement | null;
  // Esc は検索欄など入力中でも、開いているオーバーレイを閉じられるよう最優先で処理する。
  if (ev.key === 'Escape' && anyOverlayOpen()) {
    ['overview-overlay', 'theme-modal', 'help-overlay', 'gslides-modal'].forEach((id) => toggle(id, false));
    $('export-menu').hidden = true;
    target?.blur();
    return;
  }
  // テキスト入力中・対話的コントロールにフォーカスがあるときは横取りしない
  // (ボタンの Space/Enter による二重発火を防ぐ)。
  if (target?.closest('input, textarea, select, a[href], button, [contenteditable=""], [contenteditable="true"]')) {
    return;
  }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

  // ブラックアウト/ホワイトアウト中は、どのキーでも解除する(B/W は反対色への切替も可)。
  if (blanked) {
    ev.preventDefault();
    if (ev.key === 'b' || ev.key === 'B') setBlank(blanked === 'black' ? null : 'black');
    else if (ev.key === 'w' || ev.key === 'W') setBlank(blanked === 'white' ? null : 'white');
    else setBlank(null);
    return;
  }

  // Escape(オーバーレイが無いとき): 右クリックメニュー → 注釈解除 → 全画面 → 選択解除 の順で閉じる。
  if (ev.key === 'Escape') {
    if (!ctxMenu.hidden) closeCtxMenu();
    else if (annot.active) annot.setMode('off'); // 手書き/レーザーを抜ける(全画面より先に)
    else if (faux) fauxFull(false);
    else if (sel) deselect();
    return;
  }

  // オーバーレイ(一覧/テーマ/ヘルプ/Google/書き出しメニュー)を開いている間は、
  // 裏のデッキへナビ・編集系ショートカットを通さない(モーダル越しの誤操作を防ぐ。Esc は上で処理済み)。
  if (anyOverlayOpen()) return;

  // 選択中の削除・微調整(編集中でないとき)。
  if (liveEdit && !presenting && sel && !editingBlock) {
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      deleteSelection();
      return;
    }
    // 矢印での微調整・レター抑止は「自由配置の図形」選択時だけ。本文ブロック選択中は
    // 矢印=スライド移動・レター=ショートカットをそのまま通す(選択中にナビが死なないように)。
    if (sel.kind === 'shape') {
      if (ev.key.startsWith('Arrow')) {
        ev.preventDefault();
        nudge(ev.key, ev.shiftKey);
        return;
      }
      if (/^[a-zA-Z?]$/.test(ev.key)) return; // 図形選択中はレターのショートカットを誤発火させない
    }
  }

  // 数字+Enter でスライド番号へジャンプ。数字は一定時間で自動的にリセットする。
  if (/^[0-9]$/.test(ev.key)) {
    ev.preventDefault();
    jumpBuf += ev.key;
    if (jumpTimer) window.clearTimeout(jumpTimer);
    jumpTimer = window.setTimeout(() => {
      jumpBuf = '';
    }, 2000);
    toast(`スライド ${jumpBuf} へ (Enter で移動)`);
    return;
  }
  if (ev.key === 'Enter' && jumpBuf) {
    ev.preventDefault();
    const n = Math.max(1, Math.min(presenter.total, parseInt(jumpBuf, 10)));
    jumpBuf = '';
    if (jumpTimer) window.clearTimeout(jumpTimer);
    nav(() => presenter.go(n - 1));
    return;
  }

  // ナビゲーション・ヘルプ(常時有効)。
  switch (ev.key) {
    case 'ArrowRight':
    case ' ':
      ev.preventDefault();
      nav(() => presenter.next());
      return;
    case 'ArrowLeft':
      ev.preventDefault();
      nav(() => presenter.prev());
      return;
    case 'Home':
      nav(() => presenter.go(0));
      return;
    case 'End':
      nav(() => presenter.go(presenter.total - 1));
      return;
    case 'Backspace':
      ev.preventDefault(); // 入力欄外の Backspace で「戻る」が起きないように
      return;
    case '?':
      openGuide();
      return;
  }

  // 全画面・一覧・発表者ノートは発表中でも使う(全画面の抜け・スライドの飛び先選び・手元メモ)。
  switch (ev.key) {
    case 'f':
    case 'F':
      $('present').click();
      return;
    case 'o':
    case 'O':
      $('overview').click();
      return;
    case 's':
    case 'S':
      toggle('notes-panel');
      return;
    case 'b':
    case 'B':
      setBlank('black');
      return;
    case 'w':
    case 'W':
      setBlank('white');
      return;
    case 'd':
    case 'D':
      annot.toggle('pen'); // 手書きペンのオン/オフ
      toast(annot.active ? 'ペン: 描けます(C で消去 / D で終了)' : 'ペンを終了しました');
      return;
    case 'l':
    case 'L':
      annot.toggle('laser'); // レーザーポインタのオン/オフ
      toast(annot.active ? 'レーザーポインタ ON(L で終了)' : 'レーザーを終了しました');
      return;
    case 'c':
    case 'C':
      annot.clearInk(); // 手書きを消す
      return;
    case 'a':
    case 'A': {
      // 自動送り(キオスク)の一時停止/再開。設定が無いデッキでは案内だけ出す。
      if (!presenter.hasAutoAdvance) {
        toast('自動送りは未設定です(frontmatter に autoslide: 5 など)');
        return;
      }
      // 直接編集中(発表外)はタイマーが動かないので、誤解を招くトーストを出さず案内する。
      if (!presenting && liveEdit) {
        toast('自動送りは発表中(F)に動きます');
        return;
      }
      const on = !presenter.autoPlaying;
      presenter.setAutoPlay(on);
      toast(on ? '自動送りを再開しました' : '自動送りを一時停止しました');
      return;
    }
  }

  // 以下のオーサリング系(編集パネル・テーマ・書き出し)は発表中は止める(発表の邪魔をしない)。
  if (presenting) return;
  switch (ev.key) {
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
  }
});

// スワイプ。横移動が主で、図形のドラッグが起きていないときだけスライドを移動する。
let touchX = 0;
let touchY = 0;
deckRoot.addEventListener(
  'touchstart',
  (e) => {
    touchX = e.changedTouches[0]!.clientX;
    touchY = e.changedTouches[0]!.clientY;
    draggedThisGesture = false;
  },
  { passive: true },
);
deckRoot.addEventListener(
  'touchend',
  (e) => {
    if (draggedThisGesture) return; // 図形を動かしたジェスチャは移動にしない
    const dx = e.changedTouches[0]!.clientX - touchX;
    const dy = e.changedTouches[0]!.clientY - touchY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) nav(() => presenter.next());
    else nav(() => presenter.prev());
  },
  { passive: true },
);
