// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';
import { blockToMd } from './edit';

// Markdown → 描画HTML → Markdown が安定する(往復しても変わらない)ことを確かめる。
function first(md: string): Element {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(md);
  return div.firstElementChild!;
}

describe('blockToMd(view → md)', () => {
  it('見出し', () => {
    expect(blockToMd(first('## まとめ'))).toBe('## まとめ');
    expect(blockToMd(first('# 表題'))).toBe('# 表題');
  });

  it('段落と装飾', () => {
    expect(blockToMd(first('**太字** と *斜体* と `コード`'))).toBe('**太字** と *斜体* と `コード`');
    expect(blockToMd(first('~~消~~ も残す'))).toBe('~~消~~ も残す');
  });

  it('ハイライト/上付き/下付きを往復で保つ', () => {
    expect(blockToMd(first('==重要== な点'))).toBe('==重要== な点');
    expect(blockToMd(first('面積は x^2^ です'))).toBe('面積は x^2^ です');
    expect(blockToMd(first('水は H~2~O'))).toBe('水は H~2~O');
  });

  it('リンク', () => {
    expect(blockToMd(first('[名](https://e.com)'))).toBe('[名](https://e.com)');
  });

  it('箇条書き(入れ子)', () => {
    const md = '- 親\n  - 子\n- 親2';
    expect(blockToMd(first(md))).toBe(md);
  });

  it('番号付き', () => {
    expect(blockToMd(first('1. 一\n2. 二'))).toBe('1. 一\n2. 二');
  });

  it('タスクリスト(チェック状態を保つ)', () => {
    const md = '- [x] 完了\n- [ ] 未了';
    expect(blockToMd(first(md))).toBe(md);
  });

  it('表(配置を保つ)', () => {
    expect(blockToMd(first('| 名 | 値 |\n|:--|--:|\n| a | 1 |'))).toBe(
      '| 名 | 値 |\n| :-- | --: |\n| a | 1 |',
    );
  });

  it('引用', () => {
    expect(blockToMd(first('> 引用文'))).toBe('> 引用文');
  });

  it('コードブロック', () => {
    const md = '```ts\nconst a = 1;\n```';
    expect(blockToMd(first(md))).toBe(md);
  });

  it('コードfenceの情報文字列(title=/lineNumbers)を往復で保つ(回帰防止)', () => {
    const md = '```ts title=app.ts lineNumbers\nconst a = 1;\n```';
    expect(blockToMd(first(md))).toBe(md);
  });

  it('コピーボタン(.code-copy)は <code> 外なので往復で混入しない', () => {
    const md = '```js\nconst a = 1;\nfn();\n```';
    const pre = first(md);
    expect(pre.querySelector('.code-copy')).not.toBeNull(); // 描画にはボタンがある
    expect(blockToMd(pre)).toBe(md); // でも原文には出てこない
  });

  it('数式(インライン/ブロック)を data-tex から往復で保つ', () => {
    expect(blockToMd(first('$$\nE = mc^2\n$$'))).toBe('$$\nE = mc^2\n$$');
    expect(blockToMd(first('式 $a^2$ だ'))).toBe('式 $a^2$ だ');
  });

  it('Mermaid 図を data-mermaid から ```mermaid 往復で保つ', () => {
    const md = '```mermaid\ngraph TD\n  A-->B\n```';
    const block = first(md);
    expect(block.classList.contains('mermaid-block')).toBe(true);
    expect(blockToMd(block)).toBe(md);
  });

  it('段階表示の番号バッジは本文に直列化しない', () => {
    // 回帰防止: 編集中に付く .step-badge の数字が見出し/段落に混入し Markdown が壊れていた。
    const h = first('# 表題');
    const badge = document.createElement('span');
    badge.className = 'step-badge';
    badge.textContent = '1';
    h.appendChild(badge);
    expect(blockToMd(h)).toBe('# 表題');
    const p = first('本文です');
    const b2 = document.createElement('span');
    b2.className = 'step-badge';
    b2.textContent = '常';
    p.appendChild(b2);
    expect(blockToMd(p)).toBe('本文です');
  });
});
