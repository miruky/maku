// 100種類のテーマ。色25系統 × 昼/夜 × 明朝/ゴシック = 100。
// 各テーマはCSSカスタムプロパティの束で、スライドの土台に流し込む。
// HSLで体系的に作るので、どれも彩度・明度がそろい、シンプルで統一感がある。

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
} as const;

const hsl = (h: number, s: number, l: number): string => `hsl(${h} ${Math.round(s)}% ${l}%)`;

function lightVars(f: Family): Record<string, string> {
  const a = Math.max(f.sat, 50);
  return {
    '--bg': hsl(f.hue, f.sat * 0.5, 97),
    '--surface': hsl(f.hue, f.sat * 0.5, 99),
    '--fg': hsl(f.hue, Math.min(f.sat, 28), 15),
    '--muted': hsl(f.hue, f.sat * 0.4, 42),
    '--rule': hsl(f.hue, f.sat * 0.5, 87),
    '--accent': hsl(f.hue, a, 40),
    '--accent-soft': hsl(f.hue, a * 0.7, 92),
    '--code-bg': hsl(f.hue, f.sat * 0.5, 94),
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
  };
}

function buildThemes(): Theme[] {
  const out: Theme[] = [];
  for (const f of FAMILIES) {
    for (const mode of ['light', 'dark'] as const) {
      for (const fontKey of ['mincho', 'gothic'] as const) {
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

// テーマのCSS変数を要素に適用する。
export function applyTheme(el: HTMLElement, theme: Theme): void {
  for (const [k, v] of Object.entries(theme.vars)) el.style.setProperty(k, v);
  el.dataset.themeDark = theme.dark ? 'true' : 'false';
}
