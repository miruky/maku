// スライド上の「自由配置・図形」を扱うオーバーレイ層。
// PowerPoint のように、ブロックの位置変更や図形の挿入を Markdown とは別に保持する。
// 方針:
// - 位置/サイズ・図形は localStorage に保存し、Markdown 本文は汚さない(文字内容だけが md)。
// - 座標はスライドに対する百分率(0–100)。16:9 のどの表示サイズでも崩れない。
// - ブロックは描画順の index で識別する(文字編集では不変、構成変更には弱いが実用的)。

// 図形の種類。vector は SVG で描く図形、image は src/alt を持つ自由配置の画像。
export type VectorKind = 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow';
export type ShapeKind = VectorKind | 'image';

export interface Box {
  x: number; // 左上X(%)
  y: number; // 左上Y(%)
  w: number; // 幅(%)
  h: number; // 高さ(%)
}

export interface ShapeBase extends Box {
  id: string;
}
export interface VectorShape extends ShapeBase {
  kind: VectorKind;
}
export interface ImageShape extends ShapeBase {
  kind: 'image';
  src: string; // dataURL もしくは http(s) URL
  alt: string; // 代替テキスト
  ar?: number; // 取り込み時の縦横比 w/h(アスペクト固定リサイズ用)
}
export type Shape = VectorShape | ImageShape;

export function isImageShape(s: Shape): s is ImageShape {
  return s.kind === 'image';
}

// md ブロックの位置上書き。高さは内容なりなので任意。
export interface BlockBox {
  x: number;
  y: number;
  w: number;
  h?: number;
}

export interface SlideOverlay {
  blocks: Record<number, BlockBox>; // ブロックindex → 位置
  shapes: Shape[];
}

export type Overlay = Record<number, SlideOverlay>; // スライドindex → オーバーレイ

const KEY = 'maku.overlay';

const SHAPE_KINDS: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'line', 'arrow', 'image'];
const finite = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

// localStorage は書き換えられうるので、読み込み時に型と値を検証して取り込む。
// 不正な図形(未知の種類・javascript: の src など)は落とし、注入を防ぐ。
export function sanitizeOverlay(input: unknown): Overlay {
  if (!input || typeof input !== 'object') return {};
  const out: Overlay = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || !v || typeof v !== 'object') continue;
    const slide = v as { blocks?: unknown; shapes?: unknown };
    const blocks: Record<number, BlockBox> = {};
    if (slide.blocks && typeof slide.blocks === 'object') {
      for (const [bk, bv] of Object.entries(slide.blocks as Record<string, unknown>)) {
        const bi = Number(bk);
        if (!Number.isInteger(bi) || bi < 0 || !bv || typeof bv !== 'object') continue;
        const b = bv as Record<string, unknown>;
        const hasH = typeof b.h === 'number' && Number.isFinite(b.h);
        const c = clampBox({ x: finite(b.x), y: finite(b.y), w: finite(b.w, 10), h: hasH ? (b.h as number) : 10 });
        const box: BlockBox = { x: c.x, y: c.y, w: c.w };
        if (hasH) box.h = c.h;
        blocks[bi] = box;
      }
    }
    const shapes: Shape[] = [];
    if (Array.isArray(slide.shapes)) {
      for (const sv of slide.shapes) {
        if (!sv || typeof sv !== 'object') continue;
        const sh = sv as Record<string, unknown>;
        if (typeof sh.id !== 'string' || !SHAPE_KINDS.includes(sh.kind as ShapeKind)) continue;
        const base = clampBox({ id: sh.id, x: finite(sh.x), y: finite(sh.y), w: finite(sh.w, 10), h: finite(sh.h, 10) });
        if (sh.kind === 'image') {
          const src = typeof sh.src === 'string' && /^(https?:|data:)/.test(sh.src) ? sh.src : '';
          shapes.push({
            ...base,
            kind: 'image',
            src,
            alt: typeof sh.alt === 'string' ? sh.alt : '',
            ...(typeof sh.ar === 'number' && Number.isFinite(sh.ar) && sh.ar > 0 ? { ar: sh.ar } : {}),
          });
        } else {
          shapes.push({ ...base, kind: sh.kind as VectorKind });
        }
      }
    }
    out[i] = { blocks, shapes };
  }
  return out;
}

export function loadOverlay(): Overlay {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeOverlay(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

// 保存の成否を返す。画像など容量超過(QuotaExceededError)をUI側で知らせるため。
export function saveOverlay(o: Overlay): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
    return true;
  } catch {
    return false;
  }
}

export function slideOverlay(o: Overlay, slide: number): SlideOverlay {
  const s = o[slide];
  return s ? { blocks: s.blocks ?? {}, shapes: s.shapes ?? [] } : { blocks: {}, shapes: [] };
}

