// スライド本文用のMarkdownレンダラ。見出し・段落・箇条書き(入れ子)・番号付き・
// タスクリスト・引用・コードブロック・表・水平線・強調/コード/リンク/画像に対応する。
// HTMLは先にエスケープし、許可した記法だけを後から復元する。

import type { SlideStep } from './deck';
import { highlightCode } from './highlight';
import { emojify } from './emoji';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 属性値用の追加エスケープ。本文は先にescapeHtmlで &<> を処理済みなので、
// ここでは属性を抜け出せる引用符だけを潰せばよい。
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

// 画像の alt 内に書いた表示ディレクティブ(w:/h:/フィルタ/rounded/shadow)を解釈する。
// 例: ![図 w:200 h:120 blur:4px rounded](src)。値は厳格な正規表現で検証し CSS 注入を防ぐ。
// 残りの語は alt として返す(キャプション/代替テキストを壊さない)。render 側からも使う。
const IMG_SIZE_RE = /^\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)?$/;
const IMG_FILTER_VAL_RE = /^-?\d+(?:\.\d+)?(?:px|%|deg|rem|em)?$/;
const IMG_FILTERS = new Set([
  'blur', 'brightness', 'contrast', 'grayscale', 'sepia', 'saturate', 'invert', 'opacity', 'hue-rotate',
]);

export function parseImgDirectives(alt: string): { alt: string; attrs: string } {
  const rest: string[] = [];
  let width = '';
  let height = '';
  const filters: string[] = [];
  let rounded = false;
  let shadow = false;
  for (const tok of alt.split(/\s+/)) {
    if (tok === 'rounded') { rounded = true; continue; }
    if (tok === 'shadow') { shadow = true; continue; }
    const m = /^([a-z-]+):(.+)$/i.exec(tok);
    if (m) {
      const k = m[1]!.toLowerCase();
      const v = m[2]!;
      if ((k === 'w' || k === 'width') && IMG_SIZE_RE.test(v)) { width = /[a-z%]/i.test(v) ? v : `${v}px`; continue; }
      if ((k === 'h' || k === 'height') && IMG_SIZE_RE.test(v)) { height = /[a-z%]/i.test(v) ? v : `${v}px`; continue; }
      if (IMG_FILTERS.has(k) && IMG_FILTER_VAL_RE.test(v)) { filters.push(`${k}(${v})`); continue; }
    }
    rest.push(tok);
  }
  const styles: string[] = [];
  if (width) styles.push(`width:${width}`);
  if (height) styles.push(`height:${height}`);
  if (filters.length) styles.push(`filter:${filters.join(' ')}`);
  if (rounded) styles.push('border-radius:0.5em');
  if (shadow) styles.push('box-shadow:0 6px 22px rgba(0,0,0,0.28)');
  const attrs = styles.length ? ` style="${styles.join(';')}"` : '';
  return { alt: rest.join(' ').trim(), attrs };
}

// ── 数式(KaTeX)。コアは data-tex を持つプレースホルダを出すだけで、実際の描画は
//    ブラウザ側(math.ts)が遅延ロードした KaTeX で行う。ここは純粋・テスト可能を保つ。──
function unescapeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// インライン数式。inline() は escapeHtml 済みのテキストを受け取るので、TeX 本体は実体参照を
// 戻してから data-tex に入れる(KaTeX 用)。fallback 表示はエスケープ済みのまま残す。
function mathInlineHtml(tex: string): string {
  const raw = unescapeEntities(tex);
  const safe = escapeHtml(raw);
  return `<span class="math math-inline" data-tex="${safe.replace(/"/g, '&quot;')}">${safe}</span>`;
}

// ブロック数式。tex は生(エスケープ前)。
function mathBlockHtml(tex: string): string {
  const t = tex.trim();
  const safe = escapeHtml(t);
  return `<div class="math math-block" data-tex="${safe.replace(/"/g, '&quot;')}">${safe}</div>`;
}

