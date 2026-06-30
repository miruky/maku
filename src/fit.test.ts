// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clearFit, fitSlideBody } from './fit';

// jsdom はレイアウトを持たない(clientHeight/scrollHeight が 0)。実際の縮小率は
// Playwright の目視で検証する。ここでは「落ちない」「0サイズ時は何もしない」安全弁を担保する。
function slide(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'slide';
  el.innerHTML = '<div class="slide-body"><p>x</p></div>';
  return el;
}

describe('fitSlideBody / clearFit', () => {
  it('レイアウト0の環境では transform を設定しない(NaN スケールを焼かない)', () => {
    const s = slide();
    fitSlideBody(s);
    const body = s.querySelector<HTMLElement>('.slide-body')!;
    expect(body.style.transform).toBe('');
  });

  it('.slide-body が無くても落ちない', () => {
    const el = document.createElement('div');
    el.className = 'slide';
    expect(() => fitSlideBody(el)).not.toThrow();
    expect(() => clearFit(el)).not.toThrow();
  });

  it('clearFit は transform を消す', () => {
    const s = slide();
    const body = s.querySelector<HTMLElement>('.slide-body')!;
    body.style.transform = 'scale(0.5)';
    body.style.transformOrigin = 'top center';
    clearFit(s);
    expect(body.style.transform).toBe('');
    expect(body.style.transformOrigin).toBe('');
  });
});
