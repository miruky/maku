// Markdown文書をスライドの集合に分解する。
// - 先頭の `---` で囲んだフロントマター(key: value)はデッキ設定。
// - 本文は単独行の `---` でスライドに分割する。
// - スライド内の HTMLコメント `<!-- ... -->` をディレクティブとして解釈する:
//   center / title / full / split(レイアウト)、incremental(段階表示)、
//   class: 名前、bg: 色またはURL(背景)。
// - `???` 行以降はスピーカーノート。
// - レイアウトが split のとき、本文中の単独行 `===` で段組を分ける。

import { topLevelBlockStarts } from './markdown';

export type Layout =
  | 'default'
  | 'center'
  | 'title'
  | 'full'
  | 'split'
  | 'grid'
  | 'cards'
  | 'stats'
  | 'compare'
  | 'section'
  | 'quote'
  | 'timeline'
  | 'image-left'
  | 'image-right';

// ソース上の1行と、文書全体での絶対文字オフセット。
// view側(描画済みスライド)の編集を、Markdown原文の正しい位置へ書き戻すために使う。
export interface SourceLine {
  text: string;
  offset: number;
}

// 段階表示の方式。sequential は上から順に、key-first はキーメッセージを先に強調表示する。
export type RevealMode = 'none' | 'sequential' | 'key-first';

// 段階表示の各ステップ。step は 1 始まり(0 は常時表示=ピン)、key は強調する見出し。
export interface SlideStep {
  step: number;
  key: boolean;
}

// ブロックに付ける段階表示マーカー(<!-- key --> など)の解釈結果。
interface Marker {
  key?: boolean;
  pin?: boolean;
  group?: boolean;
  step?: number;
}

export interface Slide {
  content: string;
  columns: string[] | null;
  notes: string;
  layout: Layout;
  background: string | null;
  classes: string[];
  // incremental は reveal !== 'none' の別名(後方互換)。段階表示の詳細は reveal / steps。
  incremental: boolean;
  reveal: RevealMode;
  steps: SlideStep[] | null; // トップレベルブロックごとのステップ(DOM順)
  // 本文を構成する行(ディレクティブ・ノートを除く)を、絶対オフセット付きで保持する。
  bodyLines: SourceLine[];
  // split のとき、各段の本文行。
  columnLines: SourceLine[][] | null;
}

export interface Deck {
  meta: Record<string, string>;
  slides: Slide[];
}

const LAYOUTS: Layout[] = [
  'default',
  'center',
  'title',
  'full',
  'split',
  'grid',
  'cards',
  'stats',
  'compare',
  'section',
  'quote',
  'timeline',
  'image-left',
  'image-right',
];

// === で複数の部に分けるレイアウト。split のしくみを一般化して使い回す。
// (各レイアウトが部をどう解釈するかは render 側で決める。)
const COLUMN_LAYOUTS: Layout[] = [
  'split',
  'grid',
  'cards',
  'stats',
  'compare',
  'section',
  'quote',
  'image-left',
  'image-right',
];

