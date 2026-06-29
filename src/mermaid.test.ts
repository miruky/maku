// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hasPendingMermaid, resetMermaid } from './mermaid';
// 実際の SVG 描画(typesetMermaid)は mermaid 本体が要るため Playwright で目視確認する。
// ここでは DOM だけで完結する補助関数(未描画判定・描画やり直し用リセット)を担保する。

function block(src: string, done: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mermaid-block';
  el.setAttribute('data-mermaid', src);
  if (done) {
    el.setAttribute('data-mermaid-done', '1');
    el.innerHTML = '<svg>描画済み</svg>';
  } else {
    el.innerHTML = '<pre class="mermaid-src"></pre>';
  }
  return el;
}

describe('hasPendingMermaid / resetMermaid', () => {
  it('未描画ブロックの有無を判定する', () => {
    const root = document.createElement('div');
    root.appendChild(block('graph TD', true));
    expect(hasPendingMermaid(root)).toBe(false);
    root.appendChild(block('graph LR', false));
    expect(hasPendingMermaid(root)).toBe(true);
  });

  it('描画済みを生ソースのフォールバックへ戻し、再描画できる状態にする', () => {
    const root = document.createElement('div');
    const el = block('graph TD\nA-->B', true);
    el.classList.add('mermaid-error');
    root.appendChild(el);
    resetMermaid(root);
    expect(el.hasAttribute('data-mermaid-done')).toBe(false);
    expect(el.classList.contains('mermaid-error')).toBe(false);
    const pre = el.querySelector('.mermaid-src');
    expect(pre?.textContent).toBe('graph TD\nA-->B'); // 元ソースを復元(textContentで自動エスケープ)
    expect(el.querySelector('svg')).toBeNull(); // 旧SVGは消える
    expect(hasPendingMermaid(root)).toBe(true); // 再 typeset 対象に戻る
  });
});
