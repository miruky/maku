// Markdown文書をスライドの集合に分解する。
// - 先頭の `---` で囲んだフロントマター(key: value)はデッキ設定。
// - 本文は単独行の `---` でスライドに分割する。
// - スライド内の HTMLコメント `<!-- ... -->` をディレクティブとして解釈する:
//   center / title / full / split(レイアウト)、incremental(段階表示)、
//   class: 名前、bg: 色またはURL(背景)。
// - `???` 行以降はスピーカーノート。
// - レイアウトが split のとき、本文中の単独行 `===` で段組を分ける。

export type Layout = 'default' | 'center' | 'title' | 'full' | 'split';

// ソース上の1行と、文書全体での絶対文字オフセット。
// view側(描画済みスライド)の編集を、Markdown原文の正しい位置へ書き戻すために使う。
export interface SourceLine {
  text: string;
  offset: number;
}

export interface Slide {
  content: string;
  columns: string[] | null;
  notes: string;
  layout: Layout;
  background: string | null;
  classes: string[];
  incremental: boolean;
  // 本文を構成する行(ディレクティブ・ノートを除く)を、絶対オフセット付きで保持する。
  bodyLines: SourceLine[];
  // split のとき、各段の本文行。
  columnLines: SourceLine[][] | null;
}

export interface Deck {
  meta: Record<string, string>;
  slides: Slide[];
}

const LAYOUTS: Layout[] = ['default', 'center', 'title', 'full', 'split'];

export function parseDeck(source: string): Deck {
  const text = source.replace(/\r\n?/g, '\n');
  const all = toLines(text);
  const { meta, bodyStart } = extractFrontmatter(all);
  const body = all.slice(bodyStart);
  const chunks = splitSlides(body);
  const slides = chunks.map(parseSlide).filter((s) => s.content.trim() !== '' || s.notes !== '');
  if (slides.length === 0) {
    slides.push(parseSlide(body));
  }
  return { meta, slides };
}

// 文字列を、各行の絶対オフセット付きの行配列にする。
function toLines(text: string): SourceLine[] {
  const out: SourceLine[] = [];
  let offset = 0;
  for (const part of text.split('\n')) {
    out.push({ text: part, offset });
    offset += part.length + 1; // 改行ぶん
  }
  return out;
}

function extractFrontmatter(all: SourceLine[]): {
  meta: Record<string, string>;
  bodyStart: number;
} {
  const meta: Record<string, string> = {};
  if (all.length === 0 || all[0]!.text !== '---') return { meta, bodyStart: 0 };
  let close = -1;
  for (let k = 1; k < all.length; k += 1) {
    if (/^---/.test(all[k]!.text)) {
      close = k;
      break;
    }
  }
  if (close === -1) return { meta, bodyStart: 0 };
  for (let k = 1; k < close; k += 1) {
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(all[k]!.text.trim());
    if (m) meta[m[1]!.toLowerCase()] = m[2]!.replace(/^["']|["']$/g, '').trim();
  }
  return { meta, bodyStart: close + 1 };
}

function splitSlides(body: SourceLine[]): SourceLine[][] {
  const out: SourceLine[][] = [];
  let buf: SourceLine[] = [];
  for (const ln of body) {
    if (/^\s*---\s*$/.test(ln.text)) {
      out.push(buf);
      buf = [];
    } else {
      buf.push(ln);
    }
  }
  out.push(buf);
  return out;
}

function parseSlide(raw: SourceLine[]): Slide {
  let layout: Layout = 'default';
  let background: string | null = null;
  let incremental = false;
  const classes: string[] = [];
  const kept: SourceLine[] = [];

  for (const ln of raw) {
    const directive = /^\s*<!--\s*(.+?)\s*-->\s*$/.exec(ln.text);
    if (directive) {
      applyDirective(directive[1]!, {
        setLayout: (l) => (layout = l),
        setBackground: (b) => (background = b),
        setIncremental: () => (incremental = true),
        addClass: (c) => classes.push(c),
      });
      continue;
    }
    kept.push(ln);
  }

  let bodyLines = kept;
  let notes = '';
  const noteIdx = kept.findIndex((l) => /^\s*\?\?\?\s*$/.test(l.text));
  if (noteIdx !== -1) {
    bodyLines = kept.slice(0, noteIdx);
    notes = kept
      .slice(noteIdx + 1)
      .map((l) => l.text)
      .join('\n')
      .trim();
  }

  let columns: string[] | null = null;
  let columnLines: SourceLine[][] | null = null;
  if ((layout as Layout) === 'split') {
    columnLines = [];
    let cur: SourceLine[] = [];
    for (const l of bodyLines) {
      if (/^\s*===\s*$/.test(l.text)) {
        columnLines.push(cur);
        cur = [];
      } else {
        cur.push(l);
      }
    }
    columnLines.push(cur);
    columns = columnLines.map((ls) =>
      ls
        .map((l) => l.text)
        .join('\n')
        .trim(),
    );
  }

  const content = bodyLines
    .map((l) => l.text)
    .join('\n')
    .trim();
  return { content, columns, notes, layout, background, classes, incremental, bodyLines, columnLines };
}

interface DirectiveSink {
  setLayout: (l: Layout) => void;
  setBackground: (b: string) => void;
  setIncremental: () => void;
  addClass: (c: string) => void;
}

function applyDirective(body: string, sink: DirectiveSink): void {
  const kv = /^([\w-]+)\s*:\s*(.+)$/.exec(body);
  if (kv) {
    const key = kv[1]!.toLowerCase();
    const value = kv[2]!.trim();
    if (key === 'layout' && (LAYOUTS as string[]).includes(value)) sink.setLayout(value as Layout);
    else if (key === 'class') value.split(/\s+/).forEach((c) => sink.addClass(c));
    else if (key === 'bg' || key === 'background') sink.setBackground(value);
    return;
  }
  const word = body.toLowerCase();
  if (word === 'incremental' || word === 'fragment') sink.setIncremental();
  else if ((LAYOUTS as string[]).includes(word)) sink.setLayout(word as Layout);
}
