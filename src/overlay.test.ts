// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyOverlay,
  clampBox,
  ensureSlide,
  fitBoxKeepingAspect,
  isImageShape,
  isTextShape,
  sanitizeOverlay,
  shapeInnerSvg,
  shapeLabel,
  slideOverlay,
  type Overlay,
} from './overlay';

describe('clampBox', () => {
  it('スライド内(0–100)に収める', () => {
    expect(clampBox({ x: -10, y: 120, w: 40, h: 30 })).toEqual({ x: 0, y: 70, w: 40, h: 30 });
  });
  it('最小サイズを保証する', () => {
    const b = clampBox({ x: 10, y: 10, w: 0, h: 1 });
    expect(b.w).toBeGreaterThanOrEqual(3);
    expect(b.h).toBeGreaterThanOrEqual(3);
  });
  it('余分なプロパティは保つ', () => {
    expect(clampBox({ x: 10, y: 10, w: 20, h: 20, id: 'a', kind: 'rect' } as never)).toMatchObject({
      id: 'a',
      kind: 'rect',
    });
  });
});

describe('fitBoxKeepingAspect', () => {
  it('はみ出す箱を縦横比を保って縮め、枠内に収める', () => {
    const out = fitBoxKeepingAspect({ x: 10, y: 10, w: 200, h: 100 }, 'l', 't');
    expect(out.w / out.h).toBeCloseTo(2, 3); // 縦横比 2:1 を維持
    expect(out.w).toBeLessThanOrEqual(100);
    expect(out.h).toBeLessThanOrEqual(100);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBe(10); // 縦は収まっているので上端を保持
  });

  it('反対の端をまたいで潰れた箱(w/h<=0)でも NaN/負値にならず最小サイズに収める', () => {
    // 回帰防止: アスペクト固定リサイズで端を越えると NaN/負の幅になり画像が消えていた。
    const out = fitBoxKeepingAspect({ x: 50, y: 50, w: -20, h: -10 }, 'r', 'b');
    expect(Number.isFinite(out.w) && Number.isFinite(out.h)).toBe(true);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);
    expect(out.w).toBeGreaterThanOrEqual(3);
    expect(out.h).toBeGreaterThanOrEqual(3);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBeGreaterThanOrEqual(0);
    expect(out.x + out.w).toBeLessThanOrEqual(100.001);
    expect(out.y + out.h).toBeLessThanOrEqual(100.001);
  });
});

