import { describe, expect, it } from 'vitest';
import { parseDeck } from './deck';
import {
  deckTitles,
  slideClassName,
  slideHtml,
  slideHtmlMapped,
  slideStyleAttr,
} from './render';

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

  it('grid は --cells とセルを出す', () => {
    const html = slideHtml(slide('<!-- layout: grid -->\nA\n===\nB\n===\nC'));
    expect(html).toContain('class="grid"');
    expect(html).toContain('--cells:3');
    expect((html.match(/grid-cell/g) ?? []).length).toBe(3);
  });

  it('section はラベル・タイトル・罫を出す', () => {
    const html = slideHtml(slide('<!-- layout: section -->\n03\n===\n# 設計'));
    expect(html).toContain('section-kicker');
    expect(html).toContain('section-title');
    expect(html).toContain('<h1>設計</h1>');
    expect(html).toContain('section-rule');
  });

  it('quote はダッシュ行を出典にし、ダッシュは除く', () => {
    const html = slideHtml(slide('<!-- layout: quote -->\n大切なものは目に見えない。\n— 星の王子さま'));
    expect(html).toContain('quote-text');
    expect(html).toContain('quote-by');
    expect(html).toContain('星の王子さま');
    expect(html).not.toContain('— 星の王子さま'); // ダッシュはCSSで付与
  });

  it('stats は数値と単位を分け、#### を上ラベルにする', () => {
    const html = slideHtml(slide('<!-- layout: stats -->\n#### 継続率\n98.6%\n前年比'));
    expect(html).toContain('stat-figure');
    expect(html).toContain('98.6');
    expect(html).toContain('<span class="stat-unit">%</span>');
    expect(html).toContain('stat-kicker');
  });

  it('compare は2パネルとvsを出す', () => {
    const html = slideHtml(slide('<!-- layout: compare -->\n### A\n左\n===\n### B\n右'));
    expect(html).toContain('cmp-a');
    expect(html).toContain('cmp-b');
    expect(html).toContain('cmp-vs');
  });

  it('timeline は箇条書きをイベントにし、=== で時を分ける', () => {
    const html = slideHtml(slide('<!-- layout: timeline -->\n# 沿革\n\n- 2019 === 開始\n- 2021 === 公開'));
    expect(html).toContain('timeline-track');
    expect((html.match(/tl-event/g) ?? []).length).toBe(2);
    expect(html).toContain('<span class="tl-time">2019</span>');
  });

  it('cards は導入帯とカードを分ける', () => {
    const html = slideHtml(slide('<!-- layout: cards -->\n# 柱\n導入\n===\n### A\n本文\n===\n### B\n本文'));
    expect(html).toContain('cards-lead');
    expect((html.match(/class="card"/g) ?? []).length).toBe(2);
  });

  it('image-left は最初の画像をメディアにする', () => {
    const html = slideHtml(slide('<!-- layout: image-left -->\n![図](https://e.com/a.jpg)\n## 見出し'));
    expect(html).toContain('media-split');
    expect(html).toContain("background-image:url('https://e.com/a.jpg')");
    expect(html).toContain('<h2>見出し</h2>');
  });

  it('画像が無ければ empty メディアにフォールバック', () => {
    expect(slideHtml(slide('<!-- layout: image-right -->\n## 見出し'))).toContain('media-fig empty');
  });

  it('stats: 太字+単位でも ** が漏れない', () => {
    const html = slideHtml(slide('<!-- layout: stats -->\n#### 売上\n**$1,234** USD\n前年比'));
    expect(html).not.toContain('**');
    expect(html).toContain('$1,234');
    expect(html).toContain('stat-unit');
  });

  it('段組レイアウトは incremental でセルに data-step が付く', () => {
    const html = slideHtmlMapped(slide('<!-- layout: grid -->\n<!-- incremental -->\nA\n===\nB\n===\nC'));
    expect((html.match(/data-step=/g) ?? []).length).toBe(3);
  });

  it('image-left は === でも画像と本文を分け、=== を残さない', () => {
    const html = slideHtml(slide('<!-- layout: image-left -->\n本文テキスト\n===\n![z](https://e.com/a.jpg)'));
    expect(html).toContain("background-image:url('https://e.com/a.jpg')");
    expect(html).not.toContain('===');
    expect(html).toContain('本文テキスト');
  });

  it('image-right: 画像が先の段でも媒体に割り当てる', () => {
    const html = slideHtml(slide('<!-- layout: image-right -->\n![z](https://e.com/a.jpg)\n===\n本文'));
    expect(html).toContain("background-image:url('https://e.com/a.jpg')");
    expect(html).not.toContain('<img'); // 媒体は figure 背景。本文側にインライン画像を残さない
  });

  it('stats: === が無くても #### で複数指標に分かれる', () => {
    const html = slideHtml(slide('<!-- layout: stats -->\n#### A\n10%\n\n#### B\n20%\n\n#### C\n30%'));
    expect((html.match(/class="stat"/g) ?? []).length).toBe(3);
    expect(html).toContain('10');
    expect(html).toContain('30');
  });

  it('compare: 片側だけのとき空セルに data-step を付けない', () => {
    const html = slideHtmlMapped(slide('<!-- layout: compare -->\n<!-- incremental -->\nA だけ'));
    expect((html.match(/data-step=/g) ?? []).length).toBe(1);
  });

  it('image分割: 画像が無ければ列を捨てず全部本文にする', () => {
    const html = slideHtml(slide('<!-- layout: image-left -->\n左テキスト\n===\n右テキスト'));
    expect(html).toContain('左テキスト');
    expect(html).toContain('右テキスト');
    expect(html).toContain('media-fig empty');
  });

  it('timeline: 単独行の === を本文に出さない', () => {
    const html = slideHtml(slide('<!-- layout: timeline -->\n# 沿革\n\n- 2019 開始\n===\n- 2021 公開'));
    expect(html).not.toContain('<p>===</p>');
    expect((html.match(/tl-event/g) ?? []).length).toBe(2);
  });

  it('split: === が無い incremental はブロック単位で段階表示する', () => {
    const html = slideHtmlMapped(slide('<!-- layout: split -->\n<!-- incremental -->\nA\n\nB\n\nC'));
    expect((html.match(/data-step=/g) ?? []).length).toBe(3);
  });

  it('split: === 付き(空セルで1列化)incremental でも生の === を本文に漏らさない', () => {
    const html = slideHtmlMapped(slide('<!-- layout: split -->\n<!-- incremental -->\nA\n\nB\n==='));
    expect(html).not.toContain('===');
    expect(html).not.toContain('<p>=</p>');
  });

  it('ctx を渡すとヘッダ/フッタ/ページ番号(クローム)を付ける', () => {
    const deck = parseDeck('---\nfooter: maku 2026\npaginate: true\nheader: 社外秘\n---\n# A\n\n---\n\n# B');
    const html = slideHtml(deck.slides[0]!, { meta: deck.meta, index: 0, total: 2 });
    expect(html).toContain('class="slide-footer"');
    expect(html).toContain('maku 2026');
    expect(html).toContain('class="slide-header"');
    expect(html).toContain('class="slide-pageno"');
    expect(html).toContain('1 / 2');
  });

  it('ctx なしならクロームは付かない(後方互換)', () => {
    const deck = parseDeck('---\nfooter: x\npaginate: true\n---\n# A');
    expect(slideHtml(deck.slides[0]!)).not.toContain('slide-footer');
    expect(slideHtml(deck.slides[0]!)).not.toContain('slide-pageno');
  });

  it('per-slide の footer/paginate 上書きが効く', () => {
    const deck = parseDeck('---\nfooter: 既定\npaginate: true\n---\n# A\n<!-- footer: 個別 -->\n<!-- paginate: false -->');
    const html = slideHtml(deck.slides[0]!, { meta: deck.meta, index: 0, total: 1 });
    expect(html).toContain('個別');
    expect(html).not.toContain('既定');
    expect(html).not.toContain('slide-pageno');
  });
});

