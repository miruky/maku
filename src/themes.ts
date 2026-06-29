// 264種類のテーマ。色44系統 × 昼/夜 × 明朝/ゴシック/丸ゴシック = 264。
// 各テーマはCSSカスタムプロパティの束で、スライドの土台に流し込む。
// HSLで体系的に作るので、どれも彩度・明度がそろい、シンプルで統一感がある。
// 色名は日本の伝統色から採り、色相環をすき間なく覆うよう選んでいる。

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  vars: Record<string, string>;
}

interface Family {
  id: string;
  name: string;
  hue: number;
  sat: number; // 地色の色み(低いほど中立。アクセントは別途下限を設ける)
}

const FAMILIES: Family[] = [
  { id: 'ai', name: '藍', hue: 215, sat: 45 },
  { id: 'sumi', name: '墨', hue: 220, sat: 8 },
  { id: 'koke', name: '苔', hue: 110, sat: 32 },
  { id: 'suna', name: '砂', hue: 40, sat: 30 },
  { id: 'tobi', name: '鳶', hue: 20, sat: 36 },
  { id: 'akane', name: '茜', hue: 2, sat: 52 },
  { id: 'sumire', name: '菫', hue: 270, sat: 40 },
  { id: 'wakakusa', name: '若草', hue: 95, sat: 42 },
  { id: 'umi', name: '海', hue: 195, sat: 48 },
  { id: 'budou', name: '葡萄', hue: 290, sat: 38 },
  { id: 'sango', name: '珊瑚', hue: 12, sat: 55 },
  { id: 'kaba', name: '樺', hue: 30, sat: 44 },
  { id: 'tetsu', name: '鉄', hue: 210, sat: 12 },
  { id: 'seiji', name: '青磁', hue: 165, sat: 34 },
  { id: 'yamabuki', name: '山吹', hue: 45, sat: 60 },
  { id: 'kikyou', name: '桔梗', hue: 250, sat: 46 },
  { id: 'kurenai', name: '紅', hue: 350, sat: 55 },
  { id: 'tokiwa', name: '常磐', hue: 150, sat: 40 },
  { id: 'nibi', name: '鈍', hue: 0, sat: 4 },
  { id: 'rikyu', name: '利休', hue: 80, sat: 22 },
  { id: 'gunjou', name: '群青', hue: 230, sat: 52 },
  { id: 'kaki', name: '柿', hue: 25, sat: 58 },
  { id: 'mori', name: '杜', hue: 140, sat: 36 },
  { id: 'fuji', name: '藤', hue: 260, sat: 34 },
  { id: 'haizakura', name: '灰桜', hue: 350, sat: 16 },
  // ── 色相環のすき間を埋める追加の伝統色(19系統)──
  { id: 'enji', name: '臙脂', hue: 359, sat: 34 },
  { id: 'shu', name: '朱', hue: 8, sat: 42 },
  { id: 'shishi', name: '宍', hue: 17, sat: 25 },
  { id: 'kincha', name: '金茶', hue: 37, sat: 52 },
  { id: 'kihada', name: '黄蘗', hue: 56, sat: 46 },
  { id: 'uguisu', name: '鶯', hue: 67, sat: 34 },
  { id: 'midori', name: '緑', hue: 124, sat: 44 },
  { id: 'matsuba', name: '松葉', hue: 129, sat: 30 },
  { id: 'rokushou', name: '緑青', hue: 177, sat: 32 },
  { id: 'asagi', name: '浅葱', hue: 186, sat: 50 },
  { id: 'rurikon', name: '瑠璃紺', hue: 242, sat: 52 },
  { id: 'kachi', name: '褐', hue: 237, sat: 30 },
  { id: 'ayame', name: '菖蒲', hue: 280, sat: 40 },
  { id: 'shikon', name: '紫紺', hue: 317, sat: 48 },
  { id: 'botan', name: '牡丹', hue: 327, sat: 46 },
  { id: 'tsutsuji', name: '躑躅', hue: 336, sat: 44 },
  { id: 'nadeshiko', name: '撫子', hue: 343, sat: 26 },
  { id: 'umenezumi', name: '梅鼠', hue: 323, sat: 9 },
  { id: 'hatobanezumi', name: '鳩羽鼠', hue: 255, sat: 10 },
];

