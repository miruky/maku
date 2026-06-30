// 数式(KaTeX)の遅延タイプセット。コア(markdown.ts)は data-tex を持つプレースホルダを出すだけで
// DOM非依存・テスト可能なまま。ここで初めて katex を動的 import し、ブラウザ上で data-tex ノードを
// 描画する。export(html2canvas)でも typesetMath(root) を await してからラスタライズできる。
// 既存の書き出しライブラリと同じ「使うときだけ遅延ロード」方針で、初期バンドルは依存ゼロを保つ。

type Katex = {
  renderToString: (
    tex: string,
    opts?: { displayMode?: boolean; throwOnError?: boolean; output?: string },
  ) => string;
};

let katexMod: Katex | null = null;
let cssPromise: Promise<unknown> | null = null;

function loadCss(): Promise<unknown> {
  if (!cssPromise) {
    // Vite が CSS の副作用 import を処理する(使うときだけ読み込む)。
    cssPromise = import('katex/dist/katex.min.css').catch(() => undefined);
  }
  return cssPromise;
}

async function loadKatex(): Promise<Katex> {
  if (!katexMod) {
    const [mod] = await Promise.all([import('katex'), loadCss()]);
    katexMod = (mod as unknown as { default: Katex }).default;
  }
  return katexMod;
}

// まだ描画していない数式ノードがあるか(export 側の早期スキップ判定に使う)。
export function hasPendingMath(root: ParentNode): boolean {
  return !!root.querySelector('[data-tex]:not([data-tex-done])');
}

// root 配下の data-tex ノードを KaTeX で描画する。べき等(描画済みは skip)。
export async function typesetMath(root: ParentNode): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-tex]:not([data-tex-done])'));
  if (!nodes.length) return;
  let katex: Katex;
  try {
    katex = await loadKatex();
  } catch {
    return; // 読み込めなければ raw(fallback テキスト)のまま残す
  }
  for (const el of nodes) {
    const tex = el.getAttribute('data-tex') ?? '';
    const display = el.classList.contains('math-block');
    try {
      el.innerHTML = katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        output: 'html',
      });
    } catch {
      // 失敗時は fallback の生テキストを残す
    }
    el.setAttribute('data-tex-done', '1');
  }
}