// 複数行の $$ … $$ ブロックを読む(開き行で呼ぶ)。閉じ $$ までを TeX 本体にする。
// 開き行に「$$」より後ろの文字があれば($$E=mc^2 のような書き方)最初の TeX 行として拾う。
// これにより「$$」で始まるが同一行で閉じない行も必ず消費され、blocks() の無限ループを防ぐ。
function mathBlockMulti(cur: Cursor): string {
  const head = cur.lines[cur.i]!.replace(/^\s*\$\$/, '');
  cur.i += 1; // 開き $$
  const lines: string[] = [];
  if (head.trim() !== '') lines.push(head);
  while (cur.i < cur.lines.length && !/^\s*\$\$\s*$/.test(cur.lines[cur.i]!)) {
    lines.push(cur.lines[cur.i]!);
    cur.i += 1;
  }
  if (cur.i < cur.lines.length) cur.i += 1; // 閉じ $$
  return mathBlockHtml(lines.join('\n'));
}

// インライン記法。入力はエスケープ済みであること。
// コード `…` は先に取り出して退避し、リンク化・強調などに巻き込まれないようにする
// (例: `[x](y)` の中身が誤ってリンクにならない)。最後にプレースホルダを戻す。
export function inline(text: string): string {
  // \u9000\u907F\u9818\u57DF\u3002\u30B3\u30FC\u30C9\u306E\u4E2D\u8EAB\u3001\u753B\u50CF\u30BF\u30B0\u3001\u30EA\u30F3\u30AF\u306E\u5C5E\u6027\u90E8\u3092\u4E00\u65E6\u30D7\u30EC\u30FC\u30B9\u30DB\u30EB\u30C0\u306B\u9003\u304C\u3057\u3001
  // \u5F8C\u6BB5\u306E\u5F37\u8ABF\u8A18\u6CD5(*,_,**,~~)\u306B\u5DFB\u304D\u8FBC\u307E\u308C\u306A\u3044\u3088\u3046\u306B\u3059\u308B(\u4F8B: target="_blank" \u306E _ \u3084
  // URL\u4E2D\u306E * \u304C\u8AA4\u3063\u3066\u5F37\u8ABF\u5316\u3055\u308C\u308B\u306E\u3092\u9632\u3050)\u3002\u6700\u5F8C\u306B\u623B\u3059(\u5165\u308C\u5B50\u3076\u3093\u6570\u56DE)\u3002
  const stash: string[] = [];
  const hold = (html: string): string => `\uE000${stash.push(html) - 1}\uE000`;
  let s = text
    .replace(/\uE000/g, '') // \u5165\u529B\u306B\u7D1B\u308C\u305F\u756A\u5175\u306F\u9664\u53BB(\u8AA4\u5FA9\u5143\u30FBundefined\u6DF7\u5165\u3092\u9632\u3050)
    .replace(/`([^`]+)`/g, (_m, code: string) => hold(`<code>${code}</code>`))
    // インライン数式 $…$。通貨($5 等)の誤検出を避けるため、開き $ の直後は非空白、閉じ $ の
    // 直前は非空白、閉じ $ の直後は数字でないこと。$$ や \$ は対象外。退避して強調記法に巻き込まない。
    .replace(/(?<![\\$])\$(?!\s)(?:[^\n$])+?(?<!\s)\$(?!\d)/g, (m: string) =>
      hold(mathInlineHtml(m.slice(1, -1))),
    )
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
      const safe = /^(https?:|data:)/.test(src) ? src : '';
      const d = parseImgDirectives(alt);
      return hold(
        `<img src="${escapeAttr(safe)}" alt="${escapeAttr(d.alt)}" loading="lazy" decoding="async"${d.attrs} />`,
      );
    })
    // \u30EA\u30F3\u30AF\u306F\u5C5E\u6027\u90E8\u3060\u3051\u9000\u907F\u3057\u3001\u30E9\u30D9\u30EB\u306F\u5F37\u8ABF\u51E6\u7406\u3092\u52B9\u304B\u305B\u308B([**\u592A\u5B57**](url) \u7B49)\u3002
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
      const safe = /^(https?:|mailto:|#)/.test(href) ? href : '#';
      const ext = /^https?:/.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a${hold(` href="${escapeAttr(safe)}"${ext}`)}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    // ==ハイライト==(Marp/markdown-it-mark 互換)。前後の端は非空白に限り(== == 等の空マーク除外)、
    // = と改行は含めない(列区切り === には当たらない)。~~打消し~~ より後に処理する。
    .replace(/==(\S(?:[^=\n]*\S)?)==/g, '<mark>$1</mark>')
    // 上付き ^x^ / 下付き ~x~(Pandoc 互換)。中身は英数と + - ( ) . のみ(化学式・指数: H~2~O,
    // x^2^, Ca^2+^ 等)。CJK 文字・記号や [ ] を含めないことで、和文の波ダッシュ範囲(9~17時)や
    // 脚注参照 [^1] を巻き込まない。連続デリミタ(~~ 等)も前後の否定先読み/後読みで除外する。
    .replace(/(?<!\^)\^([0-9A-Za-z+\-().]+)\^(?!\^)/g, '<sup>$1</sup>')
    .replace(/(?<!~)~([0-9A-Za-z+\-().]+)~(?!~)/g, '<sub>$1</sub>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    // _ の強調は語中では無効(CommonMark)。開き _ の直前が語構成文字でなく、閉じ _ の直後も
    // 語構成文字でないときだけ強調にする。語の判定は Unicode 文字・数字(\p{L}\p{N})で行い、
    // ASCII の snake_case/URL だけでなく日本語(機能_詳細_)の語中アンダースコアも斜体化しない。
    .replace(/(^|[^\p{L}\p{N}_])_([^_\s][^_]*?)_(?![\p{L}\p{N}])/gu, '$1<em>$2</em>');
  // :shortcode: \u7D75\u6587\u5B57\u3002\u9000\u907F\u30D7\u30EC\u30FC\u30B9\u30DB\u30EB\u30C0(\uE000\u2026)\u306B\u306F\u30B3\u30ED\u30F3\u304C\u7121\u3044\u306E\u3067\u5DFB\u304D\u8FBC\u307E\u306A\u3044\u3002
  s = emojify(s);
  for (let k = 0; k < 5 && s.includes('\uE000'); k += 1) {
    s = s.replace(/\uE000(\d+)\uE000/g, (m, i: string) => stash[Number(i)] ?? m);
  }
  return s;
}

interface Cursor {
  lines: string[];
  i: number;
  // 指定時、トップレベルの各ブロックに data-src="start-end"(文書中の絶対オフセット)を付ける。
  // view側で編集したブロックを、Markdown原文の正しい範囲へ書き戻すための逆引きに使う。
  offsets?: number[];
  // 指定時、トップレベルの各ブロックに data-step / data-key(段階表示)を付ける。
  steps?: SlideStep[];
  ord?: number; // 何番目のトップレベルブロックか(steps の添字)
}

const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

function indentOf(s: string): number {
  const m = /^(\s*)/.exec(s);
  return m ? m[1]!.replace(/\t/g, '  ').length : 0;
}

export function renderMarkdown(src: string): string {
  const cur: Cursor = { lines: src.replace(/\r\n?/g, '\n').split('\n'), i: 0 };
  return blocks(cur, 0);
}

// 絶対オフセット付きの行配列から描画し、トップレベルのブロックに data-src を付ける版。
// steps を渡すと各トップレベルブロックに data-step / data-key(段階表示)も付ける。
export function renderMarkdownMapped(
  src: { text: string; offset: number }[],
  steps?: SlideStep[],
): string {
  const cur: Cursor = {
    lines: src.map((l) => l.text),
    offsets: src.map((l) => l.offset),
    steps,
    ord: 0,
    i: 0,
  };
  return blocks(cur, 0);
}

// minIndent 以上のインデントを持つブロック列を読む(入れ子リスト用)。
function blocks(cur: Cursor, minIndent: number): string {
  const out: string[] = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i]!;
    if (line.trim() === '') {
      cur.i += 1;
      continue;
    }
    if (indentOf(line) < minIndent) break;

    const startLine = cur.i;
    let piece: string;

    const fence = /^(\s*)(```|~~~)\s*([\w-]*)\s*(.*)$/.exec(line);
    const mathSingle = /^\s*\$\$(.+?)\$\$\s*$/.exec(line);
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (fence) {
      piece = codeBlock(cur, fence[2]!, fence[3] ?? '', fence[4] ?? '');
    } else if (mathSingle) {
      piece = mathBlockHtml(mathSingle[1]!);
      cur.i += 1;
    } else if (/^\s*\$\$/.test(line)) {
      // 「$$」で始まり同一行で閉じない行はすべて複数行ブロックの開きとみなす($$x など)。
      piece = mathBlockMulti(cur);
    } else if (heading) {
      const level = heading[1]!.length;
      piece = `<h${level}>${inline(escapeHtml(heading[2]!.trim()))}</h${level}>`;
      cur.i += 1;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      piece = '<hr />';
      cur.i += 1;
    } else if (/^\s*>\s?/.test(line)) {
      piece = blockquote(cur);
    } else if (LIST_RE.test(line)) {
      piece = list(cur, indentOf(line));
    } else if (isTableStart(cur)) {
      piece = table(cur);
    } else {
      piece = paragraph(cur, minIndent);
    }

    // どの分岐も必ずカーソルを進める前提だが、将来の追加で進まない分岐が出ても
    // ここで1行進めて無限ループを防ぐ(consumeBlock と対称の安全弁)。
    if (cur.i === startLine) cur.i += 1;
    // トップレベル(offsets あり)のときだけ、ブロックの元ソース範囲を埋め込む。
    // 入れ子(blockquote 内など)は offsets を持たないので付かない。
    if (cur.offsets) piece = withSource(piece, cur, startLine);
    out.push(piece);
  }
  return out.join('\n');
}

