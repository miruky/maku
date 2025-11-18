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
});
