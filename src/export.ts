import { deckRatio, type Deck } from './deck';
import { fitSlideBody } from './fit';
import { escapeHtml } from './markdown';
import { applyOverlay, slideOverlay, type Overlay } from './overlay';
import { typesetMath } from './math';
import { deckTitles, slideHtml, slideHtmlMapped } from './render';
import { applyTheme, themeOverrides, type Theme } from './themes';

// 書き出しは「見た目そのまま」を最優先する。各スライドを実寸で一度だけ描いて画像にし、
// PDF(jsPDF)とPPTX(PptxGenJS)に敷き詰める。寸法はデッキの縦横比(既定16:9)から決める。
// 重いライブラリは書き出し時に動的importで読み込み、初期表示を軽く保つ。

const BASE_W = 1280;

// デッキの縦横比から書き出し画素寸法を決める(幅は基準固定、高さを比率で算出)。
function dims(deck: Deck): { W: number; H: number } {
  const { w, h } = deckRatio(deck.meta);
  return { W: BASE_W, H: Math.round((BASE_W * h) / w) };
}

export function deckFilename(meta: Record<string, string>): string {
  const base = (meta.title ?? '').trim() || 'slides';
  const slug = base
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'slides';
}

// 単一スライド画像のファイル名。番号はゼロ埋めして並び順を保つ。
export function slideImageName(meta: Record<string, string>, index: number): string {
  return `${deckFilename(meta)}-${String(index + 1).padStart(2, '0')}.png`;
}