// 1ブロックが消費した行(末尾の空行は除く)の絶対範囲を、最初のタグに data-src として付ける。
// steps があれば data-step / data-key(段階表示)も同じタグに付ける。
function withSource(html: string, cur: Cursor, startLine: number): string {
  const offsets = cur.offsets!;
  const ord = cur.ord ?? 0;
  cur.ord = ord + 1;
  let endLine = cur.i;
  while (endLine > startLine && cur.lines[endLine - 1]!.trim() === '') endLine -= 1;
  let attrs = '';
  if (endLine > startLine) {
    const last = endLine - 1;
    const start = offsets[startLine]!;
    const end = offsets[last]! + cur.lines[last]!.length;
    attrs += ` data-src="${start}-${end}"`;
  }
  const st = cur.steps?.[ord];
  if (st) {
    attrs += ` data-step="${st.step}"`;
    if (st.key) attrs += ' data-key="1"';
  }
  if (!attrs) return html;
  return html.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1${attrs}`);
}

// フェンス情報文字列(```ts title=app.ts {lineNumbers})から表示オプションを取り出す。
// コードブロック右上のコピーボタン(クリップボード型アイコン)。contenteditable には含めない。
const CODE_COPY_BTN =
  '<button class="code-copy" type="button" contenteditable="false" aria-label="コードをコピー" title="コードをコピー">' +
  '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
  '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
  'd="M9 9h10v10H9z M5 15H4V5h10v1"/></svg></button>';

