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
// none=段階表示なし / sequential=上から順 / key-first=要点を先に / manual=番号付きだけ順に出し無印は常時表示
export type RevealMode = 'none' | 'sequential' | 'key-first' | 'manual';

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
  // このスライドの原文中の範囲(GUIからディレクティブを書き換えるのに使う)。
  srcStart: number;
  srcEnd: number;
  // 本文を構成する行(ディレクティブ・ノートを除く)を、絶対オフセット付きで保持する。
  bodyLines: SourceLine[];
  // split のとき、各段の本文行。
  columnLines: SourceLine[][] | null;
  // <!-- id: xxx --> で付与する安定ID。自由配置(overlay)の図形をこのIDで紐付け、
  // スライドを並べ替え/削除しても図形が追従するようにする(無指定なら undefined)。
  id?: string;
  // <!-- transition: fade|slide|zoom|none --> でスライド入場の演出を上書き(無指定はデッキ既定)。
  transition?: string;
  // <!-- footer: … --> / <!-- header: … --> でこのスライドのヘッダ/フッタ文言を上書き(無指定はデッキ既定)。
  footer?: string;
  header?: string;
  // <!-- paginate: true|false --> でこのスライドのページ番号表示を上書き(無指定はデッキ既定)。
  paginate?: boolean;
  // <!-- toc --> を置くと、全スライドの見出しから目次(アジェンダ)を自動生成して表示する。
  toc?: boolean;
  // <!-- autoslide: 5 --> でこのスライドの自動送り待ち時間(ms)を上書き。0 はこのスライドで停止。
  autoslide?: number;
  // <!-- hide --> を置くと、このスライドは発表・一覧・書き出しから除外される(原稿には残る)。
  hidden?: boolean;
}

// 受理するスライド遷移の種類。
export const TRANSITIONS = ['none', 'fade', 'slide', 'zoom'] as const;
export type Transition = (typeof TRANSITIONS)[number];

// frontmatter の size:/ratio:/aspect: からデッキの縦横比を得る。"16:9"・"4:3"・"16x9"・
// "1920x1080"・"16/9" を受理。未指定/不正は 16:9。表示(CSS)と書き出し(W/H)の両方で使う。
export function deckRatio(meta: Record<string, string>): { w: number; h: number } {
  const raw = (meta.size ?? meta.ratio ?? meta.aspect ?? '').trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(raw);
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h)) return { w, h };
  }
  return { w: 16, h: 9 };
}

// 自動送り(キオスク)の待ち時間をミリ秒で返す。"5"/"5s" → 5000、"500ms" → 500、
// "off"/"none"/"0" → 0(このスライドは自動送りしない)、不正値 → undefined(無指定扱い)。
// 既定の単位は秒(利用者が秒で考えられるように)。frontmatter と <!-- autoslide --> で共有。
export function parseAutoslideMs(value: string): number | undefined {
  const v = value.trim().toLowerCase();
  if (v === '' ) return undefined;
  if (v === 'off' || v === 'none' || v === 'no' || v === 'false') return 0;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s)?$/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  return m[2] === 'ms' ? Math.round(n) : Math.round(n * 1000);
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
// 専用の単一列デザインを持たない段組系。セルが1つなら本文フロー扱いにしてブロック単位で段階表示する
// (stats/cards/compare/timeline は単一列でも固有レイアウトを保つため含めない)。
const FLOW_FALLBACK_LAYOUTS: Layout[] = ['split', 'grid'];