type Html2Canvas = (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

async function renderSlideCanvas(
  deck: Deck,
  theme: Theme,
  index: number,
  html2canvas: Html2Canvas,
  W: number,
  H: number,
  overlay?: Overlay,
): Promise<HTMLCanvasElement> {
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;pointer-events:none;`;
  const root = document.createElement('div');
  root.style.cssText = `width:${W}px;height:${H}px;position:relative;container-type:size;overflow:hidden;`;
  applyTheme(root, theme);
  for (const [k, v] of Object.entries(themeOverrides(deck.meta))) root.style.setProperty(k, v);
  const bg = theme.vars['--bg'] ?? '#ffffff';
  root.style.background = bg;
  root.innerHTML = slideHtmlMapped(deck.slides[index]!, {
    meta: deck.meta,
    index,
    total: deck.slides.length,
    titles: deckTitles(deck.slides),
  });
  // コピーボタンはUI専用。html2canvas は @media print を効かせないため、ノードごと取り除いて
  // ラスタ書き出し(PDF/PPTX/PNG)に写り込まないようにする(タッチ端末では薄く可視のため)。
  root.querySelectorAll('.code-copy').forEach((b) => b.remove());
  // 自由配置・図形(overlay)も書き出しに反映する(スライドの安定IDで紐付け)。
  const slide = root.querySelector('.slide');
  if (overlay && slide) applyOverlay(slide, slideOverlay(overlay, deck.slides[index]?.id ?? ''));
  holder.appendChild(root);
  document.body.appendChild(holder);
  // 数式を KaTeX で描画してからラスタライズする(でないと書き出しに生の TeX が出る)。
  await typesetMath(root);
  // はみ出す本文は枠に収める(画面表示と同じ縮小をラスタ書き出しにも適用)。
  if (slide instanceof HTMLElement) fitSlideBody(slide);
  try {
    return await html2canvas(root, {
      useCORS: true,
      scale: 2,
      width: W,
      height: H,
      windowWidth: W,
      windowHeight: H,
      backgroundColor: bg,
    });
  } finally {
    holder.remove();
  }
}

export interface ExportProgress {
  (done: number, total: number): void;
}

export async function exportPdf(
  deck: Deck,
  theme: Theme,
  onProgress?: ExportProgress,
  overlay?: Overlay,
): Promise<void> {
  if (deck.slides.length === 0) return;
  const { W, H } = dims(deck);
  const [h2c, jspdf] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const html2canvas = h2c.default as unknown as Html2Canvas;
  const pdf = new jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H] });
  for (let i = 0; i < deck.slides.length; i += 1) {
    const canvas = await renderSlideCanvas(deck, theme, i, html2canvas, W, H, overlay);
    if (i > 0) pdf.addPage([W, H], 'landscape');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, W, H);
    onProgress?.(i + 1, deck.slides.length);
  }
  pdf.save(`${deckFilename(deck.meta)}.pdf`);
}

// 現在のスライド1枚をPNGのdataURLにして返す。保存はUI側に任せる。
export async function renderSlidePng(
  deck: Deck,
  theme: Theme,
  index: number,
  overlay?: Overlay,
): Promise<string> {
  const slide = deck.slides[index];
  if (!slide) throw new Error('スライドがありません');
  const { W, H } = dims(deck);
  const h2c = await import('html2canvas');
  const html2canvas = h2c.default as unknown as Html2Canvas;
  const canvas = await renderSlideCanvas(deck, theme, index, html2canvas, W, H, overlay);
  return canvas.toDataURL('image/png');
}

// ── 単体HTML書き出し(サーバー不要で配布できる1ファイル) ──
// アプリの全CSS + テーマ変数 + 描画済みスライド + 最小ビューアJS を1つの .html に詰める。
// 画像/数式は埋め込み済みなら同梱され、オフラインでも矢印キー/クリックでめくれる。

// ビューア固有のCSS。アプリCSSの後に置いて、配布用の全画面表示・1枚ずつ表示へ上書きする。
const VIEWER_CSS = `*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0a0a0a;overflow:hidden}
body{display:grid;place-items:center}
.deck-root{width:min(100vw,calc(100vh*var(--deck-ar-num,1.7778)));max-width:none!important;height:auto;margin:0!important;border-radius:0!important;box-shadow:none!important}
.stage>.slide{display:none!important}
.stage>.slide.active{display:flex!important}
.code-copy{display:none!important}
.maku-hint{position:fixed;left:0;right:0;bottom:8px;text-align:center;color:#888;font:12px/1.4 system-ui,sans-serif;opacity:.45;pointer-events:none}
@media print{html,body{height:auto;overflow:visible;background:#fff}body{display:block}.deck-root{width:100%}.stage>.slide{display:flex!important;position:relative;page-break-after:always}.maku-hint{display:none}}`;

// 配布物に埋め込む最小ビューア。1枚ずつ表示し、←/→/Space/クリック/Home/End/F・#番号で操作する。
const VIEWER_JS = `(function(){var w=[].slice.call(document.querySelectorAll('.stage>.slide')),i=0;
function show(n){i=Math.max(0,Math.min(w.length-1,n));w.forEach(function(s,k){s.classList.toggle('active',k===i)});if(location.hash!=='#'+(i+1))history.replaceState(null,'','#'+(i+1))}
addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){show(i+1);e.preventDefault()}else if(e.key==='ArrowLeft'||e.key==='PageUp'){show(i-1)}else if(e.key==='Home'){show(0)}else if(e.key==='End'){show(w.length-1)}else if(e.key==='f'||e.key==='F'){var d=document;if(!d.fullscreenElement){(d.documentElement.requestFullscreen||function(){})()}else{(d.exitFullscreen||function(){}).call(d)}}});
addEventListener('click',function(e){if(e.target.closest('a'))return;show(i+1)});
var m=(location.hash||'').match(/\\d+/);show(m?+m[0]-1:0)})();`;

// Uint8Array を base64 へ(大きいフォントでもスタックを溢れさせないよう分割して変換)。
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// CSS 中の woff2 フォント url() を data: URI に焼き込む(数式=KaTeX を含むときだけ実際に走る)。
// KaTeX の @font-face は woff2/woff/ttf を持つが、現代ブラウザは woff2 を優先するため
// woff2 だけ埋め込めば、配布された単体HTMLでもオフラインで数式グリフが正しく出る。
async function inlineFontFiles(css: string): Promise<string> {
  const re = /url\(\s*(['"]?)([^'"()]+)\1\s*\)/gi;
  const urls = new Set<string>();
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (/\.woff2(\?|$)/i.test(m[2]!)) urls.add(m[2]!);
  }
  if (urls.size === 0) return css;
  const map = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (u) => {
      try {
        const res = await fetch(u);
        if (!res.ok) return;
        const buf = new Uint8Array(await res.arrayBuffer());
        map.set(u, `data:font/woff2;base64,${bytesToBase64(buf)}`);
      } catch {
        /* 取得不可(オフライン書き出し等)なら元の url を残す */
      }
    }),
  );
  return css.replace(re, (whole: string, _q: string, url: string) => {
    const data = map.get(url);
    return data ? `url(${data})` : whole;
  });
}

// アプリが読み込んでいる全スタイルシートの本文を集める(同一オリジンのみ。失敗分は黙ってスキップ)。
function collectAppCss(): string {
  let out = '';
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null; // クロスオリジン等で読めないシートは飛ばす
    }
    if (rules) for (const r of Array.from(rules)) out += r.cssText + '\n';
  }
  return out;
}

// 配布用 HTML 文書を組み立てる(純粋関数=テスト可能)。bodyHtml は描画済みの .deck-root。
export function buildStandaloneHtml(opts: { title: string; appCss: string; bodyHtml: string }): string {
  const title = escapeHtml(opts.title || 'slides');
  return (
    `<!doctype html>\n<html lang="ja">\n<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<title>${title}</title>\n` +
    `<style>\n${opts.appCss}\n${VIEWER_CSS}\n</style>\n` +
    `</head>\n<body>\n${opts.bodyHtml}\n` +
    `<div class="maku-hint">← / → ・クリックでめくる ・F で全画面</div>\n` +
    `<script>${VIEWER_JS}</script>\n</body>\n</html>\n`
  );
}

// 現在のデッキを単体HTML文字列にする。数式・自由配置(overlay)も埋め込んで配布できる形にする。
export async function exportHtml(deck: Deck, theme: Theme, overlay?: Overlay): Promise<string> {
  const { w, h } = deckRatio(deck.meta);
  const { W, H } = dims(deck);
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;';
  const deckRoot = document.createElement('div');
  deckRoot.className = 'deck-root';
  applyTheme(deckRoot, theme);
  for (const [k, v] of Object.entries(themeOverrides(deck.meta))) deckRoot.style.setProperty(k, v);
  deckRoot.style.setProperty('--deck-ar', `${w} / ${h}`);
  deckRoot.style.setProperty('--deck-ar-num', String(w / h));
  // 計測用に実寸を与える(はみ出し縮小の判定に必要)。焼き込み前に外すのでビューア表示には残さない。
  deckRoot.style.width = `${W}px`;
  deckRoot.style.height = `${H}px`;
  const stage = document.createElement('div');
  stage.className = 'stage';
  const titles = deckTitles(deck.slides);
  stage.innerHTML = deck.slides
    .map((s, i) =>
      slideHtml(s, { meta: deck.meta, index: i, total: deck.slides.length, titles }),
    )
    .join('');
  deckRoot.appendChild(stage);
  holder.appendChild(deckRoot);
  document.body.appendChild(holder);
  try {
    // 数式を KaTeX で描画して焼き込む(KaTeX の CSS もこの後 collectAppCss で拾われる)。
    await typesetMath(stage);
    // 自由配置(テキスト/図形/画像)をスライドの安定IDで焼き込む。
    const slideEls = stage.querySelectorAll<HTMLElement>('.slide');
    if (overlay) {
      slideEls.forEach((el, i) => applyOverlay(el, slideOverlay(overlay, deck.slides[i]?.id ?? '')));
    }
    // 先頭スライドを表示状態にしておく(ビューアJSが無効でも1枚は見える)。
    slideEls[0]?.classList.add('active');
    // 配布物にはコピーボタンの実体を残さない(ビューアJSが無く機能しないため。CSSでも保険)。
    deckRoot.querySelectorAll('.code-copy').forEach((b) => b.remove());
    // はみ出す本文は枠に収める(縮小率はサイズ非依存なのでビューアの表示サイズでも有効)。
    slideEls.forEach((el) => fitSlideBody(el));
    // 計測用の実寸インラインは外す(ビューア側の応答的サイズ調整を妨げないため)。
    deckRoot.style.width = '';
    deckRoot.style.height = '';
    const bodyHtml = deckRoot.outerHTML;
    // 数式フォント(KaTeX woff2)を焼き込み、配布先・オフラインでもグリフが崩れないようにする。
    const appCss = await inlineFontFiles(collectAppCss());
    return buildStandaloneHtml({ title: deck.meta.title ?? '', appCss, bodyHtml });
  } finally {
    holder.remove();
  }
}

export async function exportPptx(
  deck: Deck,
  theme: Theme,
  onProgress?: ExportProgress,
  overlay?: Overlay,
): Promise<void> {
  if (deck.slides.length === 0) return;
  const { W, H } = dims(deck);
  const [h2c, pptxMod] = await Promise.all([import('html2canvas'), import('pptxgenjs')]);
  const html2canvas = h2c.default as unknown as Html2Canvas;
  const PptxGenJS = pptxMod.default;
  const pres = new PptxGenJS();
  // スライド比に合わせて PPTX のページ寸法(インチ)も決める(幅 13.333in 基準)。
  const inW = 13.333;
  const inH = Math.round((inW * H) / W * 1000) / 1000;
  pres.defineLayout({ name: 'MAKU', width: inW, height: inH });
  pres.layout = 'MAKU';
  pres.author = 'maku';
  if (deck.meta.title) pres.title = deck.meta.title;
  for (let i = 0; i < deck.slides.length; i += 1) {
    const canvas = await renderSlideCanvas(deck, theme, i, html2canvas, W, H, overlay);
    const slide = pres.addSlide();
    slide.addImage({ data: canvas.toDataURL('image/png'), x: 0, y: 0, w: '100%', h: '100%' });
    const notes = deck.slides[i]!.notes;
    if (notes) slide.addNotes(notes);
    onProgress?.(i + 1, deck.slides.length);
  }
  await pres.writeFile({ fileName: `${deckFilename(deck.meta)}.pptx` });
}