function parseCodeMeta(meta: string): { title: string; lineNumbers: boolean } {
  const lineNumbers = /(^|\W)line[-_]?numbers(\W|$)/i.test(meta);
  let title = '';
  const tm = /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/.exec(meta);
  if (tm) title = tm[1] ?? tm[2] ?? tm[3] ?? '';
  return { title, lineNumbers };
}

// Mermaid 図ブロック。data-mermaid に原文を持たせ、mermaid.ts が SVG に描画する。
// <code> ではないので preToMd は触れず、編集の往復は blockToMd が data-mermaid から復元する。
// 描画前は生ソースを等幅で控えめに見せる(空白にしない / 失敗時もこれが残る)。
function mermaidBlockHtml(src: string): string {
  const safe = escapeHtml(src);
  return `<div class="mermaid-block" data-mermaid="${safe.replace(/"/g, '&quot;')}"><pre class="mermaid-src">${safe}</pre></div>`;
}

function codeBlock(cur: Cursor, mark: string, lang: string, meta = ''): string {
  cur.i += 1;
  const body: string[] = [];
  while (cur.i < cur.lines.length && !cur.lines[cur.i]!.trimStart().startsWith(mark)) {
    body.push(cur.lines[cur.i]!);
    cur.i += 1;
  }
  if (cur.i < cur.lines.length) cur.i += 1; // 閉じフェンス
  // ```mermaid は図として扱う(ハイライトせず、mermaid.ts が SVG 描画)。
  if (lang.toLowerCase() === 'mermaid') return mermaidBlockHtml(body.join('\n'));
  const opts = parseCodeMeta(meta);
  // ハイライトは純粋な string→string。トークンは span、その他はエスケープ済みなので
  // 直接編集(preToMd)は span を透過して元コードを復元でき、書き出しにもそのまま乗る。
  const inner = highlightCode(body.join('\n'), lang);
  const langClass = lang ? ` class="language-${lang}"` : '';
  const classes = ['code-block'];
  if (opts.lineNumbers) classes.push('has-ln');
  if (opts.title) classes.push('has-title');
  const title = opts.title ? `<div class="code-title">${escapeHtml(opts.title)}</div>` : '';
  // 言語チップは既定表示のみ(タイトル/行番号モードでは出さず、従来の見た目を保つ)。
  const chip = lang && !opts.title ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
  // 行番号はコードの実改行を保つため、独立した数値ガターとして出す(code には触れない)。
  const gutter = opts.lineNumbers
    ? `<span class="code-gutter" aria-hidden="true">${Array.from({ length: body.length || 1 }, (_, i) => i + 1).join('\n')}</span>`
    : '';
  // フェンス情報文字列(title=/lineNumbers 等)を data-meta に保存し、直接編集(preToMd)で原文へ
  // 復元できるようにする(でないと編集の往復で title/行番号がソースから消える)。
  const m = meta.trim();
  const metaAttr = m ? ` data-meta="${escapeHtml(m).replace(/"/g, '&quot;')}"` : '';
  // コピー用ボタン。<code> の外側なので preToMd(直接編集の往復)と書き出しテキストに影響しない。
  // 実処理は main.ts のクリック委譲。発表中などは CSS で隠す/出すを切り替える。
  return `<pre data-lang="${escapeHtml(lang)}"${metaAttr} class="${classes.join(' ')}">${title}${chip}${gutter}${CODE_COPY_BTN}<code${langClass}>${inner}</code></pre>`;
}