export function ensureSlide(o: Overlay, slide: number): SlideOverlay {
  if (!o[slide]) o[slide] = { blocks: {}, shapes: [] };
  const s = o[slide];
  if (!s.blocks) s.blocks = {};
  if (!s.shapes) s.shapes = [];
  return s;
}

export function newId(): string {
  return 's' + Math.random().toString(36).slice(2, 9);
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// 箱をスライド内(0–100)に収める。最小サイズも保証する。
export function clampBox<T extends Box>(b: T): T {
  const w = clamp(b.w, 3, 100);
  const h = clamp(b.h, 3, 100);
  return { ...b, w, h, x: clamp(b.x, 0, 100 - w), y: clamp(b.y, 0, 100 - h) };
}

// ブロック削除時、index をキーにしたマップを詰め直す(削除位置より後ろを1つ前へ)。
export function reindexAfterDelete(blocks: Record<number, BlockBox>, removed: number): Record<number, BlockBox> {
  const out: Record<number, BlockBox> = {};
  for (const k of Object.keys(blocks)) {
    const i = Number(k);
    if (i < removed) out[i] = blocks[i]!;
    else if (i > removed) out[i - 1] = blocks[i]!;
  }
  return out;
}

// 図形1つの内側SVG。viewBox を 0..100 に取り、preserveAspectRatio=none で箱に引き伸ばす。
// 線幅は vector-effect=non-scaling-stroke で一定に保つ。色は currentColor(テーマのアクセント)。
export function shapeInnerSvg(kind: VectorKind): string {
  const open = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">';
  const fillCommon = 'fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"';
  const lineCommon = 'stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linecap="round"';
  let body: string;
  switch (kind) {
    case 'rect':
      body = `<rect x="1.5" y="1.5" width="97" height="97" rx="3" ${fillCommon}/>`;
      break;
    case 'ellipse':
      body = `<ellipse cx="50" cy="50" rx="48.5" ry="48.5" ${fillCommon}/>`;
      break;
    case 'triangle':
      body = `<polygon points="50,2 98,98 2,98" ${fillCommon}/>`;
      break;
    case 'line':
      body = `<line x1="2" y1="50" x2="98" y2="50" ${lineCommon}/>`;
      break;
    case 'arrow':
      body =
        `<line x1="2" y1="50" x2="93" y2="50" ${lineCommon}/>` +
        `<polygon points="99,50 88,44 88,56" fill="currentColor" stroke="none"/>`;
      break;
  }
  return open + body + '</svg>';
}

export function shapeLabel(kind: ShapeKind): string {
  return { rect: '四角形', ellipse: '円・楕円', triangle: '三角形', line: '直線', arrow: '矢印', image: '画像' }[
    kind
  ];
}

// 描画済みスライド要素にオーバーレイを反映する。
// - ブロック(data-src)に index(data-bi)を振り、位置指定があれば絶対配置にする。
// - 図形は専用レイヤ(.ov-shapes)へ描く。
export function applyOverlay(slideEl: Element, ov: SlideOverlay): void {
  const blocks = Array.from(slideEl.querySelectorAll<HTMLElement>('.slide-body [data-src]'));
  blocks.forEach((b, i) => {
    b.dataset.bi = String(i);
    const pos = ov.blocks[i];
    if (pos) {
      b.style.position = 'absolute';
      b.style.left = `${pos.x}%`;
      b.style.top = `${pos.y}%`;
      b.style.width = `${pos.w}%`;
      b.style.height = pos.h != null ? `${pos.h}%` : '';
      b.style.maxWidth = 'none';
      b.classList.add('ov-placed');
    } else {
      b.style.position = '';
      b.style.left = '';
      b.style.top = '';
      b.style.width = '';
      b.style.height = '';
      b.style.maxWidth = '';
      b.classList.remove('ov-placed');
    }
  });

  let layer = slideEl.querySelector<HTMLElement>('.ov-shapes');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'ov-shapes';
    slideEl.appendChild(layer);
  }
  layer.innerHTML = ov.shapes
    .map((s) => {
      const pos = `left:${s.x}%;top:${s.y}%;width:${s.w}%;height:${s.h}%`;
      if (s.kind === 'image') {
        const safe = /^(https?:|data:)/.test(s.src) ? s.src : '';
        return (
          `<div class="ov-shape ov-shape-image" data-sid="${attrEsc(s.id)}" style="${pos}">` +
          `<img src="${attrEsc(safe)}" alt="${attrEsc(s.alt)}" draggable="false" /></div>`
        );
      }
      return `<div class="ov-shape ov-shape-${s.kind}" data-sid="${attrEsc(s.id)}" style="${pos}">${shapeInnerSvg(s.kind)}</div>`;
    })
    .join('');
}

// 属性値エスケープ。src/alt/id を style/属性から脱出させない。
function attrEsc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
