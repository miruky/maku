import { describe, expect, it } from 'vitest';
import { parseDeck, stripRevealDirectiveLines } from './deck';

describe('parseDeck', () => {
  it('フロントマターを読み、本文から除く', () => {
    const deck = parseDeck('---\ntitle: 発表\ntheme: ai-hiru-mincho\n---\n# 一枚目');
    expect(deck.meta.title).toBe('発表');
    expect(deck.meta.theme).toBe('ai-hiru-mincho');
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]!.content).toContain('# 一枚目');
  });

  it('--- でスライドを分割する', () => {
    const deck = parseDeck('# 1\n\n---\n\n# 2\n\n---\n\n# 3');
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides[1]!.content).toBe('# 2');
  });

  it('空のスライドは除く', () => {
    const deck = parseDeck('# 1\n\n---\n\n---\n\n# 2');
    expect(deck.slides).toHaveLength(2);
  });

  it('レイアウト指示(center / title / full)', () => {
    expect(parseDeck('<!-- center -->\n# x').slides[0]!.layout).toBe('center');
    expect(parseDeck('<!-- layout: title -->\n# x').slides[0]!.layout).toBe('title');
    expect(parseDeck('<!-- full -->\n# x').slides[0]!.layout).toBe('full');
  });

  it('背景・クラス・段階表示', () => {
    const s = parseDeck('<!-- bg: #102030 -->\n<!-- class: dim big -->\n<!-- incremental -->\n# x')
      .slides[0]!;
    expect(s.background).toBe('#102030');
    expect(s.classes).toEqual(['dim', 'big']);
    expect(s.incremental).toBe(true);
  });

  it('??? 以降はスピーカーノート', () => {
    const s = parseDeck('# 本文\n\n???\nここは原稿').slides[0]!;
    expect(s.content).toBe('# 本文');
    expect(s.notes).toBe('ここは原稿');
  });

  it('split レイアウトは === で段組に分かれる', () => {
    const s = parseDeck('<!-- layout: split -->\n左の話\n===\n右の話').slides[0]!;
    expect(s.layout).toBe('split');
    expect(s.columns).toEqual(['左の話', '右の話']);
  });

  it('grid は === で複数の部に分かれる', () => {
    const s = parseDeck('<!-- layout: grid -->\nA\n===\nB\n===\nC').slides[0]!;
    expect(s.layout).toBe('grid');
    expect(s.columns).toEqual(['A', 'B', 'C']);
  });

  it('末尾や重複の === は空の部を作らない', () => {
    expect(parseDeck('<!-- layout: grid -->\nA\n===\nB\n===').slides[0]!.columns).toEqual(['A', 'B']);
    expect(parseDeck('<!-- layout: cards -->\nA\n===\n===\nB').slides[0]!.columns).toEqual(['A', 'B']);
  });

  it('新しいレイアウト名(section/quote/stats/timeline/compare/image-left)を受け付ける', () => {
    for (const name of ['section', 'quote', 'stats', 'timeline', 'compare', 'image-left']) {
      expect(parseDeck(`<!-- layout: ${name} -->\n# x`).slides[0]!.layout).toBe(name);
    }
  });

  it('incremental は sequential + 連番ステップ(後方互換)', () => {
    const s = parseDeck('<!-- incremental -->\n# A\n\nB\n\nC').slides[0]!;
    expect(s.incremental).toBe(true);
    expect(s.reveal).toBe('sequential');
    expect(s.steps?.map((x) => x.step)).toEqual([1, 2, 3]);
    expect(s.steps?.every((x) => !x.key)).toBe(true);
  });

  it('reveal 指定が無ければ steps は null', () => {
    const s = parseDeck('# A\n\nB').slides[0]!;
    expect(s.reveal).toBe('none');
    expect(s.steps).toBeNull();
  });

  it('key-first は先頭をキー(step1)、以降は2から', () => {
    const s = parseDeck('<!-- reveal: key-first -->\n# 見出し\n\n本文1\n\n本文2').slides[0]!;
    expect(s.reveal).toBe('key-first');
    expect(s.steps?.[0]).toEqual({ step: 1, key: true });
    expect(s.steps?.[1]!.step).toBe(2);
    expect(s.steps?.[2]!.step).toBe(3);
  });

  it('<!-- key --> は次のブロックをキーにする', () => {
    const s = parseDeck('<!-- reveal: key-first -->\n前置き\n\n<!-- key -->\n# 要点\n\n詳細').slides[0]!;
    expect(s.steps?.findIndex((x) => x.key)).toBe(1);
    expect(s.steps?.[1]!.step).toBe(1);
  });

  it('group は前と同じステップ、step:N は明示。番号は連番に詰める(空ステップを作らない)', () => {
    const s = parseDeck('<!-- incremental -->\n一\n\n<!-- group -->\n二\n\n<!-- step: 5 -->\n三\n\n四').slides[0]!;
    // 一=1, 二=group(=1), 三=明示5, 四=自動6 → 連番化で 1,1,2,3。
    expect(s.steps?.map((x) => x.step)).toEqual([1, 1, 2, 3]);
  });

  it('空行を挟まないマーカーも含有ブロックに効く(畳み込み)', () => {
    const s = parseDeck('<!-- reveal: key-first -->\n行1\n<!-- key -->\n行2').slides[0]!;
    expect(s.steps?.some((x) => x.key)).toBe(true);
  });

  it('image-left も === で段に分かれる', () => {
    const s = parseDeck('<!-- layout: image-left -->\n本文\n===\n![z](https://e.com/a.jpg)').slides[0]!;
    expect(s.columns).toHaveLength(2);
  });

  it('段組は reveal を保持、quote/section は段階表示を切る', () => {
    expect(parseDeck('<!-- layout: grid -->\n<!-- incremental -->\nA\n===\nB').slides[0]!.reveal).toBe('sequential');
    expect(parseDeck('<!-- layout: quote -->\n<!-- incremental -->\nA').slides[0]!.reveal).toBe('none');
  });

  it('単一列の stats/cards に段階表示を付けても columns を捨てずレイアウトを保つ', () => {
    // 回帰防止: かつて単一列の段組系をフローに落とし、stats の大数字デザイン等が消えていた。
    const stats = parseDeck('<!-- layout: stats -->\n<!-- incremental -->\n#### 売上\n42\n\n#### 利用者\n1200').slides[0]!;
    expect(stats.layout).toBe('stats');
    expect(stats.columns).not.toBeNull();
    expect(stats.reveal).toBe('sequential');
    const cards = parseDeck('<!-- layout: cards -->\n<!-- incremental -->\n# 一枚だけのカード').slides[0]!;
    expect(cards.columns).not.toBeNull();
    expect(cards.reveal).toBe('sequential');
  });

  it('単一列の split/grid は段階表示でフロー(columns=null)に落としブロック単位で刻む', () => {
    const split = parseDeck('<!-- layout: split -->\n<!-- incremental -->\nA\n\nB\n\nC').slides[0]!;
    expect(split.columns).toBeNull();
    expect(split.steps?.map((x) => x.step)).toEqual([1, 2, 3]);
    const grid = parseDeck('<!-- layout: grid -->\n<!-- incremental -->\nA\n\nB').slides[0]!;
    expect(grid.columns).toBeNull();
    expect(grid.steps).toHaveLength(2);
  });

  it('=== を書いた split は1列に減っても段組のまま(フローに落とさない=区切りが本文に漏れない)', () => {
    // 回帰防止: 空セルが除かれて1列になったとき、フロー化で生の === が本文に出ていた。
    const s = parseDeck('<!-- layout: split -->\n<!-- incremental -->\nA\n\nB\n===').slides[0]!;
    expect(s.columns).not.toBeNull();
    expect(s.columns).toHaveLength(1);
    expect(s.columns!.join('\n')).not.toContain('===');
    expect(s.reveal).toBe('sequential');
  });
});

