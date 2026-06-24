// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyOverlay,
  clampBox,
  ensureSlide,
  isImageShape,
  reindexAfterDelete,
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
  it('はみ出す位置は端へ寄せる', () => {
    expect(clampBox({ x: 80, y: 80, w: 40, h: 40 })).toEqual({ x: 60, y: 60, w: 40, h: 40 });
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

describe('reindexAfterDelete', () => {
  it('削除位置より後ろのキーを1つ前へ詰める', () => {
    const blocks = {
      0: { x: 1, y: 1, w: 1 },
      1: { x: 2, y: 2, w: 2 },
      3: { x: 3, y: 3, w: 3 },
    };
    const out = reindexAfterDelete(blocks, 1);
    expect(out[0]).toEqual({ x: 1, y: 1, w: 1 });
    expect(out[1]).toBeUndefined();
    expect(out[2]).toEqual({ x: 3, y: 3, w: 3 }); // 3 が 2 へ
  });
});

describe('shapeInnerSvg', () => {
  it('種類ごとに対応する図形要素を含む', () => {
    expect(shapeInnerSvg('rect')).toContain('<rect');
    expect(shapeInnerSvg('ellipse')).toContain('<ellipse');
    expect(shapeInnerSvg('triangle')).toContain('<polygon');
    expect(shapeInnerSvg('line')).toContain('<line');
    expect(shapeInnerSvg('arrow')).toContain('<polygon'); // 矢じり
    expect(shapeInnerSvg('rect')).toContain('vector-effect="non-scaling-stroke"');
  });
});

describe('ensureSlide / slideOverlay', () => {
  it('無ければ空の構造を返す', () => {
    expect(slideOverlay({}, 0)).toEqual({ blocks: {}, shapes: [] });
  });
  it('ensureSlide は実体を作って返す', () => {
    const o: Overlay = {};
    const s = ensureSlide(o, 2);
    s.shapes.push({ id: 'x', kind: 'rect', x: 1, y: 1, w: 1, h: 1 });
    expect(o[2]!.shapes).toHaveLength(1);
  });
});

describe('applyOverlay (DOM)', () => {
  function slide(blocksHtml: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'slide';
    el.innerHTML = `<div class="slide-body">${blocksHtml}</div>`;
    return el;
  }

  it('位置指定したブロックを絶対配置にし、data-bi を振る', () => {
    const el = slide('<h2 data-src="0-5">A</h2><p data-src="6-9">B</p>');
    applyOverlay(el, { blocks: { 1: { x: 20, y: 30, w: 40 } }, shapes: [] });
    const blocks = el.querySelectorAll<HTMLElement>('.slide-body [data-src]');
    expect(blocks[0]!.dataset.bi).toBe('0');
    expect(blocks[1]!.style.position).toBe('absolute');
    expect(blocks[1]!.style.left).toBe('20%');
    expect(blocks[1]!.style.width).toBe('40%');
    expect(blocks[0]!.style.position).toBe('');
  });

  it('図形をレイヤに描く', () => {
    const el = slide('<p data-src="0-1">x</p>');
    applyOverlay(el, { blocks: {}, shapes: [{ id: 'a', kind: 'ellipse', x: 10, y: 10, w: 30, h: 30 }] });
    const shape = el.querySelector<HTMLElement>('.ov-shapes .ov-shape[data-sid="a"]');
    expect(shape).not.toBeNull();
    expect(shape!.style.left).toBe('10%');
    expect(shape!.querySelector('ellipse')).not.toBeNull();
  });

  it('画像シェイプを img として描き、src/alt をエスケープする', () => {
    const el = slide('<p data-src="0-1">x</p>');
    applyOverlay(el, {
      blocks: {},
      shapes: [
        { id: 'i1', kind: 'image', x: 10, y: 20, w: 30, h: 40, src: 'data:image/png;base64,AAA', alt: 'a"><b' },
      ],
    });
    const img = el.querySelector<HTMLImageElement>('.ov-shape-image img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('data:image/png;base64,AAA');
    expect(img!.getAttribute('alt')).toBe('a"><b'); // 属性として正しく復元(=注入されていない)
    expect(el.querySelector('.ov-shapes b')).toBeNull(); // 生タグとして出ていない
  });

  it('javascript: の画像srcは空にする', () => {
    const el = slide('');
    applyOverlay(el, {
      blocks: {},
      shapes: [{ id: 'i', kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'javascript:alert(1)', alt: '' }],
    });
    expect(el.querySelector<HTMLImageElement>('.ov-shape-image img')!.getAttribute('src')).toBe('');
  });
});

describe('isImageShape / shapeLabel', () => {
  it('画像だけを判定する', () => {
    expect(isImageShape({ id: 'a', kind: 'image', x: 0, y: 0, w: 1, h: 1, src: 'data:,', alt: '' })).toBe(true);
    expect(isImageShape({ id: 'b', kind: 'rect', x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });
  it('全種類にラベルがある', () => {
    expect(shapeLabel('image')).toBe('画像');
    expect(shapeLabel('rect')).toBe('四角形');
  });
});

describe('sanitizeOverlay', () => {
  it('不正なキー・未知の種類・id欠落を落とす', () => {
    const clean = sanitizeOverlay({
      0: {
        blocks: { 0: { x: 1, y: 2, w: 3 } },
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
    expect(clean[0]!.blocks[0]).toEqual({ x: 1, y: 2, w: 3 });
  });

  it('画像の危険な src は空にして残す', () => {
    const clean = sanitizeOverlay({
      0: { shapes: [{ id: 'i', kind: 'image', x: 0, y: 0, w: 1, h: 1, src: 'javascript:x', alt: 'a' }] },
    });
    const sh = clean[0]!.shapes[0]!;
    expect(sh.kind).toBe('image');
    expect((sh as { src: string }).src).toBe('');
  });

  it('範囲外の座標は読み込み時に 0–100 へ収める', () => {
    const clean = sanitizeOverlay({
      0: { shapes: [{ id: 'a', kind: 'rect', x: -50, y: 200, w: 1000, h: 1000 }] },
    });
    const sh = clean[0]!.shapes[0]!;
    expect(sh.w).toBeLessThanOrEqual(100);
    expect(sh.x).toBeGreaterThanOrEqual(0);
    expect(sh.y + sh.h).toBeLessThanOrEqual(100);
  });

  it('非正の aspect ratio は捨てる', () => {
    const clean = sanitizeOverlay({
      0: { shapes: [{ id: 'i', kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'data:,', alt: '', ar: -2 }] },
    });
    expect((clean[0]!.shapes[0] as { ar?: number }).ar).toBeUndefined();
  });
});
