// Markdown文書をスライドの集合に分解する。
// - 先頭の `---` で囲んだフロントマター(key: value)はデッキ設定。
// - 本文は単独行の `---` でスライドに分割する。
// - スライド内の HTMLコメント `<!-- ... -->` をディレクティブとして解釈する:
//   center / title / full / split(レイアウト)、incremental(段階表示)、
//   class: 名前、bg: 色またはURL(背景)。
// - `???` 行以降はスピーカーノート。
// - レイアウトが split のとき、本文中の単独行 `===` で段組を分ける。

export type Layout = 'default' | 'center' | 'title' | 'full' | 'split';

export interface Slide {
  content: string;
  columns: string[] | null;
  notes: string;
  layout: Layout;
  background: string | null;
  classes: string[];
  incremental: boolean;
}

export interface Deck {
  meta: Record<string, string>;
  slides: Slide[];
}

const LAYOUTS: Layout[] = ['default', 'center', 'title', 'full', 'split'];

export function parseDeck(source: string): Deck {
  const text = source.replace(/\r\n?/g, '\n');
  const { meta, body } = extractFrontmatter(text);
  const chunks = splitSlides(body);
  const slides = chunks.map(parseSlide).filter((s) => s.content.trim() !== '' || s.notes !== '');
  if (slides.length === 0) {
    slides.push(parseSlide(body));
  }
  return { meta, slides };
}

function extractFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  if (!text.startsWith('---\n')) return { meta, body: text };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { meta, body: text };
  const block = text.slice(4, end);
  for (const line of block.split('\n')) {
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (m) meta[m[1]!.toLowerCase()] = m[2]!.replace(/^["']|["']$/g, '').trim();
  }
  const rest = text.slice(end + 4).replace(/^[^\n]*\n?/, '');
  return { meta, body: rest };
}

function splitSlides(body: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  for (const line of body.split('\n')) {
    if (/^\s*---\s*$/.test(line)) {
      out.push(buf.join('\n'));
      buf = [];
    } else {
      buf.push(line);
    }
  }
  out.push(buf.join('\n'));
  return out;
}

function parseSlide(raw: string): Slide {
  let layout: Layout = 'default';
  let background: string | null = null;
  let incremental = false;
  const classes: string[] = [];
  const kept: string[] = [];

  for (const line of raw.split('\n')) {
    const directive = /^\s*<!--\s*(.+?)\s*-->\s*$/.exec(line);
    if (directive) {
      applyDirective(directive[1]!, {
        setLayout: (l) => (layout = l),
        setBackground: (b) => (background = b),
        setIncremental: () => (incremental = true),
        addClass: (c) => classes.push(c),
      });
      continue;
    }
    kept.push(line);
  }

  let content = kept.join('\n');
  let notes = '';
  const noteAt = content.search(/^\s*\?\?\?\s*$/m);
  if (noteAt !== -1) {
    const idx = content.split('\n').findIndex((l) => /^\s*\?\?\?\s*$/.test(l));
    const lines = content.split('\n');
    notes = lines.slice(idx + 1).join('\n').trim();
    content = lines.slice(0, idx).join('\n');
  }

  let columns: string[] | null = null;
  if ((layout as Layout) === 'split') {
    columns = content.split(/^\s*===\s*$/m).map((c) => c.trim());
  }

  return { content: content.trim(), columns, notes, layout, background, classes, incremental };
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
