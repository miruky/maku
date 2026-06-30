// QR コードの遅延タイプセット。コア(markdown.ts)は ```qr フェンスを data-qr を持つプレースホルダに
// するだけで、DOM非依存・テスト可能なまま保つ。ここで初めて qrcode-generator を動的 import して、
// モジュール行列を自前で SVG 化する(数式・Mermaid と同じ「使うときだけ遅延ロード」方針。初期バンドルは
// 依存ゼロのまま=QR は別チャンク)。スキャナの可読性のため配色はテーマ非依存の黒/白で固定する。

type QrCode = {
  addData: (data: string, mode?: 'Byte') => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};
type QrFactory = (typeNumber: number, ec: 'L' | 'M' | 'Q' | 'H') => QrCode;

let qrMod: QrFactory | null = null;

async function loadQr(): Promise<QrFactory> {
  if (!qrMod) {
    const mod = await import('qrcode-generator');
    qrMod = (mod as unknown as { default: QrFactory }).default;
  }
  return qrMod;
}

// 文字列を UTF-8 バイト列にし、各バイトを 1 文字(0–255)に詰めた Latin1 風文字列にする。
// qrcode-generator の Byte モード(既定 stringToBytes は charCodeAt)に渡すと、URL も日本語も
// UTF-8 として正しくエンコードされ、どのスキャナでも読める。
function toByteString(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

function qrSvg(qrcode: QrFactory, data: string): string {
  const qr = qrcode(0, 'M'); // 0=データに合わせて版を自動選択、誤り訂正レベル M
  qr.addData(toByteString(data), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const margin = 4; // 静寂域(クワイエットゾーン)。スキャンに必須。
  const size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return (
    `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" ` +
    `fill="#ffffff"/><path fill="#000000" d="${d}"/></svg>`
  );
}

// まだ描画していない QR ブロックがあるか(印刷/書き出しの早期スキップ判定に使う)。
export function hasPendingQr(root: ParentNode): boolean {
  return !!root.querySelector('.qr-block:not([data-qr-done])');
}

export async function typesetQr(root: ParentNode): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.qr-block:not([data-qr-done])'));
  if (!nodes.length) return;
  let qrcode: QrFactory;
  try {
    qrcode = await loadQr();
  } catch {
    return; // 読み込めなければ raw(URL テキストのフォールバック)のまま残す
  }
  for (const el of nodes) {
    const data = el.getAttribute('data-qr') ?? '';
    try {
      if (data.trim()) el.innerHTML = qrSvg(qrcode, data);
    } catch {
      el.classList.add('qr-error'); // 容量超過など。フォールバックのテキストを残す
    }
    el.setAttribute('data-qr-done', '1');
  }
}
