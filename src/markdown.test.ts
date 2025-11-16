import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('見出しと段落', () => {
    expect(renderMarkdown('# 表題')).toBe('<h1>表題</h1>');
    expect(renderMarkdown('本文です')).toBe('<p>本文です</p>');
  });

  it('強調・打ち消し・コード', () => {
    expect(renderMarkdown('**太字**')).toContain('<strong>太字</strong>');
    expect(renderMarkdown('*斜体*')).toContain('<em>斜体</em>');
    expect(renderMarkdown('~~消~~')).toContain('<del>消</del>');
    expect(renderMarkdown('`x = 1`')).toContain('<code>x = 1</code>');
  });

  it('箇条書き(入れ子)', () => {
    const html = renderMarkdown('- 親\n  - 子\n- 親2');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>子</li>');
    expect((html.match(/<ul>/g) ?? []).length).toBe(2);
  });

  it('番号付きリストとタスクリスト', () => {
    expect(renderMarkdown('1. 一\n2. 二')).toContain('<ol>');
    const task = renderMarkdown('- [x] 完了\n- [ ] 未了');
    expect(task).toContain('checked');
    expect(task).toContain('type="checkbox"');
  });

  it('引用とコードブロック', () => {
    expect(renderMarkdown('> 引用')).toContain('<blockquote>');
    const code = renderMarkdown('```ts\nconst a = 1;\n```');
    expect(code).toContain('language-ts');
    expect(code).toContain('const a = 1;');
  });

  it('表(配置つき)', () => {
    const html = renderMarkdown('| 名 | 値 |\n|:--|--:|\n| a | 1 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th style="text-align:left">名</th>');
    expect(html).toContain('text-align:right');
  });

  it('リンクと画像、危険なURLは無効化', () => {
    expect(renderMarkdown('[名](https://e.com)')).toContain('href="https://e.com"');
    expect(renderMarkdown('[x](javascript:alert(1))')).toContain('href="#"');
    expect(renderMarkdown('![図](https://e.com/a.png)')).toContain('<img src="https://e.com/a.png"');
  });

  it('HTMLをエスケープする', () => {
    expect(renderMarkdown('<script>')).toBe('<p>&lt;script&gt;</p>');
  });

  it('水平線', () => {
    expect(renderMarkdown('***')).toBe('<hr />');
  });
});