// 1行ずつ与えると「その行がコードフェンスに保護されているか(フェンス区切り行自体、または開いた
// フェンスの内側)」を返す判定器を作る。CommonMark に倣い、開いたフェンスは同じ文字種・開始以上の
// 長さの行でのみ閉じる。スライド分割・ディレクティブ解析・GUI のディレクティブ除去で同じ規則を共有し、
// 「コード例の中の --- や <!-- ... --> を区切り/指示と誤解しない」挙動を一致させる。
export function fenceScanner(): (text: string) => boolean {
  const re = /^[ \t]*(`{3,}|~{3,})/;
  let open: { ch: string; len: number } | null = null;
  return (text) => {
    const m = text.match(re);
    if (m) {
      const ch = m[1]![0]!;
      const len = m[1]!.length;
      if (!open) open = { ch, len };
      else if (open.ch === ch && len >= open.len) open = null;
      return true; // フェンス区切り行は本文として扱う(指示・区切りにしない)
    }
    return open !== null;
  };
}

// スライド本文から reveal / incremental / fragment の「ディレクティブ行」だけを取り除く。
// コードフェンスの内側にある例示は本文なので残す。reveal はコロン前後の空白を許容(parseDeck と一致)。
// GUI で段階表示モードを切り替えるときに使い、利用者が書いたドキュメントを誤って消さないための処理。
export function stripRevealDirectiveLines(region: string): string {
  const dirRe = /^[ \t]*<!--[ \t]*(?:incremental|fragment|reveal[ \t]*:.*?)[ \t]*-->[ \t]*$/i;
  const protectedLine = fenceScanner();
  return region
    .split('\n')
    .filter((line) => protectedLine(line) || !dirRe.test(line)) // フェンス外の directive 行だけ除去
    .join('\n');
}

export function parseDeck(source: string): Deck {
  const text = source.replace(/\r\n?/g, '\n');
  const all = toLines(text);
  const { meta, bodyStart } = extractFrontmatter(all);
  const body = all.slice(bodyStart);
  const chunks = splitSlides(body, headingDividerLevel(meta));
  // <!-- hide --> のスライドはデッキから除外する(発表・一覧・書き出し対象外。原稿には残る)。
  // パース後に落とすだけなので、残るスライドの絶対オフセット(直接編集の data-src)はずれない。
  const slides = chunks
    .map(parseSlide)
    .filter((s) => (s.content.trim() !== '' || s.notes !== '') && !s.hidden);
  if (slides.length === 0) {
    slides.push(parseSlide(body));
  }
  return { meta, slides };
}

// 並べ替え用に、全スライド(隠し・空も含む)の原文範囲と表示可否を返す。visible は parseDeck の
// フィルタ(空でなく hidden でない)と一致させるので、visible だけ並べると deck.slides と同順になる。
// これを使えば、表示スライドの並べ替え時も隠し/空スライドの原文を取りこぼさずに保てる。
export interface SlideRange {
  srcStart: number;
  srcEnd: number;
  visible: boolean;
}
export function slideRanges(source: string): SlideRange[] {
  const text = source.replace(/\r\n?/g, '\n');
  const all = toLines(text);
  const { meta, bodyStart } = extractFrontmatter(all);
  const body = all.slice(bodyStart);
  return splitSlides(body, headingDividerLevel(meta))
    .map(parseSlide)
    .map((s) => ({
      srcStart: s.srcStart,
      srcEnd: s.srcEnd,
      visible: (s.content.trim() !== '' || s.notes !== '') && !s.hidden,
    }));
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

// frontmatter の headingDivider / slideDividers から、スライド分割の見出しレベル(1-6)を得る。
// "2" のような数値、または "##" のようなハッシュ列を受理する。未指定/不正は 0(分割しない)。
function headingDividerLevel(meta: Record<string, string>): number {
  const raw = (meta.headingdivider ?? meta.slidedividers ?? meta['heading-divider'] ?? '').trim();
  if (!raw) return 0;
  if (/^#+$/.test(raw)) return Math.min(raw.length, 6);
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 0;
}

// 本文を単独行 --- でスライドに分割する。headingLevel>0 のときは、指定レベル以下の見出し行の
// 直前でも新しいスライドを始める(フラットな見出しの並びを手作業の --- なしでデッキにする)。
// コードフェンス内の --- / 見出しは分割に使わない(コード例を壊さない)。
function splitSlides(body: SourceLine[], headingLevel = 0): SourceLine[][] {
  const out: SourceLine[][] = [];
  let buf: SourceLine[] = [];
  const protectedLine = fenceScanner();
  for (const ln of body) {
    const prot = protectedLine(ln.text);
    if (!prot && /^\s*---\s*$/.test(ln.text)) {
      out.push(buf);
      buf = [];
      continue;
    }
    if (!prot && headingLevel > 0) {
      const hm = /^(#{1,6})\s/.exec(ln.text);
      if (hm && hm[1]!.length <= headingLevel) {
        // 末尾の「空行＋ディレクティブ/マーカーのコメント行」は、見出しの直前に書かれた=次スライドに
        // 属する指示なので、前スライドに残さず次のバッファへ持ち越す(手動 --- と同じ直感に合わせる)。
        const carry: SourceLine[] = [];
        while (buf.length) {
          const t = buf[buf.length - 1]!.text.trim();
          if (t === '' || /^<!--.*-->$/.test(t)) carry.unshift(buf.pop()!);
          else break;
        }
        // 本文ブロックが残っているときだけ前スライドを確定する(指示だけの塊はスライドにしない)。
        if (buf.some((l) => l.text.trim() !== '')) out.push(buf);
        buf = carry;
      }
    }
    buf.push(ln);
  }
  out.push(buf);
  return out;
}

function parseSlide(raw: SourceLine[]): Slide {
  let layout: Layout = 'default';
  let background: string | null = null;
  let reveal: RevealMode = 'none';
  let slideId: string | undefined;
  let transition: string | undefined;
  let footer: string | undefined;
  let header: string | undefined;
  let paginate: boolean | undefined;
  let toc: boolean | undefined;
  let autoslide: number | undefined;
  let hidden: boolean | undefined;
  const classes: string[] = [];
  const kept: SourceLine[] = [];
  // 単独行マーカー(<!-- key --> など)は、次に来る本文ブロックに紐づける。
  const markerAt = new Map<number, Marker>();
  let pending: Marker | null = null;
  const protectedLine = fenceScanner(); // コードフェンス内の <!-- ... --> は本文(指示として解釈しない)

  for (const ln of raw) {
    const directive = protectedLine(ln.text) ? null : /^\s*<!--\s*(.+?)\s*-->\s*$/.exec(ln.text);
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
        setId: (v) => (slideId = v),
        setTransition: (t) => (transition = t),
        setFooter: (v) => (footer = v),
        setHeader: (v) => (header = v),
        setPaginate: (v) => (paginate = v),
        setToc: () => (toc = true),
        setAutoslide: (ms) => (autoslide = ms),
        setHidden: () => (hidden = true),
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
  // ??? もコードフェンスの外側だけをノート開始とみなす(コード例の ??? で本文を切らない)。
  let noteIdx = -1;
  {
    const protectedLine = fenceScanner();
    for (let i = 0; i < kept.length; i += 1) {
      const prot = protectedLine(kept[i]!.text);
      if (!prot && /^\s*\?\?\?\s*$/.test(kept[i]!.text)) {
        noteIdx = i;
        break;
      }
    }
  }
  if (noteIdx !== -1) {
    bodyLines = kept.slice(0, noteIdx);
    notes = kept
      .slice(noteIdx + 1)
      .map((l) => l.text)
      .join('\n')
      .trim();
    // ??? 以降(ノート領域)に書かれた key/step/group/pin マーカーは本文に適用しない。
    // 残すと computeSteps が範囲外マーカーを最終本文ブロックへ畳み込み、誤って pin/key が付く。
    for (const k of [...markerAt.keys()]) if (k >= noteIdx) markerAt.delete(k);
  }

  let columns: string[] | null = null;
  let columnLines: SourceLine[][] | null = null;
  if (COLUMN_LAYOUTS.includes(layout as Layout)) {
    const groups: SourceLine[][] = [];
    let cur: SourceLine[] = [];
    const protectedLine = fenceScanner(); // コードフェンス内の === では段を割らない(コードブロックを壊さない)
    for (const l of bodyLines) {
      if (!protectedLine(l.text) && /^\s*===\s*$/.test(l.text)) {
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
  // 段階表示の振り分け:
  // - フロー層、または「===で割れていない split/grid(セルが1つ)」はブロック単位でステップ(マーカー対応)。
  // - それ以外の段組系(stats/cards/compare/timeline)はレイアウトを保ったまま render が data-step を付与。
  //   ※ ここで columns を null にするとレイアウト自体が壊れる(stats の大数字等が消える)ので決して落とさない。
  // - 複数セルの段組系もセル順に表示。key-first は順次に落とす。
  // - quote/section/image-* は段階表示なし。
  let outReveal: RevealMode = reveal;
  let steps: SlideStep[] | null = null;
  if (reveal !== 'none') {
    const isFlow = FLOW_LAYOUTS.includes(layout);
    const isItem = ITEM_LAYOUTS.includes(layout);
    const singleCol = !columnLines || columnLines.length <= 1;
    // body に === 区切りがあるか(空セルが除かれて1列になっていても、元は段組指定)。
    const hasSep = ((): boolean => {
      // === 区切りの有無もフェンス対応で判定(コード内の === で誤って段組扱いにしない)。
      const protectedLine = fenceScanner();
      for (const l of bodyLines) if (!protectedLine(l.text) && /^\s*===\s*$/.test(l.text)) return true;
      return false;
    })();
    // 専用の単一列デザインを持たない split/grid を、かつ === を書いていないときだけフロー描画へ。
    // === を書いた段組はたとえ1列でも段組のまま描く(フローに落とすと === が本文に漏れる)。
    const flowFallback = FLOW_FALLBACK_LAYOUTS.includes(layout) && singleCol && !hasSep;
    if (isFlow || flowFallback) {
      if (flowFallback) {
        columns = null;
        columnLines = null; // フロー描画にしてブロック単位で段階表示する
      }
      steps = computeSteps(bodyLines, markerAt, reveal);
    } else if (isItem) {
      if (reveal === 'key-first') outReveal = 'sequential';
    } else {
      outReveal = 'none';
    }
  }
  const incremental = outReveal !== 'none';
  const srcStart = raw.length ? raw[0]!.offset : 0;
  const lastRaw = raw.length ? raw[raw.length - 1]! : null;
  const srcEnd = lastRaw ? lastRaw.offset + lastRaw.text.length : 0;
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
    srcStart,
    srcEnd,
    bodyLines,
    columnLines,
    id: slideId,
    transition,
    footer,
    header,
    paginate,
    toc,
    autoslide,
    hidden,
  };
}

// ブロック直前の段階表示マーカー(key/pin/group/step:N/@N/*/+)1行を表す正規表現。
const BLOCK_MARKER_RE = /^[ \t]*<!--[ \t]*(?:key|pin|group|\*|\+|step[ \t]*:[ \t]*\d+|@\d+)[ \t]*-->[ \t]*$/i;
export type BlockMarker = 'auto' | 'key' | 'group' | 'pin' | `step:${number}`;

// マーカー種別を directive 本文へ。'auto' は「マーカー無し」を表す。
function markerDirective(marker: BlockMarker): string | null {
  if (marker === 'auto') return null;
  if (marker === 'key' || marker === 'group' || marker === 'pin') return `<!-- ${marker} -->`;
  const m = /^step:(\d+)$/.exec(marker);
  if (m) return `<!-- step: ${m[1]} -->`;
  return null;
}

// 指定ブロック(絶対オフセット blockStart の行)の直前にあるマーカー行を置き換える/取り除く。
// parseSlide はマーカーを「次の非空行」へ付与するため、空行を挟んだマーカーや複数行のマーカーも
// 対象にする(直前の連続する「空行＋マーカー行」を遡り、マーカー行だけ除去して新しいものを置く)。
// 'auto' は既存マーカーを外すだけ。GUI でブロックの段階表示の役割/順番を設定する純粋関数。
export function setBlockMarker(source: string, blockStart: number, marker: BlockMarker): string {
  const lines = source.split('\n');
  // blockStart が何行目か(行頭オフセットの一致で判定)。
  let acc = 0;
  let blockLine = lines.length - 1;
  for (let i = 0; i < lines.length; i += 1) {
    const next = acc + lines[i]!.length + 1;
    if (blockStart < next) {
      blockLine = i;
      break;
    }
    acc = next;
  }
  // ブロック行の直前から、空行とマーカー行が続く範囲を遡る。マーカー行は捨て、空行は保つ。
  const keptBlanks: string[] = [];
  let runStart = blockLine;
  for (let j = blockLine - 1; j >= 0; j -= 1) {
    const line = lines[j]!;
    if (BLOCK_MARKER_RE.test(line)) {
      runStart = j;
    } else if (line.trim() === '') {
      keptBlanks.unshift(line);
      runStart = j;
    } else {
      break;
    }
  }
  const dir = markerDirective(marker);
  // 既存の「空行＋マーカー」範囲を、保った空行＋(必要なら)新マーカーで置き換える。新マーカーは
  // ブロック直前に隣接させる(空行 → マーカー → ブロック)。
  const replacement = dir ? [...keptBlanks, dir] : [...keptBlanks];
  lines.splice(runStart, blockLine - runStart, ...replacement);
  return lines.join('\n');
}

// ブロックを削除するときの開始オフセット。直前にぶら下がる段階表示マーカー行も巻き込んで消す
// (でないとマーカーが残り、次のブロックに番号/役割が継承されてしまう)。マーカーが無ければ
// blockStart をそのまま返す。マーカーの上にある区切りの空行は残す。
export function deleteStartWithMarkers(source: string, blockStart: number): number {
  const lines = source.split('\n');
  let acc = 0;
  let blockLine = lines.length - 1;
  for (let i = 0; i < lines.length; i += 1) {
    const next = acc + lines[i]!.length + 1;
    if (blockStart < next) {
      blockLine = i;
      break;
    }
    acc = next;
  }
  let topMarker = -1;
  for (let j = blockLine - 1; j >= 0; j -= 1) {
    if (BLOCK_MARKER_RE.test(lines[j]!)) topMarker = j;
    else if (lines[j]!.trim() === '') continue; // 空行はまたいで上のマーカーを探す
    else break; // 本文に当たったら終了
  }
  if (topMarker < 0) return blockStart;
  let off = 0;
  for (let i = 0; i < topMarker; i += 1) off += lines[i]!.length + 1;
  return off;
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
  if (keyFirst && keyIdx === -1) {
    // 明示が無ければ最初の見出しブロックをキーに(導入文ではなく要点を先頭に)。無ければ先頭。
    keyIdx = starts.findIndex((s) => /^#{1,6}\s/.test((bodyLines[s]?.text ?? '').trim()));
    if (keyIdx === -1) keyIdx = 0;
  }
  const forceKey = keyFirst && keyIdx >= 0;
  // manual: step:N / group(直前と同番号)で番号を付けたブロックだけが順に出る。無印は常時表示(step 0)。
  // key 単独や pin は常時表示(step 0)、番号で出したいときは step:N と併用する。
  const manual = reveal === 'manual';
  let counter = forceKey ? 2 : 1;
  // group は「直前の段の番号」に合わせる。manual で先行する番号がまだ無ければ常時表示(0)に。
  let prev = manual ? 0 : 1;
  const result = merged.map((m, idx) => {
    const key = idx === keyIdx;
    let step: number;
    if (m.pin) step = 0;
    else if (forceKey && idx === keyIdx) step = 1;
    else if (typeof m.step === 'number') {
      step = m.step;
      counter = Math.max(counter, step + 1); // 自動採番が明示ステップを追い越さない
    } else if (m.group) step = prev;
    else if (manual) step = 0; // 無印ブロックは常時表示
    else {
      step = counter;
      counter += 1;
    }
    if (step > 0) prev = step;
    return { step, key };
  });
  // ステップ番号を 1..K の連番に詰める(0=ピンは据え置き)。空きステップでの「無反応Next」を防ぐ。
  const distinct = [...new Set(result.filter((r) => r.step > 0).map((r) => r.step))].sort((a, b) => a - b);
  const remap = new Map(distinct.map((v, i) => [v, i + 1]));
  for (const r of result) if (r.step > 0) r.step = remap.get(r.step) ?? r.step;
  return result;
}

interface DirectiveSink {
  setLayout: (l: Layout) => void;
  setBackground: (b: string) => void;
  setReveal: (r: RevealMode) => void;
  addClass: (c: string) => void;
  setId: (id: string) => void;
  setTransition: (t: string) => void;
  setFooter: (v: string) => void;
  setHeader: (v: string) => void;
  setPaginate: (v: boolean) => void;
  setToc: () => void;
  setAutoslide: (ms: number) => void;
  setHidden: () => void;
}

function applyDirective(body: string, sink: DirectiveSink): void {
  const kv = /^([\w-]+)\s*:\s*(.+)$/.exec(body);
  if (kv) {
    const key = kv[1]!.toLowerCase();
    const value = kv[2]!.trim();
    if (key === 'layout' && (LAYOUTS as string[]).includes(value)) sink.setLayout(value as Layout);
    else if (key === 'transition' && (TRANSITIONS as readonly string[]).includes(value.toLowerCase())) {
      sink.setTransition(value.toLowerCase());
    } else if (key === 'footer') sink.setFooter(value);
    else if (key === 'header') sink.setHeader(value);
    else if (key === 'paginate') sink.setPaginate(/^(true|on|yes|1)$/i.test(value));
    else if (key === 'autoslide' || key === 'autoadvance') {
      const ms = parseAutoslideMs(value);
      if (ms !== undefined) sink.setAutoslide(ms);
    }
    else if (key === 'class') value.split(/\s+/).forEach((c) => sink.addClass(c));
    // id は安全な文字・64字以内のみ受理(overlay 保存側の検証と対称に。長すぎ/不正は無視)。
    else if (key === 'id' && /^[\w-]{1,64}$/.test(value)) sink.setId(value);
    else if (key === 'bg' || key === 'background') sink.setBackground(value);
    else if (key === 'reveal') {
      const v = value.toLowerCase();
      sink.setReveal(v === 'key-first' ? 'key-first' : v === 'manual' ? 'manual' : 'sequential');
    }
    return;
  }
  const word = body.toLowerCase();
  if (word === 'incremental' || word === 'fragment') sink.setReveal('sequential');
  else if (word === 'paginate') sink.setPaginate(true);
  else if (word === 'toc' || word === 'agenda') sink.setToc();
  else if (word === 'hide' || word === 'hidden' || word === 'skip') sink.setHidden();
  else if ((LAYOUTS as string[]).includes(word)) sink.setLayout(word as Layout);
}
