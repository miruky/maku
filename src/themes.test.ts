import { describe, expect, it } from 'vitest';
import { THEMES, themeById, varContrast, DEFAULT_THEME_ID } from './themes';

describe('THEMES', () => {
  it('ちょうど264種類ある(44系統 × 昼夜 × 3書体)', () => {
    expect(THEMES).toHaveLength(264);
  });

  it('idは一意', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(264);
  });

  it('名前も一意', () => {
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(264);
  });

  it('昼夜が半々', () => {
    expect(THEMES.filter((t) => t.dark)).toHaveLength(132);
  });

  it('各テーマに必須のCSS変数が揃う', () => {
    const required = ['--bg', '--fg', '--accent', '--rule', '--heading-font', '--body-font'];
    for (const t of THEMES) {
      for (const key of required) {
        expect(t.vars[key], `${t.id} に ${key}`).toBeTruthy();
      }
    }
  });

  it('既定テーマは存在する', () => {
    expect(THEMES.some((t) => t.id === DEFAULT_THEME_ID)).toBe(true);
  });

  it('themeByID は未知idで既定に落ちる', () => {
    expect(themeById('no-such-theme').id).toBe(DEFAULT_THEME_ID);
  });

  it('全テーマで本文・リンク・小見出しの色がWCAG AAを満たす', () => {
    // --accent はリンク、--muted は小見出し(h4-h6)に本文サイズで使うため 4.5 を要求する。
    for (const t of THEMES) {
      expect(varContrast(t, '--fg'), `${t.id} fg/bg`).toBeGreaterThanOrEqual(4.5);
      expect(varContrast(t, '--accent'), `${t.id} accent/bg`).toBeGreaterThanOrEqual(4.5);
      expect(varContrast(t, '--muted'), `${t.id} muted/bg`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('全テーマで本文色が accent-soft 上でも AA(対比バッジ等の文字用)', () => {
    for (const t of THEMES) {
      expect(varContrast(t, '--fg', '--accent-soft'), `${t.id} fg/accent-soft`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('全テーマでコード配色(ハイライトのトークン色)が --code-bg 上で AA を満たす', () => {
    const tokens = [
      '--hl-keyword', '--hl-string', '--hl-number', '--hl-function',
      '--hl-type', '--hl-literal', '--hl-deleted', '--hl-comment', '--hl-punctuation',
    ];
    for (const t of THEMES) {
      for (const key of tokens) {
        expect(t.vars[key], `${t.id} に ${key}`).toBeTruthy();
        expect(varContrast(t, key, '--code-bg'), `${t.id} ${key}/code-bg`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
