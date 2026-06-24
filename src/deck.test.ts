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

  it('grid は === で複数の部に分かれる', () => {
    const s = parseDeck('<!-- layout: grid -->\nA\n===\nB\n===\nC').slides[0]!;
    expect(s.layout).toBe('grid');
    expect(s.columns).toEqual(['A', 'B', 'C']);
  });

  it('末尾や重複の === は空の部を作らない', () => {
    expect(parseDeck('<!-- layout: grid -->\nA\n===\nB\n===').slides[0]!.columns).toEqual(['A', 'B']);
    expect(parseDeck('<!-- layout: cards -->\nA\n===\n===\nB').slides[0]!.columns).toEqual(['A', 'B']);
  });

  it('新しいレイアウト名(section/quote/stats/timeline/compare/image-left)を受け付ける', () => {
    for (const name of ['section', 'quote', 'stats', 'timeline', 'compare', 'image-left']) {
      expect(parseDeck(`<!-- layout: ${name} -->\n# x`).slides[0]!.layout).toBe(name);
    }
  });

  it('incremental は sequential + 連番ステップ(後方互換)', () => {
    const s = parseDeck('<!-- incremental -->\n# A\n\nB\n\nC').slides[0]!;
    expect(s.incremental).toBe(true);
    expect(s.reveal).toBe('sequential');
    expect(s.steps?.map((x) => x.step)).toEqual([1, 2, 3]);
    expect(s.steps?.every((x) => !x.key)).toBe(true);
  });

  it('reveal 指定が無ければ steps は null', () => {
    const s = parseDeck('# A\n\nB').slides[0]!;
    expect(s.reveal).toBe('none');
    expect(s.steps).toBeNull();
  });

  it('key-first は先頭をキー(step1)、以降は2から', () => {
    const s = parseDeck('<!-- reveal: key-first -->\n# 見出し\n\n本文1\n\n本文2').slides[0]!;
    expect(s.reveal).toBe('key-first');
    expect(s.steps?.[0]).toEqual({ step: 1, key: true });
    expect(s.steps?.[1]!.step).toBe(2);
    expect(s.steps?.[2]!.step).toBe(3);
  });

  it('<!-- key --> は次のブロックをキーにする', () => {
    const s = parseDeck('<!-- reveal: key-first -->\n前置き\n\n<!-- key -->\n# 要点\n\n詳細').slides[0]!;
    expect(s.steps?.findIndex((x) => x.key)).toBe(1);
    expect(s.steps?.[1]!.step).toBe(1);
  });

  it('group は前と同じステップ、step:N は明示。自動採番は明示を追い越さない', () => {
    const s = parseDeck('<!-- incremental -->\n一\n\n<!-- group -->\n二\n\n<!-- step: 5 -->\n三\n\n四').slides[0]!;
    expect(s.steps?.map((x) => x.step)).toEqual([1, 1, 5, 6]);
  });

  it('空行を挟まないマーカーも含有ブロックに効く(畳み込み)', () => {
    const s = parseDeck('<!-- reveal: key-first -->\n行1\n<!-- key -->\n行2').slides[0]!;
    expect(s.steps?.some((x) => x.key)).toBe(true);
  });

  it('image-left も === で段に分かれる', () => {
    const s = parseDeck('<!-- layout: image-left -->\n本文\n===\n![z](https://e.com/a.jpg)').slides[0]!;
    expect(s.columns).toHaveLength(2);
  });

  it('段組は reveal を保持、quote/section は段階表示を切る', () => {
    expect(parseDeck('<!-- layout: grid -->\n<!-- incremental -->\nA\n===\nB').slides[0]!.reveal).toBe('sequential');
    expect(parseDeck('<!-- layout: quote -->\n<!-- incremental -->\nA').slides[0]!.reveal).toBe('none');
  });
});