describe('stripRevealDirectiveLines', () => {
  it('先頭の reveal / incremental / fragment ディレクティブ行を取り除く', () => {
    expect(stripRevealDirectiveLines('<!-- reveal: sequential -->\n# A\n本文')).toBe('# A\n本文');
    expect(stripRevealDirectiveLines('<!-- incremental -->\n# A')).toBe('# A');
    expect(stripRevealDirectiveLines('<!-- fragment -->\nA')).toBe('A');
  });

  it('コロン前後に空白がある reveal も取り除く(parseDeck と整合)', () => {
    expect(stripRevealDirectiveLines('<!-- reveal : key-first -->\n本文')).toBe('本文');
  });

  it('コードフェンス内の例示ディレクティブは消さない(利用者の文書を守る)', () => {
    const md = '# 説明\n\n```md\n<!-- reveal: key-first -->\n# 見出し\n```\n';
    expect(stripRevealDirectiveLines(md)).toBe(md);
  });

  it('``` フェンス内の ~~~ ではフェンスを閉じない(内側の directive を消さない)', () => {
    const md = '# T\n\n```markdown\n~~~\n<!-- reveal: key-first -->\n~~~\n```\n';
    expect(stripRevealDirectiveLines(md)).toContain('<!-- reveal: key-first -->');
  });

  it('4連バッククォート内の3連ではフェンスを閉じない(ネスト)', () => {
    const md = '# T\n\n````md\n```\n<!-- fragment -->\n```\n````\n';
    expect(stripRevealDirectiveLines(md)).toContain('<!-- fragment -->');
  });

  it('フェンスの外側にある本物のディレクティブは(例示があっても)取り除く', () => {
    const md = '<!-- reveal: sequential -->\n# T\n\n```md\n<!-- incremental -->\n```\n';
    const out = stripRevealDirectiveLines(md);
    expect(out).not.toContain('<!-- reveal: sequential -->'); // 外側は除去
    expect(out).toContain('<!-- incremental -->'); // フェンス内の例示は保持
  });
});