function blockquote(cur: Cursor): string {
  const inner: string[] = [];
  while (cur.i < cur.lines.length && /^\s*>\s?/.test(cur.lines[cur.i]!)) {
    inner.push(cur.lines[cur.i]!.replace(/^\s*>\s?/, ''));
    cur.i += 1;
  }
  return `<blockquote>${blocks({ lines: inner, i: 0 }, 0)}</blockquote>`;
}

function list(cur: Cursor, baseIndent: number): string {
  const first = LIST_RE.exec(cur.lines[cur.i]!)!;
  const ordered = /\d+\./.test(first[2]!);
  const tag = ordered ? 'ol' : 'ul';
  const items: string[] = [];

  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i]!;
    if (line.trim() === '') {
      cur.i += 1;
      continue;
    }
    const m = LIST_RE.exec(line);
    if (!m || indentOf(line) < baseIndent) break;
    if (indentOf(line) > baseIndent) {
      // 直前の項目の入れ子
      const nested = list(cur, indentOf(line));
      if (items.length > 0) items[items.length - 1] += nested;
      else items.push(nested);
      continue;
    }
    cur.i += 1;
    let content = m[3]!;
    const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
    if (task) {
      const checked = task[1]!.toLowerCase() === 'x';
      content = `<label class="task"><input type="checkbox" disabled${checked ? ' checked' : ''} /> ${inline(escapeHtml(task[2]!))}</label>`;
      items.push(content);
    } else {
      items.push(inline(escapeHtml(content)));
    }
  }
  return `<${tag}>${items.map((it) => `<li>${it}</li>`).join('')}</${tag}>`;
}

