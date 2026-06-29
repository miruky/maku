import { deckRatio, type Deck } from './deck';
import { applyOverlay, slideOverlay, type Overlay } from './overlay';
import { typesetMath } from './math';
import { slideHtmlMapped } from './render';
import { applyTheme, type Theme } from './themes';

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
  const bg = theme.vars['--bg'] ?? '#ffffff';
  root.style.background = bg;
  root.innerHTML = slideHtmlMapped(deck.slides[index]!, {
    meta: deck.meta,
    index,
    total: deck.slides.length,
  });
  // 自由配置・図形(overlay)も書き出しに反映する(スライドの安定IDで紐付け)。
  const slide = root.querySelector('.slide');
  if (overlay && slide) applyOverlay(slide, slideOverlay(overlay, deck.slides[index]?.id ?? ''));
  holder.appendChild(root);
  document.body.appendChild(holder);
  // 数式を KaTeX で描画してからラスタライズする(でないと書き出しに生の TeX が出る)。
  await typesetMath(root);
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
