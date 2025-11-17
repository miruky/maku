import { describe, expect, it } from 'vitest';
import { deckFilename } from './export';

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
