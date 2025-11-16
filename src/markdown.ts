// スライド本文用のMarkdownレンダラ。見出し・段落・箇条書き(入れ子)・番号付き・
// タスクリスト・引用・コードブロック・表・水平線・強調/コード/リンク/画像に対応する。
// HTMLは先にエスケープし、許可した記法だけを後から復元する。

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// インライン記法。入力はエスケープ済みであること。
export function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
      const safe = /^(https?:|data:)/.test(src) ? src : '';
      return `<img src="${safe}" alt="${alt}" loading="lazy" />`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
      const safe = /^(https?:|mailto:|#)/.test(href) ? href : '#';
      return `<a href="${safe}" rel="noopener">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\s][^_]*)_/g, '$1<em>$2</em>');
}

interface Cursor {
  lines: string[];
  i: number;
}

const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

function indentOf(s: string): number {
  const m = /^(\s*)/.exec(s);
  return m ? m[1]!.replace(/\t/g, '  ').length : 0;
}

export function renderMarkdown(src: string): string {
  const cur: Cursor = { lines: src.replace(/\r\n?/g, '\n').split('\n'), i: 0 };
  return blocks(cur, 0);
}

// minIndent 以上のインデントを持つブロック列を読む(入れ子リスト用)。
function blocks(cur: Cursor, minIndent: number): string {
  const out: string[] = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i]!;
    if (line.trim() === '') {
      cur.i += 1;
      continue;
    }
    if (indentOf(line) < minIndent) break;

    const fence = /^(\s*)(```|~~~)\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      out.push(codeBlock(cur, fence[2]!, fence[3] ?? ''));
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2]!.trim()))}</h${level}>`);
      cur.i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr />');
      cur.i += 1;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      out.push(blockquote(cur));
      continue;
    }
    if (LIST_RE.test(line)) {
      out.push(list(cur, indentOf(line)));
      continue;
    }
    if (isTableStart(cur)) {
      out.push(table(cur));
      continue;
    }
    out.push(paragraph(cur, minIndent));
  }
  return out.join('\n');
}

function codeBlock(cur: Cursor, mark: string, lang: string): string {
  cur.i += 1;
  const body: string[] = [];
  while (cur.i < cur.lines.length && !cur.lines[cur.i]!.trimStart().startsWith(mark)) {
    body.push(cur.lines[cur.i]!);
    cur.i += 1;
  }
  if (cur.i < cur.lines.length) cur.i += 1; // 閉じフェンス
  const cls = lang ? ` class="language-${lang}"` : '';
  const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
  return `<pre data-lang="${escapeHtml(lang)}">${label}<code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`;
}

function blockquote(cur: Cursor): string {
  const inner: string[] = [];
  while (cur.i < cur.lines.length && /^\s*>\s?/.test(cur.lines[cur.i]!)) {
    inner.push(cur.lines[cur.i]!.replace(/^\s*>\s?/, ''));
    cur.i += 1;
  }
  return `<blockquote>${blocks({ lines: inner, i: 0 }, 0)}</blockquote>`;
}

function list(cur: Cursor, baseIndent: number): string {
  const first = LIST_RE.exec(cur.lines[cur.i]!)!;
  const ordered = /\d+\./.test(first[2]!);
  const tag = ordered ? 'ol' : 'ul';
  const items: string[] = [];

  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i]!;
    if (line.trim() === '') {
      cur.i += 1;
      continue;
    }
    const m = LIST_RE.exec(line);
    if (!m || indentOf(line) < baseIndent) break;
    if (indentOf(line) > baseIndent) {
      // 直前の項目の入れ子
      const nested = list(cur, indentOf(line));
      if (items.length > 0) items[items.length - 1] += nested;
      else items.push(nested);
      continue;
    }
    cur.i += 1;
    let content = m[3]!;
    const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
    if (task) {
      const checked = task[1]!.toLowerCase() === 'x';
      content = `<label class="task"><input type="checkbox" disabled${checked ? ' checked' : ''} /> ${inline(escapeHtml(task[2]!))}</label>`;
      items.push(content);
    } else {
      items.push(inline(escapeHtml(content)));
    }
  }
  return `<${tag}>${items.map((it) => `<li>${it}</li>`).join('')}</${tag}>`;
}

function isTableStart(cur: Cursor): boolean {
  const a = cur.lines[cur.i];
  const b = cur.lines[cur.i + 1];
  return !!a && !!b && a.includes('|') && /^\s*\|?[\s:|-]+\|?\s*$/.test(b) && b.includes('-');
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

function table(cur: Cursor): string {
  const header = splitRow(cur.lines[cur.i]!);
  const align = splitRow(cur.lines[cur.i + 1]!).map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return r && l ? 'center' : r ? 'right' : l ? 'left' : '';
  });
  cur.i += 2;
  const rows: string[][] = [];
  while (cur.i < cur.lines.length && cur.lines[cur.i]!.includes('|') && cur.lines[cur.i]!.trim() !== '') {
    rows.push(splitRow(cur.lines[cur.i]!));
    cur.i += 1;
  }
  const cell = (c: string, i: number, tag: string): string => {
    const a = align[i] ? ` style="text-align:${align[i]}"` : '';
    return `<${tag}${a}>${inline(escapeHtml(c))}</${tag}>`;
  };
  const head = `<tr>${header.map((c, i) => cell(c, i, 'th')).join('')}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c, i) => cell(c, i, 'td')).join('')}</tr>`).join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function paragraph(cur: Cursor, minIndent: number): string {
  const buf: string[] = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i]!;
    if (
      line.trim() === '' ||
      indentOf(line) < minIndent ||
      /^(#{1,6})\s/.test(line) ||
      /^\s*>\s?/.test(line) ||
      LIST_RE.test(line) ||
      /^(\s*)(```|~~~)/.test(line) ||
      /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)
    ) {
      break;
    }
    buf.push(line.trim());
    cur.i += 1;
  }
  return `<p>${buf.map((l) => inline(escapeHtml(l))).join('<br />')}</p>`;
}