function isTableStart(cur: Cursor): boolean {
  const a = cur.lines[cur.i];
  const b = cur.lines[cur.i + 1];
  return !!a && !!b && a.includes('|') && /^\s*\|?[\s:|-]+\|?\s*$/.test(b) && b.includes('-');
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

function table(cur: Cursor): string {
  const header = splitRow(cur.lines[cur.i]!);
  const align = splitRow(cur.lines[cur.i + 1]!).map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return r && l ? 'center' : r ? 'right' : l ? 'left' : '';
  });
  cur.i += 2;
  const rows: string[][] = [];
  while (cur.i < cur.lines.length && cur.lines[cur.i]!.includes('|') && cur.lines[cur.i]!.trim() !== '') {
    rows.push(splitRow(cur.lines[cur.i]!));
    cur.i += 1;
  }
  const cell = (c: string, i: number, tag: string): string => {
    const a = align[i] ? ` style="text-align:${align[i]}"` : '';
    return `<${tag}${a}>${inline(escapeHtml(c))}</${tag}>`;
  };
  const head = `<tr>${header.map((c, i) => cell(c, i, 'th')).join('')}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c, i) => cell(c, i, 'td')).join('')}</tr>`).join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function paragraph(cur: Cursor, minIndent: number): string {
  const buf: string[] = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i]!;
    if (
      line.trim() === '' ||
      indentOf(line) < minIndent ||
      /^(#{1,6})\s/.test(line) ||
      /^\s*>\s?/.test(line) ||
      LIST_RE.test(line) ||
      /^(\s*)(```|~~~)/.test(line) ||
      /^\s*\$\$/.test(line) ||
      /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)
    ) {
      break;
    }
    buf.push(line.trim());
    cur.i += 1;
  }
  return `<p>${buf.map((l) => inline(escapeHtml(l))).join('<br />')}</p>`;
}

// トップレベルブロックの開始行インデックスを順に返す。段階表示のステップ割当を、
// 実際に描画されるブロックと1対1で一致させるための単一の真実源。
// blocks() と同じ走査・消費(フェンス内は飛ばす等)を使う。
export function topLevelBlockStarts(lines: string[]): number[] {
  const cur: Cursor = { lines, i: 0 };
  const starts: number[] = [];
  while (cur.i < cur.lines.length) {
    if (cur.lines[cur.i]!.trim() === '') {
      cur.i += 1;
      continue;
    }
    starts.push(cur.i);
    consumeBlock(cur);
  }
  return starts;
}

// 1つのトップレベルブロックぶんだけカーソルを進める(blocks() と同じ分岐)。
function consumeBlock(cur: Cursor): void {
  const before = cur.i;
  const line = cur.lines[cur.i]!;
  const fence = /^(\s*)(```|~~~)\s*([\w-]*)\s*(.*)$/.exec(line);
  const mathSingle = /^\s*\$\$(.+?)\$\$\s*$/.test(line);
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (fence) codeBlock(cur, fence[2]!, fence[3] ?? '', fence[4] ?? '');
  else if (mathSingle) cur.i += 1;
  else if (/^\s*\$\$/.test(line)) mathBlockMulti(cur);
  else if (heading) cur.i += 1;
  else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) cur.i += 1;
  else if (/^\s*>\s?/.test(line)) blockquote(cur);
  else if (LIST_RE.test(line)) list(cur, indentOf(line));
  else if (isTableStart(cur)) table(cur);
  else paragraph(cur, 0);
  if (cur.i === before) cur.i += 1; // 無限ループ防止
}
