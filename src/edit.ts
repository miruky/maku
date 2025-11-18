// view側(描画済みスライド)の編集内容を、元のMarkdownブロックへ書き戻すためのシリアライザ。
// renderMarkdown が生成する範囲のHTML(見出し・段落・リスト・引用・表・コード・強調等)を
// 対象に、対応するMarkdownを再構成する。双方向編集の「view → md」方向を担う。

const ELEMENT = 1;
const TEXT = 3;

// インライン要素をMarkdownへ。テキストはそのまま、装飾は記法に戻す。
export function inlineToMd(node: Node): string {
  if (node.nodeType === TEXT) return node.textContent ?? '';
  if (node.nodeType !== ELEMENT) return '';
  const el = node as Element;
  const kids = (): string => Array.from(el.childNodes).map(inlineToMd).join('');
  switch (el.tagName) {
    case 'BR':
      return '\n';
    case 'STRONG':
    case 'B':
      return `**${kids()}**`;
    case 'EM':
    case 'I':
      return `*${kids()}*`;
    case 'DEL':
    case 'S':
    case 'STRIKE':
      return `~~${kids()}~~`;
    case 'CODE':
      return '`' + (el.textContent ?? '') + '`';
    case 'A':
      return `[${kids()}](${el.getAttribute('href') ?? ''})`;
    case 'IMG':
      return `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''})`;
    // contenteditable が改行で挿入しがちなブロック要素は改行として扱う。
    case 'DIV':
    case 'P':
      return (el.previousSibling ? '\n' : '') + kids();
    default:
      return kids();
  }
}

function inlineChildren(el: Element): string {
  return Array.from(el.childNodes).map(inlineToMd).join('');
}

// 描画済みのブロック要素1つを、対応するMarkdownへ戻す。
export function blockToMd(el: Element): string {
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    return '#'.repeat(level) + ' ' + inlineChildren(el).trim();
  }
  if (tag === 'UL' || tag === 'OL') return listToMd(el, 0);
  if (tag === 'BLOCKQUOTE') return blockquoteToMd(el);
  if (tag === 'TABLE') return tableToMd(el);
  if (tag === 'PRE') return preToMd(el);
  // P やその他は段落として扱う(<br> は改行)。
  return inlineChildren(el).replace(/\n+$/, '').trim();
}

function listToMd(listEl: Element, depth: number): string {
  const ordered = listEl.tagName === 'OL';
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  let n = 1;
  for (const li of Array.from(listEl.children)) {
    if (li.tagName !== 'LI') continue;
    const marker = ordered ? `${n}.` : '-';
    n += 1;
    const label = li.querySelector(':scope > label.task');
    if (label) {
      const cb = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const mark = cb && cb.checked ? 'x' : ' ';
      const text = Array.from(label.childNodes)
        .filter((c) => !(c.nodeType === ELEMENT && (c as Element).tagName === 'INPUT'))
        .map(inlineToMd)
        .join('')
        .trim();
      lines.push(`${pad}${marker} [${mark}] ${text}`);
      continue;
    }
    const nested: Element[] = [];
    const inlineNodes: Node[] = [];
    for (const c of Array.from(li.childNodes)) {
      if (c.nodeType === ELEMENT && ((c as Element).tagName === 'UL' || (c as Element).tagName === 'OL')) {
        nested.push(c as Element);
      } else {
        inlineNodes.push(c);
      }
    }
    const text = inlineNodes.map(inlineToMd).join('').trim();
    lines.push(`${pad}${marker} ${text}`);
    for (const nl of nested) lines.push(listToMd(nl, depth + 1));
  }
  return lines.join('\n');
}

function blockquoteToMd(el: Element): string {
  const blockChildren = Array.from(el.children).filter((c) => c.nodeType === ELEMENT);
  const inner = blockChildren.length
    ? blockChildren.map((c) => blockToMd(c)).join('\n\n')
    : inlineChildren(el).trim();
  return inner
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');
}

function cellAlign(cell: Element): string {
  const s = cell.getAttribute('style') ?? '';
  if (/center/.test(s)) return ':-:';
  if (/right/.test(s)) return '--:';
  if (/left/.test(s)) return ':--';
  return '---';
}

function cellText(cell: Element): string {
  return inlineChildren(cell).replace(/\|/g, '\\|').trim();
}

function tableToMd(table: Element): string {
  const ths = Array.from(table.querySelectorAll('thead th'));
  const header = '| ' + ths.map(cellText).join(' | ') + ' |';
  const sep = '| ' + ths.map(cellAlign).join(' | ') + ' |';
  const rows = Array.from(table.querySelectorAll('tbody tr')).map(
    (tr) => '| ' + Array.from(tr.children).map(cellText).join(' | ') + ' |',
  );
  return [header, sep, ...rows].join('\n');
}

function preToMd(pre: Element): string {
  const lang = pre.getAttribute('data-lang') ?? '';
  const code = pre.querySelector('code');
  const text = code?.textContent ?? '';
  return '```' + lang + '\n' + text.replace(/\n$/, '') + '\n```';
}