// 段階表示の対象。FLOW はブロック単位(マーカー対応)、ITEM はセル単位(順次)で出す。
// それ以外(quote/section/image-*)は段階表示を行わない。
const FLOW_LAYOUTS: Layout[] = ['default', 'center', 'title', 'full'];
const ITEM_LAYOUTS: Layout[] = ['split', 'grid', 'cards', 'stats', 'compare', 'timeline'];

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
  let reveal: RevealMode = 'none';
  const classes: string[] = [];
  const kept: SourceLine[] = [];
  // 単独行マーカー(<!-- key --> など)は、次に来る本文ブロックに紐づける。
  const markerAt = new Map<number, Marker>();
  let pending: Marker | null = null;

  for (const ln of raw) {
    const directive = /^\s*<!--\s*(.+?)\s*-->\s*$/.exec(ln.text);
    if (directive) {
      const mk = parseMarker(directive[1]!);
      if (mk) {
        pending = { ...(pending ?? {}), ...mk };
        continue;
      }
      applyDirective(directive[1]!, {
        setLayout: (l) => (layout = l),
        setBackground: (b) => (background = b),
        setReveal: (r) => (reveal = r),
        addClass: (c) => classes.push(c),
      });
      continue;
    }
    if (pending && ln.text.trim() !== '') {
      markerAt.set(kept.length, pending);
      pending = null;
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
  if (COLUMN_LAYOUTS.includes(layout as Layout)) {
    const groups: SourceLine[][] = [];
    let cur: SourceLine[] = [];
    for (const l of bodyLines) {
      if (/^\s*===\s*$/.test(l.text)) {
        groups.push(cur);
        cur = [];
      } else {
        cur.push(l);
      }
    }
    groups.push(cur);
    // 空(空白のみ)の部は落とす。末尾や重複の === で空セルが出ないように。
    columnLines = groups.filter((g) => g.some((l) => l.text.trim() !== ''));
    if (columnLines.length === 0) columnLines = null;
    columns = columnLines
      ? columnLines.map((ls) =>
          ls
            .map((l) => l.text)
            .join('\n')
            .trim(),
        )
      : null;
  }

  const content = bodyLines
    .map((l) => l.text)
    .join('\n')
    .trim();
  // フロー層はマーカーでブロックにステップを割る。アイテム層は render がセルに
  // data-step を付けるので steps は持たない。対象外のレイアウトでは段階表示を切る。
  let outReveal = reveal;
  let steps: SlideStep[] | null = null;
  if (reveal !== 'none') {
    if (FLOW_LAYOUTS.includes(layout)) steps = computeSteps(bodyLines, markerAt, reveal);
    else if (!ITEM_LAYOUTS.includes(layout)) outReveal = 'none';
  }
  const incremental = outReveal !== 'none';
  return {
    content,
    columns,
    notes,
    layout,
    background,
    classes,
    incremental,
    reveal: outReveal,
    steps,
    bodyLines,
    columnLines,
  };
}

// 単独行のディレクティブがマーカーなら解釈する(<!-- key/pin/group/step:N/@N -->)。
function parseMarker(body: string): Marker | null {
  const b = body.trim().toLowerCase();
  if (b === 'key') return { key: true };
  if (b === 'pin' || b === '*') return { pin: true };
  if (b === 'group' || b === '+') return { group: true };
  const sm = /^(?:step:\s*|@)(\d+)$/.exec(b);
  if (sm) return { step: Number(sm[1]) };
  return null;
}

// トップレベルブロックごとのステップ番号を割り当てる。
// 既定は 1,2,3,…(従来の incremental と同じ)。マーカーがあれば上書きする。
// key-first ではキー(無指定なら先頭)が step 1、ほかは step 2 から。
function computeSteps(
  bodyLines: SourceLine[],
  markerAt: Map<number, Marker>,
  reveal: RevealMode,
): SlideStep[] | null {
  if (reveal === 'none') return null;
  const starts = topLevelBlockStarts(bodyLines.map((l) => l.text));
  if (starts.length === 0) return null;
  // マーカーを、それが含まれるブロック(その行以前で最も近い start)へ畳み込む。
  // これで空行を挟まないマーカーや入れ子内のマーカーも取りこぼさない。
  const merged: Marker[] = starts.map(() => ({}));
  for (const [k, m] of markerAt) {
    let idx = -1;
    for (let i = 0; i < starts.length && starts[i]! <= k; i += 1) idx = i;
    if (idx >= 0) merged[idx] = { ...merged[idx], ...m };
  }
  const keyFirst = reveal === 'key-first';
  let keyIdx = merged.findIndex((m) => m.key);
  if (keyFirst && keyIdx === -1) keyIdx = 0;
  const forceKey = keyFirst && keyIdx >= 0;
  let counter = forceKey ? 2 : 1;
  let prev = 1;
  return merged.map((m, idx) => {
    const key = idx === keyIdx;
    let step: number;
    if (m.pin) step = 0;
    else if (forceKey && idx === keyIdx) step = 1;
    else if (typeof m.step === 'number') {
      step = m.step;
      counter = Math.max(counter, step + 1); // 自動採番が明示ステップを追い越さない
    } else if (m.group) step = prev;
    else {
      step = counter;
      counter += 1;
    }
    if (step > 0) prev = step;
    return { step, key };
  });
}

interface DirectiveSink {
  setLayout: (l: Layout) => void;
  setBackground: (b: string) => void;
  setReveal: (r: RevealMode) => void;
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
    else if (key === 'reveal') sink.setReveal(value.toLowerCase() === 'key-first' ? 'key-first' : 'sequential');
    return;
  }
  const word = body.toLowerCase();
  if (word === 'incremental' || word === 'fragment') sink.setReveal('sequential');
  else if ((LAYOUTS as string[]).includes(word)) sink.setLayout(word as Layout);
}
