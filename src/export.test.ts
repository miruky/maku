import { describe, expect, it } from 'vitest';
import { deckFilename, slideImageName } from './export';

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