describe('目次(TOC)', () => {
  const md = '# はじめに\n<!-- toc -->\n\n---\n\n# 設計\n本文\n\n---\n\n# まとめ';

  it('deckTitles は見出しのあるスライドを連番で集め、TOC スライド自身は除外する', () => {
    const deck = parseDeck(md);
    const titles = deckTitles(deck.slides);
    expect(titles).toEqual([
      { n: 1, title: '設計' },
      { n: 2, title: 'まとめ' },
    ]);
  });

  it('toc スライドは全見出しを番号付きリストで描く', () => {
    const deck = parseDeck(md);
    const titles = deckTitles(deck.slides);
    const html = slideHtml(deck.slides[0]!, { meta: deck.meta, index: 0, total: deck.slides.length, titles });
    expect(html).toContain('<ol class="toc">');
    expect(html).toContain('class="toc-no">1<');
    expect(html).toContain('設計');
    expect(html).toContain('まとめ');
    // 見出し本文(はじめに)も残る
    expect(html).toContain('はじめに');
  });

  it('toc でないスライドには TOC を出さない / titles 無しでも落ちない', () => {
    const deck = parseDeck(md);
    const titles = deckTitles(deck.slides);
    expect(slideHtml(deck.slides[1]!, { meta: deck.meta, index: 1, total: 3, titles })).not.toContain('class="toc"');
    expect(slideHtml(deck.slides[0]!, { meta: deck.meta, index: 0, total: 3 })).not.toContain('<ol class="toc">');
  });

  it('見出し内のインライン書式はエスケープして描く', () => {
    const deck = parseDeck('# 目次\n<!-- toc -->\n\n---\n\n# `code` と **強調**');
    const titles = deckTitles(deck.slides);
    const html = slideHtml(deck.slides[0]!, { meta: deck.meta, index: 0, total: 2, titles });
    expect(html).toContain('toc-title');
    expect(html).toContain('<code>code</code>');
    expect(html).not.toContain('<script');
  });

  it('コードフェンス内の # 行は目次に拾わない(描画と一致)', () => {
    const md = '# 目次\n<!-- toc -->\n\n---\n\n```python\n# config setup\n```\n\n---\n\n# 本物の見出し';
    const deck = parseDeck(md);
    const titles = deckTitles(deck.slides);
    // フェンスだけのスライドは見出し無し扱いで除外、本物の見出しだけ残る
    expect(titles).toEqual([{ n: 1, title: '本物の見出し' }]);
  });

  it('見出し抽出は描画と同じ規則(行頭・末尾の # は残す)', () => {
    const deck = parseDeck('<!-- toc -->\n# 目次\n\n---\n\n# Foo #');
    const titles = deckTitles(deck.slides);
    expect(titles).toEqual([{ n: 1, title: 'Foo #' }]);
  });
});

describe('登場アニメ data-anim', () => {
  it('anim 指定スライドは .slide に data-anim を出す', () => {
    const s = slide('<!-- anim: zoom -->\n# x');
    expect(slideHtmlMapped(s)).toContain('data-anim="zoom"');
    expect(slideHtml(s)).toContain('data-anim="zoom"');
  });
  it('無指定では data-anim を出さない(従来どおり既定の rise)', () => {
    expect(slideHtmlMapped(slide('# x'))).not.toContain('data-anim');
    expect(slideHtml(slide('# x'))).not.toContain('data-anim');
  });
  it('frontmatter anim: が ctx.meta 経由で既定になる', () => {
    const deck = parseDeck('---\nanim: fade\n---\n\n# x');
    const ctx = { meta: deck.meta, index: 0, total: 1 };
    expect(slideHtml(deck.slides[0]!, ctx)).toContain('data-anim="fade"');
  });
});
