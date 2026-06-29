import { describe, expect, it } from 'vitest';
import { buildStandaloneHtml, deckFilename, slideImageName } from './export';

describe('deckFilename', () => {
  it('タイトルから安全なファイル名を作る', () => {
    expect(deckFilename({ title: '四半期 報告' })).toBe('四半期-報告');
  });

  it('記号や禁止文字を除く', () => {
    expect(deckFilename({ title: 'a/b:c*?"<>|d' })).toBe('a-b-c-d');
  });

  it('タイトルが無ければ slides', () => {
    expect(deckFilename({})).toBe('slides');
    expect(deckFilename({ title: '   ' })).toBe('slides');
  });

  it('長すぎる名前は切り詰める', () => {
    expect(deckFilename({ title: 'あ'.repeat(100) }).length).toBeLessThanOrEqual(60);
  });
});

describe('slideImageName', () => {
  it('デッキ名にゼロ埋めの番号と拡張子を付ける', () => {
    expect(slideImageName({ title: '提案' }, 0)).toBe('提案-01.png');
    expect(slideImageName({ title: '提案' }, 11)).toBe('提案-12.png');
  });

  it('タイトルが無ければ slides を使う', () => {
    expect(slideImageName({}, 4)).toBe('slides-05.png');
  });
});

describe('buildStandaloneHtml', () => {
  const html = buildStandaloneHtml({
    title: '提案 <資料>',
    appCss: '.slide{color:red}',
    bodyHtml: '<div class="deck-root"><div class="stage"><div class="slide active">A</div></div></div>',
  });

  it('完全なHTML文書を返し、CSS と本文を埋め込む', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('.slide{color:red}');
    expect(html).toContain('class="deck-root"');
    expect(html).toContain('<script>');
  });

  it('タイトルはHTMLエスケープする(タグ注入を防ぐ)', () => {
    expect(html).toContain('<title>提案 &lt;資料&gt;</title>');
    expect(html).not.toContain('<title>提案 <資料></title>');
  });

  it('ビューア用のCSS/JS(1枚表示・キー操作)を含む', () => {
    expect(html).toContain('.stage>.slide.active');
    expect(html).toContain("'ArrowRight'");
  });

  it('タイトル無しでも slides で成立する', () => {
    const h = buildStandaloneHtml({ title: '', appCss: '', bodyHtml: '<div></div>' });
    expect(h).toContain('<title>slides</title>');
  });
});
