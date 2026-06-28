// スライド上の「自由配置レイヤ」を扱うオーバーレイ層。
// 方針(改訂):
// - Markdown 本文のブロックはレイアウトが配置する(自由移動はしない)。その場のテキスト編集だけ可能。
// - 「自由配置」したいものは、このオーバーレイ層に置く: テキストボックス・図形・画像。
//   これらは安定した id で識別し、座標はスライドに対する百分率(0–100)で持つ。
// - オーバーレイは localStorage に保存し、Markdown 本文は汚さない。
// - 以前の「Markdown ブロックを index で自由配置する」しくみ(壊れやすかった)は廃止した。

export type VectorKind = 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow';
export type ShapeKind = VectorKind | 'image' | 'text';

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
export interface TextShape extends ShapeBase {
  kind: 'text';
  text: string; // プレーンテキスト(改行可)
}
export type Shape = VectorShape | ImageShape | TextShape;

export function isImageShape(s: Shape): s is ImageShape {
  return s.kind === 'image';
}
export function isTextShape(s: Shape): s is TextShape {
  return s.kind === 'text';
}

export interface SlideOverlay {
  shapes: Shape[];
}

export type Overlay = Record<number, SlideOverlay>; // スライドindex → オーバーレイ

const KEY = 'maku.overlay2'; // 旧 index ベースのデータと混ざらないよう鍵を変える

const VECTOR_KINDS: VectorKind[] = ['rect', 'ellipse', 'triangle', 'line', 'arrow'];
const SHAPE_KINDS: ShapeKind[] = [...VECTOR_KINDS, 'image', 'text'];
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
    const slide = v as { shapes?: unknown };
    const shapes: Shape[] = [];
    if (Array.isArray(slide.shapes)) {
      for (const sv of slide.shapes) {
        if (!sv || typeof sv !== 'object') continue;
        const sh = sv as Record<string, unknown>;
        if (typeof sh.id !== 'string' || !SHAPE_KINDS.includes(sh.kind as ShapeKind)) continue;
        const base = clampBox({
          id: sh.id,
          x: finite(sh.x),
          y: finite(sh.y),
          w: finite(sh.w, 10),
          h: finite(sh.h, 10),
        });
        if (sh.kind === 'image') {
          const src = typeof sh.src === 'string' && /^(https?:|data:)/.test(sh.src) ? sh.src : '';
          shapes.push({
            ...base,
            kind: 'image',
            src,
            alt: typeof sh.alt === 'string' ? sh.alt : '',
            ...(typeof sh.ar === 'number' && Number.isFinite(sh.ar) && sh.ar > 0 ? { ar: sh.ar } : {}),
          });
        } else if (sh.kind === 'text') {
          shapes.push({ ...base, kind: 'text', text: typeof sh.text === 'string' ? sh.text : '' });
        } else {
          shapes.push({ ...base, kind: sh.kind as VectorKind });
        }
      }
    }
    out[i] = { shapes };
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
  return s ? { shapes: s.shapes ?? [] } : { shapes: [] };
}

export function ensureSlide(o: Overlay, slide: number): SlideOverlay {
  if (!o[slide]) o[slide] = { shapes: [] };
  const s = o[slide];
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

// 箱を縦横比を保ったままスライド内に収める(画像のアスペクト固定リサイズ用)。
// はみ出すときは「掴んでいる端(anchor)」を固定したまま両辺を同じ率で縮める。
export function fitBoxKeepingAspect(b: Box, anchorX: 'l' | 'r' | 'c', anchorY: 't' | 'b' | 'c'): Box {
  let { x, y, w, h } = b;
  const right = x + w;
  const bottom = y + h;
  // 反対の端をまたいで潰れた箱(w/h <= 0)でも倍率が Infinity/NaN にならないよう、先に正の最小値へ。
  w = Math.max(w, 0.01);
  h = Math.max(h, 0.01);
  // 最小・最大に対する倍率を求め、両辺へ同率で適用。
  let scale = 1;
  if (w > 100) scale = Math.min(scale, 100 / w);
  if (h > 100) scale = Math.min(scale, 100 / h);
  if (w < 3) scale = Math.max(scale, 3 / w);
  if (h < 3) scale = Math.max(scale, 3 / h);
  w *= scale;
  h *= scale;
  // anchor を固定して再配置。
  if (anchorX === 'r') x = right - w;
  else if (anchorX === 'c') x = b.x + b.w / 2 - w / 2;
  if (anchorY === 'b') y = bottom - h;
  else if (anchorY === 'c') y = b.y + b.h / 2 - h / 2;
  // 最後にスライド内へ平行移動(サイズは変えない)。
  x = clamp(x, 0, 100 - w);
  y = clamp(y, 0, 100 - h);
  return { ...b, x, y, w, h };
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
  return {
    rect: '四角形',
    ellipse: '円・楕円',
    triangle: '三角形',
    line: '直線',
    arrow: '矢印',
    image: '画像',
    text: 'テキスト',
  }[kind];
}

// 描画済みスライド要素に、自由配置のオーバーレイ(図形・画像・テキスト)を専用レイヤへ描く。
export function applyOverlay(slideEl: Element, ov: SlideOverlay): void {
  let layer = slideEl.querySelector<HTMLElement>('.ov-shapes');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'ov-shapes';
    slideEl.appendChild(layer);
  }
  layer.innerHTML = ov.shapes.map(shapeHtml).join('');
}

function shapeHtml(s: Shape): string {
  const pos = `left:${s.x}%;top:${s.y}%;width:${s.w}%;height:${s.h}%`;
  if (s.kind === 'image') {
    const safe = /^(https?:|data:)/.test(s.src) ? s.src : '';
    return (
      `<div class="ov-shape ov-shape-image" data-sid="${attrEsc(s.id)}" style="${pos}">` +
      `<img src="${attrEsc(safe)}" alt="${attrEsc(s.alt)}" draggable="false" /></div>`
    );
  }
  if (s.kind === 'text') {
    return (
      `<div class="ov-shape ov-shape-text" data-sid="${attrEsc(s.id)}" style="${pos}">` +
      `<div class="ov-text">${textHtml(s.text)}</div></div>`
    );
  }
  return `<div class="ov-shape ov-shape-${s.kind}" data-sid="${attrEsc(s.id)}" style="${pos}">${shapeInnerSvg(s.kind)}</div>`;
}

// テキストはエスケープし、改行を <br> に。空なら淡いプレースホルダを出す。
function textHtml(text: string): string {
  if (text.trim() === '') return '<span class="ov-text-ph">テキスト</span>';
  return attrEsc(text).replace(/\n/g, '<br />');
}

// 属性値・本文エスケープ。src/alt/id/text を style/属性/HTMLから脱出させない。
function attrEsc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
