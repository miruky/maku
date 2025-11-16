import { describe, expect, it } from 'vitest';
import { parseDeck } from './deck';

describe('parseDeck', () => {
  it('フロントマターを読み、本文から除く', () => {
    const deck = parseDeck('---\ntitle: 発表\ntheme: ai-hiru-mincho\n---\n# 一枚目');
    expect(deck.meta.title).toBe('発表');
    expect(deck.meta.theme).toBe('ai-hiru-mincho');
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]!.content).toContain('# 一枚目');
  });

  it('--- でスライドを分割する', () => {
    const deck = parseDeck('# 1\n\n---\n\n# 2\n\n---\n\n# 3');
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides[1]!.content).toBe('# 2');
  });

  it('空のスライドは除く', () => {
    const deck = parseDeck('# 1\n\n---\n\n---\n\n# 2');
    expect(deck.slides).toHaveLength(2);
  });

  it('レイアウト指示(center / title / full)', () => {
    expect(parseDeck('<!-- center -->\n# x').slides[0]!.layout).toBe('center');
    expect(parseDeck('<!-- layout: title -->\n# x').slides[0]!.layout).toBe('title');
    expect(parseDeck('<!-- full -->\n# x').slides[0]!.layout).toBe('full');
  });

  it('背景・クラス・段階表示', () => {
    const s = parseDeck('<!-- bg: #102030 -->\n<!-- class: dim big -->\n<!-- incremental -->\n# x')
      .slides[0]!;
    expect(s.background).toBe('#102030');
    expect(s.classes).toEqual(['dim', 'big']);
    expect(s.incremental).toBe(true);
  });

  it('??? 以降はスピーカーノート', () => {
    const s = parseDeck('# 本文\n\n???\nここは原稿').slides[0]!;
    expect(s.content).toBe('# 本文');
    expect(s.notes).toBe('ここは原稿');
  });

  it('split レイアウトは === で段組に分かれる', () => {
    const s = parseDeck('<!-- layout: split -->\n左の話\n===\n右の話').slides[0]!;
    expect(s.layout).toBe('split');
    expect(s.columns).toEqual(['左の話', '右の話']);
  });
});
