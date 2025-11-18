import { describe, expect, it } from 'vitest';
import { parseDeck } from './deck';
import { slideClassName, slideHtml, slideStyleAttr } from './render';

function slide(md: string) {
  return parseDeck(md).slides[0]!;
}

describe('render', () => {
  it('レイアウトをクラス名に反映', () => {
    expect(slideClassName(slide('<!-- center -->\n# x'))).toContain('layout-center');
  });

  it('クラス指示を加える', () => {
    expect(slideClassName(slide('<!-- class: dim -->\n# x'))).toContain('dim');
  });

  it('色背景はbackground、URL背景は画像指定', () => {
    expect(slideStyleAttr(slide('<!-- bg: #123456 -->\n# x'))).toContain('background:#123456');
    const img = slideStyleAttr(slide('<!-- bg: https://e.com/a.jpg -->\n# x'));
    expect(img).toContain("background-image:url('https://e.com/a.jpg')");
    expect(img).toContain('data-bg="image"');
  });

  it('背景URLの引用符・括弧はエスケープしてurl()から抜け出せない', () => {
    const out = slideStyleAttr(slide("<!-- bg: https://e.com/a.jpg')url('x -->\n# x"));
    expect(out).not.toMatch(/url\('https:\/\/e\.com\/a\.jpg'\)/);
    expect(out).toContain('%27'); // ' がエンコードされている
    expect(out).not.toContain("')url('");
  });

  it('色背景のダブルクオートはエスケープして属性から抜け出せない', () => {
    const out = slideStyleAttr(slide('<!-- bg: red"><img src=x -->\n# x'));
    expect(out).not.toContain('"><img');
    expect(out).toContain('&quot;');
  });

  it('split は段組のcolを出す', () => {
    const html = slideHtml(slide('<!-- layout: split -->\n左\n===\n右'));
    expect((html.match(/class="col"/g) ?? []).length).toBe(2);
  });

  it('通常スライドはMarkdownを描画', () => {
    expect(slideHtml(slide('# 見出し'))).toContain('<h1>見出し</h1>');
  });
});