const FONTS = {
  mincho: {
    label: '明朝',
    heading: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
    body: "'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
    weight: '600',
  },
  gothic: {
    label: 'ゴシック',
    heading: "'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
    body: "'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
    weight: '800',
  },
  maru: {
    label: '丸ゴ',
    heading:
      "'Hiragino Maru Gothic ProN', 'Hiragino Maru Gothic Pro', 'Zen Maru Gothic', 'M PLUS Rounded 1c', 'Quicksand', system-ui, sans-serif",
    body: "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
    weight: '700',
  },
} as const;

const hsl = (h: number, s: number, l: number): string => `hsl(${h} ${Math.round(s)}% ${l}%)`;

// ── コントラスト計算(WCAG)。地色が淡い昼テーマで、緑・黄系のaccent/mutedが
//    本文サイズ(リンク・小見出し)で4.5を割らないよう、明度を必要なだけ下げる。──
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number): number => ln - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// 地色bgに対し目標コントラストを満たす最大の明度(startLから下げて探す)を返す。
function lightnessForContrast(
  h: number,
  s: number,
  bg: [number, number, number],
  target: number,
  startL: number,
): number {
  for (let l = startL; l >= 10; l -= 1) {
    if (contrastRatio(hslToRgb(h, s, l), bg) >= target) return l;
  }
  return 10;
}

// 暗い地色用。startL から明度を上げてコントラストを満たす最小の明度を返す。
function lightnessForContrastUp(
  h: number,
  s: number,
  bg: [number, number, number],
  target: number,
  startL: number,
): number {
  for (let l = startL; l <= 94; l += 1) {
    if (contrastRatio(hslToRgb(h, s, l), bg) >= target) return l;
  }
  return 94;
}

// シンタックスハイライトのトークン色。慣習に沿った固定色相(緑=文字列・橙=数値…)で
// 「コードらしい読みやすさ」を保ちつつ、各テーマの --code-bg に対し本文同様 AA(4.5)を
// 保証し、昼夜に追従させる。色相を固定するのはテーマ系統に依らずコードを判読しやすくするため。
const TOKEN_HUES: Array<[string, number, number]> = [
  ['--hl-keyword', 330, 55],
  ['--hl-string', 138, 48],
  ['--hl-number', 28, 60],
  ['--hl-function', 215, 52],
  ['--hl-type', 178, 46],
  ['--hl-literal', 290, 48],
  ['--hl-deleted', 5, 55],
];

function tokenVars(f: Family, dark: boolean): Record<string, string> {
  // hsl() は彩度を丸めて文字列化するため、コントラスト探索でも丸め後の彩度で地色を作り、
  // 検証時(parseHsl 経由)と完全に一致させる。境界の丸め差を避けるため目標は 4.55 の余裕を持つ。
  const T = 4.55;
  const codeBg = dark
    ? hslToRgb(f.hue, Math.round(f.sat * 0.6), 14)
    : hslToRgb(f.hue, Math.round(f.sat * 0.5), 94);
  const out: Record<string, string> = {};
  for (const [key, hue, sat] of TOKEN_HUES) {
    const l = dark
      ? lightnessForContrastUp(hue, sat, codeBg, T, 58)
      : lightnessForContrast(hue, sat, codeBg, T, 46);
    out[key] = hsl(hue, sat, l);
  }
  // コメントはテーマ系統の色みを弱く残しつつ控えめに(ただし可読性のため AA は維持)。
  const cHue = f.hue;
  const cSat = Math.round(Math.min(f.sat * 0.35, 22));
  out['--hl-comment'] = dark
    ? hsl(cHue, cSat, lightnessForContrastUp(cHue, cSat, codeBg, T, 44))
    : hsl(cHue, cSat, lightnessForContrast(cHue, cSat, codeBg, T, 50));
  // 記号(句読点)も控えめだが --code-bg 上で AA を満たす独自色にする(--muted は --bg 基準で
  // code-bg に対しては AA を割るテーマがあるため)。
  const pSat = Math.round(Math.min(f.sat * 0.25, 16));
  out['--hl-punctuation'] = dark
    ? hsl(f.hue, pSat, lightnessForContrastUp(f.hue, pSat, codeBg, T, 50))
    : hsl(f.hue, pSat, lightnessForContrast(f.hue, pSat, codeBg, T, 46));
  return out;
}