describe('parseDeck フェンス対応(コード内の --- / 指示を誤解しない)', () => {
  it('コードフェンス内の --- ではスライドを分割しない', () => {
    const deck = parseDeck('# Demo\n\n```yaml\nfoo: 1\n---\nbar: 2\n```\n\nあと');
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]!.content).toContain('bar: 2');
  });

  it('コードフェンス内の <!-- reveal --> は指示として解釈しない(段階表示にしない)', () => {
    const s = parseDeck('```md\n<!-- reveal: key-first -->\n# 見出し\n```').slides[0]!;
    expect(s.reveal).toBe('none');
    expect(s.content).toContain('<!-- reveal: key-first -->'); // 本文として保持
  });

  it('フェンス外の本物の --- とディレクティブは従来どおり効く', () => {
    const deck = parseDeck('<!-- incremental -->\n# A\n\nB\n\n---\n\n# C');
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]!.reveal).toBe('sequential');
  });

  it('コードフェンス内の === では段組を割らない(コードブロックを保つ)', () => {
    const s = parseDeck('<!-- layout: split -->\n# Left\n\n```\na\n===\nb\n```\n\n===\n\n# Right').slides[0]!;
    expect(s.columns).toHaveLength(2);
    expect(s.columns![0]).toContain('a\n===\nb'); // フェンス内の === は左列にそのまま残る
    expect(s.columns![1]).toContain('# Right');
  });

  it('コードフェンス内の === がある split でも本物の区切りで2列に分かれる(従来の === は有効)', () => {
    const s = parseDeck('<!-- layout: split -->\nL\n===\nR').slides[0]!;
    expect(s.columns).toEqual(['L', 'R']);
  });

  it('コードフェンス内の ??? はノートにしない(本文を切らない)', () => {
    const s = parseDeck('# Demo\n\n```\nshell\n???\nmore\n```').slides[0]!;
    expect(s.notes).toBe('');
    expect(s.content).toContain('???');
    expect(s.content).toContain('more');
  });

  it('??? 以降(ノート)に書いたマーカーは本文ブロックに漏れない', () => {
    const s = parseDeck('<!-- reveal: sequential -->\n\n# H\n\nb1\n\nb2\n\n???\n\n<!-- pin -->\nnote').slides[0]!;
    expect(s.steps?.map((x) => x.step)).toEqual([1, 2, 3]); // 末尾ブロックが step:0(pin)に化けない
    expect(s.steps?.every((x) => x.step > 0)).toBe(true);
  });

  it('フェンス内だけの === は段組と見なさず、split でも段階表示(steps)が効く', () => {
    const s = parseDeck('<!-- layout: split -->\n<!-- reveal: sequential -->\n\n# H\n\n```\n===\n```\n\npara').slides[0]!;
    expect(s.columns).toBeNull(); // フェンス内 === は区切りでない → フロー段階表示へ
    expect(s.steps).not.toBeNull();
  });
});
