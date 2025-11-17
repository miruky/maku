import type { Slide } from './deck';
import { renderMarkdown } from './markdown';

export function slideClassName(slide: Slide): string {
  return ['slide', `layout-${slide.layout}`, ...slide.classes].join(' ');
}

// url('…') の単一引用符や style 属性の二重引用符を抜け出せる文字を
// パーセントエンコードする。残りの URL 文字(英数や :/.?=#- や base64 の +/=)は素通しする。
function encodeBgUrl(url: string): string {
  return url.replace(
    /['"()\\\s<>&]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
  );
}

// 色・グラデーション値を style 属性に入れるためのHTMLエスケープ。属性からの脱出を防ぐ。
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function slideStyleAttr(slide: Slide): string {
  if (!slide.background) return '';
  const bg = slide.background;
  if (/^(https?:|data:)/.test(bg)) {
    return ` style="background-image:url('${encodeBgUrl(bg)}')" data-bg="image"`;
  }
  return ` style="background:${escapeAttr(bg)}"`;
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