function lightVars(f: Family): Record<string, string> {
  const a = Math.max(f.sat, 50);
  const bg = hslToRgb(f.hue, f.sat * 0.5, 97);
  // 本文サイズで使う色は4.5以上を確保(余裕を見て4.6)。淡い地色なので緑黄系は暗くなる。
  const accentL = lightnessForContrast(f.hue, a, bg, 4.6, 40);
  const mutedL = lightnessForContrast(f.hue, f.sat * 0.4, bg, 4.6, 42);
  return {
    '--bg': hsl(f.hue, f.sat * 0.5, 97),
    '--surface': hsl(f.hue, f.sat * 0.5, 99),
    '--fg': hsl(f.hue, Math.min(f.sat, 28), 15),
    '--muted': hsl(f.hue, f.sat * 0.4, mutedL),
    '--rule': hsl(f.hue, f.sat * 0.5, 87),
    '--accent': hsl(f.hue, a, accentL),
    '--accent-soft': hsl(f.hue, a * 0.7, 92),
    '--code-bg': hsl(f.hue, f.sat * 0.5, 94),
    ...tokenVars(f, false),
  };
}

function darkVars(f: Family): Record<string, string> {
  const a = Math.max(f.sat, 52);
  return {
    '--bg': hsl(f.hue, f.sat * 0.6, 9),
    '--surface': hsl(f.hue, f.sat * 0.6, 12),
    '--fg': hsl(f.hue, f.sat * 0.3, 91),
    '--muted': hsl(f.hue, f.sat * 0.28, 62),
    '--rule': hsl(f.hue, f.sat * 0.6, 23),
    '--accent': hsl(f.hue, a, 66),
    '--accent-soft': hsl(f.hue, a * 0.4, 18),
    '--code-bg': hsl(f.hue, f.sat * 0.6, 14),
    ...tokenVars(f, true),
  };
}

function buildThemes(): Theme[] {
  const out: Theme[] = [];
  for (const f of FAMILIES) {
    for (const mode of ['light', 'dark'] as const) {
      for (const fontKey of ['mincho', 'gothic', 'maru'] as const) {
        const font = FONTS[fontKey];
        const base = mode === 'dark' ? darkVars(f) : lightVars(f);
        out.push({
          id: `${f.id}-${mode === 'dark' ? 'yoru' : 'hiru'}-${fontKey}`,
          name: `${f.name}・${mode === 'dark' ? '夜' : '昼'} ${font.label}`,
          dark: mode === 'dark',
          vars: {
            ...base,
            '--heading-font': font.heading,
            '--body-font': font.body,
            '--heading-weight': font.weight,
          },
        });
      }
    }
  }
  return out;
}

export const THEMES: Theme[] = buildThemes();

export const DEFAULT_THEME_ID = 'ai-hiru-mincho';

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? THEMES[0]!;
}

function parseHsl(value: string): [number, number, number] {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(value);
  if (!m) return [0, 0, 0];
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

// テーマ内の色変数どうしのコントラスト比。アクセシビリティ検証に使う。
export function varContrast(theme: Theme, fgKey: string, bgKey = '--bg'): number {
  const fg = theme.vars[fgKey];
  const bg = theme.vars[bgKey];
  if (!fg || !bg) return 0;
  return contrastRatio(parseHsl(fg), parseHsl(bg));
}

// テーマのCSS変数を要素に適用する。
export function applyTheme(el: HTMLElement, theme: Theme): void {
  for (const [k, v] of Object.entries(theme.vars)) el.style.setProperty(k, v);
  el.dataset.themeDark = theme.dark ? 'true' : 'false';
}
