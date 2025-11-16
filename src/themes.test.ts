import { describe, expect, it } from 'vitest';
import { THEMES, themeById, DEFAULT_THEME_ID } from './themes';

describe('THEMES', () => {
  it('ちょうど100種類ある', () => {
    expect(THEMES).toHaveLength(100);
  });

  it('idは一意', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(100);
  });

  it('名前も一意', () => {
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(100);
  });

  it('昼夜が半々', () => {
    expect(THEMES.filter((t) => t.dark)).toHaveLength(50);
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
});