describe('shapeInnerSvg / shapeLabel / 判定', () => {
  it('種類ごとに対応する図形要素を含む', () => {
    expect(shapeInnerSvg('rect')).toContain('<rect');
    expect(shapeInnerSvg('ellipse')).toContain('<ellipse');
    expect(shapeInnerSvg('triangle')).toContain('<polygon');
    expect(shapeInnerSvg('line')).toContain('<line');
    expect(shapeInnerSvg('arrow')).toContain('<polygon');
    expect(shapeInnerSvg('rect')).toContain('vector-effect="non-scaling-stroke"');
  });
  it('全種類にラベルがある', () => {
    expect(shapeLabel('image')).toBe('画像');
    expect(shapeLabel('text')).toBe('テキスト');
    expect(shapeLabel('rect')).toBe('四角形');
  });
  it('isImageShape / isTextShape が正しく判定する', () => {
    expect(isImageShape({ id: 'a', kind: 'image', x: 0, y: 0, w: 1, h: 1, src: 'data:,', alt: '' })).toBe(true);
    expect(isTextShape({ id: 'b', kind: 'text', x: 0, y: 0, w: 1, h: 1, text: 'x' })).toBe(true);
    expect(isImageShape({ id: 'c', kind: 'rect', x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });
});

describe('ensureSlide / slideOverlay', () => {
  it('無ければ空の構造を返す(空キーも安全)', () => {
    expect(slideOverlay({}, 'sX')).toEqual({ shapes: [] });
    expect(slideOverlay({}, '')).toEqual({ shapes: [] });
  });
  it('ensureSlide は実体を作って返す(スライドIDキー)', () => {
    const o: Overlay = {};
    const s = ensureSlide(o, 'sA1');
    s.shapes.push({ id: 'x', kind: 'rect', x: 1, y: 1, w: 1, h: 1 });
    expect(o['sA1']!.shapes).toHaveLength(1);
  });
});

describe('applyOverlay (DOM)', () => {
  function slide(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'slide';
    el.innerHTML = '<div class="slide-body"><p data-src="0-1">x</p></div>';
    return el;
  }

  it('図形をレイヤに描く', () => {
    const el = slide();
    applyOverlay(el, { shapes: [{ id: 'a', kind: 'ellipse', x: 10, y: 10, w: 30, h: 30 }] });
    const shape = el.querySelector<HTMLElement>('.ov-shapes .ov-shape[data-sid="a"]');
    expect(shape).not.toBeNull();
    expect(shape!.style.left).toBe('10%');
    expect(shape!.querySelector('ellipse')).not.toBeNull();
  });

  it('画像を img として描き、src/alt をエスケープし、javascript: は空にする', () => {
    const el = slide();
    applyOverlay(el, {
      shapes: [
        { id: 'i1', kind: 'image', x: 10, y: 20, w: 30, h: 40, src: 'data:image/png;base64,AAA', alt: 'a"><b' },
        { id: 'i2', kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'javascript:alert(1)', alt: '' },
      ],
    });
    const img = el.querySelector<HTMLImageElement>('.ov-shape-image[data-sid="i1"] img');
    expect(img!.getAttribute('src')).toBe('data:image/png;base64,AAA');
    expect(img!.getAttribute('alt')).toBe('a"><b');
    expect(el.querySelector('.ov-shapes b')).toBeNull();
    expect(el.querySelector<HTMLImageElement>('.ov-shape-image[data-sid="i2"] img')!.getAttribute('src')).toBe('');
  });

  it('テキスト図形を描き、本文をエスケープする', () => {
    const el = slide();
    applyOverlay(el, { shapes: [{ id: 't1', kind: 'text', x: 5, y: 5, w: 30, h: 10, text: '<b>注意</b>' }] });
    const tx = el.querySelector<HTMLElement>('.ov-shape-text[data-sid="t1"] .ov-text');
    expect(tx).not.toBeNull();
    expect(tx!.textContent).toContain('<b>注意</b>'); // 生タグではなくテキストとして
    expect(el.querySelector('.ov-shapes b')).toBeNull();
  });
});

describe('sanitizeOverlay', () => {
  it('不正なキー・未知の種類・id欠落を落とす', () => {
    const clean = sanitizeOverlay({
      0: {
        shapes: [
          { id: 'ok', kind: 'rect', x: 1, y: 1, w: 1, h: 1 },
          { id: 'bad', kind: 'script', x: 1, y: 1, w: 1, h: 1 },
          { kind: 'rect', x: 1, y: 1, w: 1, h: 1 },
        ],
      },
      x: { shapes: [] },
    });
    expect(Object.keys(clean)).toEqual(['0']);
    expect(clean[0]!.shapes.map((s) => s.id)).toEqual(['ok']);
  });

  it('座標を 0–100 に収め、画像の危険な src は空、非正の ar は捨てる', () => {
    const clean = sanitizeOverlay({
      0: {
        shapes: [
          { id: 'r', kind: 'rect', x: -50, y: 200, w: 1000, h: 1000 },
          { id: 'i', kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'javascript:x', alt: 'a', ar: -2 },
        ],
      },
    });
    const r = clean[0]!.shapes[0]!;
    expect(r.w).toBeLessThanOrEqual(100);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
    const img = clean[0]!.shapes[1] as { src: string; ar?: number };
    expect(img.src).toBe('');
    expect(img.ar).toBeUndefined();
  });

  it('テキスト図形の text を保持する', () => {
    const clean = sanitizeOverlay({
      0: { shapes: [{ id: 't', kind: 'text', x: 0, y: 0, w: 10, h: 10, text: 'hello' }] },
    });
    expect((clean[0]!.shapes[0] as { text: string }).text).toBe('hello');
  });
});
