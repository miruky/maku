import type { Slide } from './deck';
import { escapeHtml, inline, renderMarkdown, renderMarkdownMapped } from './markdown';

export function slideClassName(slide: Slide): string {
  return ['slide', `layout-${slide.layout}`, ...slide.classes].join(' ');
}

// url('…') の単一引用符や style 属性の二重引用符を抜け出せる文字を
// パーセントエンコードする。残りの URL 文字(英数や :/.?=#- や base64 の +/=)は素通しする。
function encodeBgUrl(url: string): string {
  return url.replace(
    /['"()\\\s<>&]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
  );
}

// 色・グラデーション値などを style/属性に入れるためのHTMLエスケープ。属性からの脱出を防ぐ。
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function slideStyleAttr(slide: Slide): string {
  if (!slide.background) return '';
  const bg = slide.background;
  if (/^(https?:|data:)/.test(bg)) {
    return ` style="background-image:url('${encodeBgUrl(bg)}')" data-bg="image"`;
  }
  return ` style="background:${escapeAttr(bg)}"`;
}

// ── レイアウト別の本文HTML ──
// mapped=true は編集ステージ用(段組系の各ブロックに data-src を付ける)。
// stats/quote/timeline/image-* は構造を組み替えるため文字列描画(直接編集の対象外)。
// セルに付ける段階表示属性。アイテム層レイアウトはセルを順に出す。
function stepAttr(on: boolean, i: number): string {
  return on ? ` data-step="${i + 1}"` : '';
}

function renderBody(slide: Slide, mapped: boolean): string {
  // アイテム層(grid/cards/stats/timeline/split/compare)は mapped かつ reveal 時に
  // 各セルへ data-step を付け、順次表示できるようにする。
  const stepped = mapped && slide.reveal !== 'none';
  const parts = (): string[] =>
    mapped && slide.columnLines
      ? slide.columnLines.map((ls) => renderMarkdownMapped(ls))
      : (slide.columns ?? []).map((c) => renderMarkdown(c));
  const whole = (): string =>
    mapped && slide.bodyLines.length
      ? renderMarkdownMapped(slide.bodyLines, slide.steps ?? undefined)
      : renderMarkdown(slide.content);

  switch (slide.layout) {
    case 'split': {
      const cols = parts();
      return cols.length ? wrapCells('columns', 'col', cols, stepped) : whole();
    }
    case 'grid': {
      const cells = parts();
      return cells.length
        ? `<div class="grid" style="--cells:${cells.length}">${cells
            .map((c, i) => `<div class="grid-cell"${stepAttr(stepped, i)}>${c}</div>`)
            .join('')}</div>`
        : whole();
    }
    case 'cards':
      return renderCards(parts(), stepped) || whole();
    case 'compare':
      return renderCompare(parts(), stepped) || whole();
    case 'section':
      return renderSection(parts()) || whole();
    case 'stats':
      return renderStats(slide, stepped) || whole();
    case 'quote':
      return renderQuote(slide);
    case 'timeline':
      return renderTimeline(slide, stepped);
    case 'image-left':
      return renderMedia(slide, 'left');
    case 'image-right':
      return renderMedia(slide, 'right');
    default:
      return whole();
  }
}

function wrapCells(wrap: string, cell: string, cells: string[], stepped = false): string {
  return `<div class="${wrap}">${cells
    .map((c, i) => `<div class="${cell}"${stepAttr(stepped, i)}>${c}</div>`)
    .join('')}</div>`;
}

// 描画済みHTMLが <h1>…<h6> で始まるなら見出しレベルを、そうでなければ 0 を返す。
function headLevel(html: string): number {
  const m = /^\s*<h([1-6])\b/.exec(html);
  return m ? Number(m[1]) : 0;
}

function firstNonEmpty(s: string): string {
  for (const l of s.split('\n')) {
    const t = l.trim();
    if (t) return t;
  }
  return '';
}

// カード: 先頭が見出しh1/h2 か本文(=リード)なら導入帯に、h3以降は各カードに。
function renderCards(parts: string[], stepped = false): string {
  if (!parts.length) return '';
  let lead: string | null = null;
  let cards = parts;
  if (parts.length >= 2 && headLevel(parts[0]!) <= 2) {
    lead = parts[0]!;
    cards = parts.slice(1);
  }
  const row = `<div class="cards-row" style="--card-count:${cards.length}">${cards
    .map((c, i) => `<article class="card" style="--card-i:${i}"${stepAttr(stepped, i)}>${c}</article>`)
    .join('')}</div>`;
  return `<div class="cards-deck">${lead ? `<div class="cards-lead">${lead}</div>` : ''}${row}</div>`;
}

// 対比: 左右2パネルと中央の「vs」。3部以上は2部目以降を右にまとめる。
function renderCompare(parts: string[], stepped = false): string {
  if (!parts.length) return '';
  const a = parts[0] ?? '';
  const b = parts.length > 2 ? parts.slice(1).join('') : (parts[1] ?? '');
  // 右側が空のときは段階表示の対象にしない(空セルで「無反応Next」が出ないように)。
  const aStep = stepped ? ' data-step="1"' : '';
  const bStep = stepped && b.trim() ? ' data-step="2"' : '';
  return (
    `<div class="cmp">` +
    `<div class="cmp-side cmp-a"${aStep}>${a}</div>` +
    `<div class="cmp-divider" aria-hidden="true"><span class="cmp-vs">vs</span></div>` +
    `<div class="cmp-side cmp-b"${bStep}>${b}</div>` +
    `</div>`
  );
}

// 章扉: 1部=タイトル / 2部=ラベル+タイトル / 3部以上=ラベル+タイトル+リード。
function renderSection(parts: string[]): string {
  if (!parts.length) return '';
  let kicker = '';
  let title = '';
  let lede = '';
  if (parts.length === 1) {
    title = parts[0]!;
  } else if (parts.length === 2) {
    kicker = parts[0]!;
    title = parts[1]!;
  } else {
    kicker = parts[0]!;
    title = parts[1]!;
    lede = parts.slice(2).join('');
  }
  return (
    `<div class="section">` +
    (kicker ? `<div class="section-kicker">${kicker}</div>` : '') +
    `<div class="section-title">${title}</div>` +
    `<hr class="section-rule" />` +
    (lede ? `<div class="section-lede">${lede}</div>` : '') +
    `</div>`
  );
}

// 数値強調: 各部を「大きな数値 + キャプション(+任意の#### 上ラベル)」に分解する。
function splitFigure(fig: string): string {
  const m = /^([^\d]*[\d.,]+)\s*(.*)$/.exec(fig);
  if (m && m[2]) return `${escapeHtml(m[1]!)}<span class="stat-unit">${escapeHtml(m[2]!)}</span>`;
  return escapeHtml(fig);
}

function renderStatItem(seg: string): string {
  const lines = seg.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i]!.trim()) i += 1;
  let kicker = '';
  const km = i < lines.length ? /^####\s+(.*)$/.exec(lines[i]!.trim()) : null;
  if (km) {
    kicker = km[1]!.trim();
    i += 1;
  }
  while (i < lines.length && !lines[i]!.trim()) i += 1;
  let figure = '';
  if (i < lines.length) {
    figure = lines[i]!.trim();
    i += 1;
  }
  figure = figure.replace(/\*\*(.+?)\*\*/g, '$1').trim(); // **123** USD のような太字+単位も剥がす
  const caption = lines.slice(i).join('\n').trim();
  if (!figure && !caption) return '';
  const kick = kicker ? `<p class="stat-kicker">${inline(escapeHtml(kicker))}</p>` : '';
  const fig = figure ? `<p class="stat-figure">${splitFigure(figure)}</p>` : '';
  const cap = caption ? `<figcaption class="stat-label">${renderMarkdown(caption)}</figcaption>` : '';
  return `<figure class="stat">${kick}${fig}${cap}</figure>`;
}

