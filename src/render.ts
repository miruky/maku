import type { Slide } from './deck';
import { renderMarkdown } from './markdown';

export function slideClassName(slide: Slide): string {
  return ['slide', `layout-${slide.layout}`, ...slide.classes].join(' ');
}

export function slideStyleAttr(slide: Slide): string {
  if (!slide.background) return '';
  const bg = slide.background;
  if (/^(https?:|data:)/.test(bg)) {
    return ` style="background-image:url('${bg}')" data-bg="image"`;
  }
  return ` style="background:${bg}"`;
}

export function slideInnerHtml(slide: Slide): string {
  if (slide.layout === 'split' && slide.columns && slide.columns.length > 0) {
    const cols = slide.columns.map((c) => `<div class="col">${renderMarkdown(c)}</div>`).join('');
    return `<div class="columns">${cols}</div>`;
  }
  return renderMarkdown(slide.content);
}

// 1枚分のスライド要素。一覧のサムネイルにも使う。
export function slideHtml(slide: Slide): string {
  return (
    `<div class="${slideClassName(slide)}"${slideStyleAttr(slide)}>` +
    `<div class="slide-body">${slideInnerHtml(slide)}</div>` +
    `</div>`
  );
}
