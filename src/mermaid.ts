// Mermaid 図の遅延タイプセット。コア(markdown.ts)は ```mermaid フェンスを
// data-mermaid を持つプレースホルダにするだけで、DOM非依存・テスト可能なまま保つ。
// ここで初めて mermaid を動的 import して SVG に描画する。数式(math.ts)と同じく
// 「使うときだけ遅延ロード」方針なので、初期バンドルは依存ゼロのまま(mermaid は別チャンク)。

type MermaidApi = {
  initialize: (cfg: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

let mermaidMod: MermaidApi | null = null;
let initedDark: boolean | null = null;
let seq = 0;

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidMod) {
    const mod = await import('mermaid');
    mermaidMod = (mod as unknown as { default: MermaidApi }).default;
  }
  return mermaidMod;
}

// root の文脈(deck-root の data-theme-dark)から、図をダーク配色で描くか判定する。
function isDarkContext(root: ParentNode): boolean {
  const host = root instanceof Element ? (root.closest('[data-theme-dark]') ?? root) : null;
  return host instanceof HTMLElement ? host.dataset.themeDark === 'true' : false;
}

// まだ描画していない Mermaid ブロックがあるか(export 側の早期スキップ判定に使う)。
export function hasPendingMermaid(root: ParentNode): boolean {
  return !!root.querySelector('.mermaid-block:not([data-mermaid-done])');
}

// 描画済みの図を未描画状態(生ソースのフォールバック)へ戻す。Mermaid は配色を SVG に焼き込むため、
// 明暗テーマを切り替えたら描き直す必要がある(その前段でこれを呼んで再 typeset する)。
export function resetMermaid(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('.mermaid-block[data-mermaid-done]')) {
    const src = el.getAttribute('data-mermaid') ?? '';
    el.classList.remove('mermaid-error');
    el.removeAttribute('data-mermaid-done');
    el.textContent = ''; // 中身(旧SVG)を消す
    const pre = document.createElement('pre');
    pre.className = 'mermaid-src';
    pre.textContent = src; // textContent なので自動エスケープ
    el.appendChild(pre);
  }
}

// root 配下の Mermaid ブロックを SVG に描画する。べき等(描画済みは skip)。
export async function typesetMermaid(root: ParentNode): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>('.mermaid-block:not([data-mermaid-done])'),
  );
  if (!blocks.length) return;
  let mermaid: MermaidApi;
  try {
    mermaid = await loadMermaid();
  } catch {
    return; // 読み込めなければ fallback(生ソース)のまま残す
  }
  const dark = isDarkContext(root);
  if (initedDark !== dark) {
    // ラベル等を厳格にサニタイズ(securityLevel: strict)。テーマはデッキの明暗に合わせる。
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
    initedDark = dark;
  }
  for (const el of blocks) {
    const src = el.getAttribute('data-mermaid') ?? '';
    el.setAttribute('data-mermaid-done', '1');
    seq += 1;
    try {
      const { svg } = await mermaid.render(`mmd-${seq}`, src);
      el.innerHTML = svg;
    } catch {
      el.classList.add('mermaid-error'); // 失敗時は fallback の生ソースを残す
    }
  }
}
