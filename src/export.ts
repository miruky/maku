import type { Deck } from './deck';
import { slideHtml } from './render';
import { applyTheme, type Theme } from './themes';

// 書き出しは「見た目そのまま」を最優先する。各スライドを実寸(1280×720)で
// 一度だけ描いて画像にし、PDF(jsPDF)とPPTX(PptxGenJS)に敷き詰める。
// 重いライブラリは書き出し時に動的importで読み込み、初期表示を軽く保つ。

const W = 1280;
const H = 720;

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

type Html2Canvas = (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

async function renderSlideCanvas(
  deck: Deck,
  theme: Theme,
  index: number,
  html2canvas: Html2Canvas,
): Promise<HTMLCanvasElement> {
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;pointer-events:none;`;
  const root = document.createElement('div');
  root.style.cssText = `width:${W}px;height:${H}px;position:relative;container-type:size;overflow:hidden;`;
  applyTheme(root, theme);
  const bg = theme.vars['--bg'] ?? '#ffffff';
  root.style.background = bg;
  root.innerHTML = slideHtml(deck.slides[index]!);
  holder.appendChild(root);
  document.body.appendChild(holder);
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

export async function exportPdf(deck: Deck, theme: Theme, onProgress?: ExportProgress): Promise<void> {
  if (deck.slides.length === 0) return;
  const [h2c, jspdf] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const html2canvas = h2c.default as unknown as Html2Canvas;
  const pdf = new jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H] });
  for (let i = 0; i < deck.slides.length; i += 1) {
    const canvas = await renderSlideCanvas(deck, theme, i, html2canvas);
    if (i > 0) pdf.addPage([W, H], 'landscape');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, W, H);
    onProgress?.(i + 1, deck.slides.length);
  }
  pdf.save(`${deckFilename(deck.meta)}.pdf`);
}

export async function exportPptx(deck: Deck, theme: Theme, onProgress?: ExportProgress): Promise<void> {
  if (deck.slides.length === 0) return;
  const [h2c, pptxMod] = await Promise.all([import('html2canvas'), import('pptxgenjs')]);
  const html2canvas = h2c.default as unknown as Html2Canvas;
  const PptxGenJS = pptxMod.default;
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'MAKU16x9', width: 13.333, height: 7.5 });
  pres.layout = 'MAKU16x9';
  pres.author = 'maku';
  if (deck.meta.title) pres.title = deck.meta.title;
  for (let i = 0; i < deck.slides.length; i += 1) {
    const canvas = await renderSlideCanvas(deck, theme, i, html2canvas);
    const slide = pres.addSlide();
    slide.addImage({ data: canvas.toDataURL('image/png'), x: 0, y: 0, w: '100%', h: '100%' });
    const notes = deck.slides[i]!.notes;
    if (notes) slide.addNotes(notes);
    onProgress?.(i + 1, deck.slides.length);
  }
  await pres.writeFile({ fileName: `${deckFilename(deck.meta)}.pptx` });
}