// セグメント内に #### が複数あれば各 #### で更に分割する(=== 区切りが無くても複数指標を拾う)。
function splitStatSegments(cols: string[]): string[] {
  const out: string[] = [];
  for (const c of cols) {
    let buf: string[] = [];
    for (const ln of c.split('\n')) {
      if (/^####\s/.test(ln.trim()) && buf.some((b) => b.trim())) {
        out.push(buf.join('\n'));
        buf = [ln];
      } else {
        buf.push(ln);
      }
    }
    if (buf.some((b) => b.trim())) out.push(buf.join('\n'));
  }
  return out;
}

function renderStats(slide: Slide, stepped = false): string {
  const cols = slide.columns;
  if (!cols || !cols.length) return '';
  let lead = '';
  let segs: string[];
  if (cols.length >= 2) {
    if (/^#{1,2}\s/.test(firstNonEmpty(cols[0]!))) {
      lead = cols[0]!;
      segs = splitStatSegments(cols.slice(1));
    } else {
      segs = splitStatSegments(cols);
    }
  } else {
    // 単一カラム: 最初の #### より前を(あれば)リード、それ以降を指標に分割。
    const all = cols[0] ?? '';
    const idx = all.search(/^####\s/m);
    if (idx > 0) {
      lead = all.slice(0, idx).trim();
      segs = splitStatSegments([all.slice(idx)]);
    } else if (idx === 0) {
      segs = splitStatSegments([all]);
    } else if (/^#{1,2}\s/.test(firstNonEmpty(all))) {
      lead = all; // 見出しだけ
      segs = [];
    } else {
      segs = [all]; // #### 無しの単一指標
    }
  }
  const cells = segs
    .map(renderStatItem)
    .filter(Boolean)
    .map((c, i) => c.replace(/^<figure class="stat"/, `<figure class="stat"${stepAttr(stepped, i)}`));
  if (!cells.length && !lead) return '';
  const grid = cells.length ? `<div class="stats-grid" data-n="${cells.length}">${cells.join('')}</div>` : '';
  return `${lead ? `<div class="stats-lead">${renderMarkdown(lead)}</div>` : ''}${grid}`;
}

// 大判プルクオート: 末尾のダッシュ行、または === で出典を分ける。
function renderQuote(slide: Slide): string {
  const cols = slide.columns && slide.columns.length ? slide.columns : [slide.content];
  let quote = cols[0] ?? '';
  let attr = cols.length >= 2 ? cols.slice(1).join('\n').trim() : '';
  if (!attr) {
    const lines = quote.split('\n');
    let a = lines.length - 1;
    while (a >= 0 && !lines[a]!.trim()) a -= 1;
    if (a > 0) {
      const dm = /^\s*[-–—]\s+(.+)$/.exec(lines[a]!);
      if (dm) {
        attr = dm[1]!.trim();
        quote = lines.slice(0, a).join('\n').trim();
      }
    }
  }
  attr = attr.replace(/^[-–—]\s+/, '').trim();
  const cap = attr ? `<figcaption class="quote-by">${inline(escapeHtml(attr))}</figcaption>` : '';
  return `<figure class="quote-block"><blockquote class="quote-text">${renderMarkdown(quote)}</blockquote>${cap}</figure>`;
}

// 年表: トップレベルの箇条書き1項目=1イベント。`時 === ラベル` で時のチップを分ける。
function renderTimeline(slide: Slide, stepped = false): string {
  const lines = slide.content.split('\n');
  const LIST = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
  const indentOf = (s: string): number => (/^(\s*)/.exec(s)?.[1] ?? '').replace(/\t/g, '  ').length;

  const titleLines: string[] = [];
  let i = 0;
  let baseIndent = -1;
  for (; i < lines.length; i += 1) {
    const m = LIST.exec(lines[i]!);
    if (m) {
      baseIndent = m[1]!.replace(/\t/g, '  ').length;
      break;
    }
    titleLines.push(lines[i]!);
  }
  if (baseIndent === -1) return renderMarkdown(slide.content);

  const events: { time: string; label: string; body: string[] }[] = [];
  const dedent = new RegExp(`^\\s{0,${baseIndent + 2}}`);
  for (; i < lines.length; i += 1) {
    const line = lines[i]!;
    const m = LIST.exec(line);
    if (m && indentOf(line) === baseIndent) {
      const content = m[3]!;
      const eq = content.indexOf('===');
      const time = eq !== -1 ? content.slice(0, eq).trim() : '';
      const label = eq !== -1 ? content.slice(eq + 3).trim() : content.trim();
      events.push({ time, label, body: [] });
    } else if (events.length) {
      if (/^\s*===\s*$/.test(line)) continue; // 区切りの === は本文に出さない
      events[events.length - 1]!.body.push(line.trim() === '' ? '' : line.replace(dedent, ''));
    }
  }

  const title = titleLines.join('\n').trim() ? renderMarkdown(titleLines.join('\n')) : '';
  const items = events
    .map((ev, i) => {
      const bodyText = ev.body.join('\n').trim();
      const head =
        (ev.time ? `<span class="tl-time">${inline(escapeHtml(ev.time))}</span>` : '') +
        `<h3 class="tl-label">${inline(escapeHtml(ev.label))}</h3>`;
      const body = bodyText ? `<div class="tl-body">${renderMarkdown(bodyText)}</div>` : '';
      return `<li class="tl-event"${stepAttr(stepped, i)}><span class="tl-node" aria-hidden="true"></span><div class="tl-content"><div class="tl-head">${head}</div>${body}</div></li>`;
    })
    .join('');
  return `${title}<ol class="timeline-track">${items}</ol>`;
}

// 画像分割(左/右): 本文最初の画像、または === の媒体部、なければ bg のURLを使う。
const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/;
function extractImage(text: string): { src: string; alt: string; rest: string; matched: string } | null {
  const m = IMG_RE.exec(text);
  if (!m) return null;
  const src = /^(https?:|data:)/.test(m[2]!) ? m[2]! : '';
  return {
    src,
    alt: m[1] ?? '',
    rest: text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim(),
    matched: m[0],
  };
}

function renderMedia(slide: Slide, side: 'left' | 'right'): string {
  let text: string;
  let src = '';
  let alt = '';
  const cols = slide.columns;
  if (cols && cols.length >= 2) {
    // 画像を含む段を媒体に、残りを本文に(段の順序に依存しない)。画像が無ければ列を捨てず全部本文。
    const imgCol = cols.findIndex((c) => IMG_RE.test(c));
    if (imgCol >= 0) {
      const ex = extractImage(cols[imgCol]!);
      src = ex?.src ?? '';
      alt = ex?.alt ?? '';
      text = cols.filter((_, i) => i !== imgCol).join('\n\n');
    } else {
      text = cols.join('\n\n');
    }
  } else {
    const ex = extractImage(slide.content);
    if (ex && ex.src) {
      src = ex.src;
      alt = ex.alt;
      text = ex.rest;
    } else {
      text = slide.content;
    }
  }
  if (!src && slide.background && /^(https?:|data:)/.test(slide.background)) src = slide.background;
  const media = src
    ? `<figure class="media-fig" style="background-image:url('${encodeBgUrl(src)}')" role="img" aria-label="${escapeAttr(alt)}"></figure>`
    : `<figure class="media-fig empty" aria-hidden="true"></figure>`;
  const body = `<div class="media-body">${renderMarkdown(text)}</div>`;
  const inner = side === 'left' ? media + body : body + media;
  return `<div class="media-split media-${side}">${inner}</div>`;
}

export function slideInnerHtml(slide: Slide): string {
  return renderBody(slide, false);
}

// ヘッダ/フッタ/ページ番号(クローム)用の文脈。デッキ既定(meta)とスライド個別指定を解決する。
export interface SlideCtx {
  meta: Record<string, string>;
  index: number;
  total: number;
  // 目次(<!-- toc -->)スライド用。全スライドの見出し一覧(番号付き)。
  titles?: Array<{ n: number; title: string }>;
}

// スライド本文の最初の ATX 見出し(# 〜 ######)のテキストを返す。無ければ空文字。
function firstHeading(slide: Slide): string {
  for (const line of slide.content.split('\n')) {
    const m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) return m[1]!.trim();
  }
  return '';
}

