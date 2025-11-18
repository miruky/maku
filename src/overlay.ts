// スライド上の「自由配置・図形」を扱うオーバーレイ層。
// PowerPoint のように、ブロックの位置変更や図形の挿入を Markdown とは別に保持する。
// 方針:
// - 位置/サイズ・図形は localStorage に保存し、Markdown 本文は汚さない(文字内容だけが md)。
// - 座標はスライドに対する百分率(0–100)。16:9 のどの表示サイズでも崩れない。
// - ブロックは描画順の index で識別する(文字編集では不変、構成変更には弱いが実用的)。

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow';

export interface Box {
  x: number; // 左上X(%)
  y: number; // 左上Y(%)
  w: number; // 幅(%)
  h: number; // 高さ(%)
}

export interface Shape extends Box {
  id: string;
  kind: ShapeKind;
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

export function loadOverlay(): Overlay {
  try {
    const raw = localStorage.getItem(KEY);
    const o = raw ? (JSON.parse(raw) as Overlay) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function saveOverlay(o: Overlay): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    // 保存失敗は無視
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
export function shapeInnerSvg(kind: ShapeKind): string {
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
  return { rect: '四角形', ellipse: '円・楕円', triangle: '三角形', line: '直線', arrow: '矢印' }[kind];
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
    .map(
      (s) =>
        `<div class="ov-shape ov-shape-${s.kind}" data-sid="${s.id}" style="left:${s.x}%;top:${s.y}%;width:${s.w}%;height:${s.h}%">${shapeInnerSvg(s.kind)}</div>`,
    )
    .join('');
}