// 目次に載せるスライド見出しの一覧。目次スライド自身と見出しの無いスライドは除外し、
// アジェンダとして 1 から連番を振る。書き出し・本表示・編集ステージで共通利用する。
export function deckTitles(slides: Slide[]): Array<{ n: number; title: string }> {
  const out: Array<{ n: number; title: string }> = [];
  for (const s of slides) {
    if (s.toc) continue;
    const title = firstHeading(s);
    if (!title) continue;
    out.push({ n: out.length + 1, title });
  }
  return out;
}

// 目次スライド(<!-- toc -->)の本文。全スライドの見出しを番号付きリストで出す。
function tocHtml(slide: Slide, ctx?: SlideCtx): string {
  if (!slide.toc || !ctx?.titles || !ctx.titles.length) return '';
  const items = ctx.titles
    .map(
      (t) =>
        `<li class="toc-item"><span class="toc-no">${t.n}</span>` +
        `<span class="toc-title">${inline(escapeHtml(t.title))}</span></li>`,
    )
    .join('');
  return `<ol class="toc">${items}</ol>`;
}

// スライド個別 → デッキ既定 の順で解決し、ヘッダ/フッタ/ページ番号のHTMLを返す。
// 本文(.slide-body)とは別レイヤなので、レイアウトや段階表示に干渉しない。書き出しにも乗る。
function slideChromeHtml(slide: Slide, ctx: SlideCtx): string {
  const headerText = slide.header ?? ctx.meta.header ?? '';
  const footerText = slide.footer ?? ctx.meta.footer ?? '';
  const paginate = slide.paginate ?? /^(true|on|yes|1)$/i.test(ctx.meta.paginate ?? '');
  let html = '';
  if (headerText) html += `<div class="slide-header">${inline(escapeHtml(headerText))}</div>`;
  if (footerText) html += `<div class="slide-footer">${inline(escapeHtml(footerText))}</div>`;
  if (paginate) html += `<div class="slide-pageno">${ctx.index + 1} / ${ctx.total}</div>`;
  return html;
}

// 1枚分のスライド要素。一覧のサムネイルにも使う。ctx を渡すとヘッダ/フッタ/ページ番号を付ける。
export function slideHtml(slide: Slide, ctx?: SlideCtx): string {
  return (
    `<div class="${slideClassName(slide)}"${slideStyleAttr(slide)}>` +
    `<div class="slide-body">${slideInnerHtml(slide)}${tocHtml(slide, ctx)}</div>` +
    (ctx ? slideChromeHtml(slide, ctx) : '') +
    `</div>`
  );
}

// 編集ステージ用。段組系の各ブロックに data-src(元ソースの範囲)を付けて描画する。
export function slideInnerHtmlMapped(slide: Slide): string {
  return renderBody(slide, true);
}

export function slideHtmlMapped(slide: Slide, ctx?: SlideCtx): string {
  return (
    `<div class="${slideClassName(slide)}"${slideStyleAttr(slide)}>` +
    `<div class="slide-body">${slideInnerHtmlMapped(slide)}${tocHtml(slide, ctx)}</div>` +
    (ctx ? slideChromeHtml(slide, ctx) : '') +
    `</div>`
  );
}
