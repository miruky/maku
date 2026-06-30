import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownMapped, topLevelBlockStarts } from './markdown';

describe('renderMarkdown', () => {
  it('見出しと段落', () => {
    expect(renderMarkdown('# 表題')).toBe('<h1>表題</h1>');
    expect(renderMarkdown('本文です')).toBe('<p>本文です</p>');
  });

  it('強調・打ち消し・コード', () => {
    expect(renderMarkdown('**太字**')).toContain('<strong>太字</strong>');
    expect(renderMarkdown('*斜体*')).toContain('<em>斜体</em>');
    expect(renderMarkdown('~~消~~')).toContain('<del>消</del>');
    expect(renderMarkdown('`x = 1`')).toContain('<code>x = 1</code>');
  });

  it('ハイライト ==x== / 上付き ^x^ / 下付き ~x~', () => {
    expect(renderMarkdown('==重要==')).toContain('<mark>重要</mark>');
    expect(renderMarkdown('==重要 な 点==')).toContain('<mark>重要 な 点</mark>'); // 中間の空白は可
    expect(renderMarkdown('x^2^')).toContain('x<sup>2</sup>');
    expect(renderMarkdown('H~2~O')).toContain('H<sub>2</sub>O');
    expect(renderMarkdown('Ca^2+^')).toContain('Ca<sup>2+</sup>'); // 電荷(+ - ( ) . を許可)
    expect(renderMarkdown('C~6~H~12~O~6~')).toContain('C<sub>6</sub>H<sub>12</sub>O<sub>6</sub>');
    // 打ち消し ~~…~~ は下付きに食われない(先に処理)。
    const del = renderMarkdown('~~消した~~');
    expect(del).toContain('<del>消した</del>');
    expect(del).not.toContain('<sub>');
    // 上付き・下付きは空白を含む場合は対象外(誤検出回避)。
    expect(renderMarkdown('a ~ b ~ c')).not.toContain('<sub>');
    expect(renderMarkdown('2 ^ 3 ^ 4')).not.toContain('<sup>');
    // 列区切りの === は本文インラインに来てもハイライトにならない。
    expect(renderMarkdown('2019 === 開始')).not.toContain('<mark>');
  });

  it('インライン記法の誤検出を抑える(回帰防止: 和文範囲・脚注・空マーク)', () => {
    // 和文の波ダッシュ範囲(営業時間など)を下付きにしない。
    expect(renderMarkdown('9~17時、12~13時')).not.toContain('<sub>');
    expect(renderMarkdown('受付は 9~17 です')).not.toContain('<sub>'); // 数字のみでも空白隣接で対象外
    // 脚注参照 [^1] を上付きに巻き込まない(脚注は未対応のため素通し)。
    const fn = renderMarkdown('これは脚注です[^1]。本文[^2]。');
    expect(fn).not.toContain('<sup>');
    expect(fn).toContain('[^1]');
    expect(fn).toContain('[^2]');
    // 空/空白のみのハイライトは作らない。
    expect(renderMarkdown('== ==')).not.toContain('<mark>');
    // 打消し内に単独 ~ があっても下付きに化けない。
    expect(renderMarkdown('~~a~b~~')).not.toContain('<sub>');
  });

  it('_ の強調は語境界のみ。語中アンダースコア(snake_case / URL)は斜体化しない', () => {
    expect(renderMarkdown('_斜体_')).toContain('<em>斜体</em>'); // 語境界では有効
    expect(renderMarkdown('語の _強調_ です')).toContain('<em>強調</em>');
    const snake = renderMarkdown('let user_id_value = 1');
    expect(snake).not.toContain('<em>'); // 語中は強調しない
    expect(snake).toContain('user_id_value'); // アンダースコアを保つ
    expect(renderMarkdown('see foo_bar_baz here')).toContain('foo_bar_baz');
    // 日本語の語中アンダースコアも斜体化しない(\p{L} 判定)
    const jp = renderMarkdown('機能_詳細_を見る');
    expect(jp).not.toContain('<em>');
    expect(jp).toContain('機能_詳細_を見る');
    expect(renderMarkdown('語境界の _強調_ です')).toContain('<em>強調</em>'); // 境界では有効
  });

  it('箇条書き(入れ子)', () => {
    const html = renderMarkdown('- 親\n  - 子\n- 親2');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>子</li>');
    expect((html.match(/<ul>/g) ?? []).length).toBe(2);
  });

  it('番号付きリストとタスクリスト', () => {
    expect(renderMarkdown('1. 一\n2. 二')).toContain('<ol>');
    const task = renderMarkdown('- [x] 完了\n- [ ] 未了');
    expect(task).toContain('checked');
    expect(task).toContain('type="checkbox"');
  });

  it('引用とコードブロック', () => {
    expect(renderMarkdown('> 引用')).toContain('<blockquote>');
    const code = renderMarkdown('```ts\nconst a = 1;\n```');
    expect(code).toContain('language-ts');
    // ハイライトでトークンが span に分割されるが、タグを剥がせば元コードが復元できる。
    expect(code.replace(/<[^>]+>/g, '')).toContain('const a = 1;');
    expect(code).toContain('hl-keyword'); // const がキーワードとして色付く
  });

  it('表(配置つき)', () => {
    const html = renderMarkdown('| 名 | 値 |\n|:--|--:|\n| a | 1 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th style="text-align:left">名</th>');
    expect(html).toContain('text-align:right');
  });

  it('リンクと画像、危険なURLは無効化', () => {
    expect(renderMarkdown('[名](https://e.com)')).toContain('href="https://e.com"');
    expect(renderMarkdown('[x](javascript:alert(1))')).toContain('href="#"');
    expect(renderMarkdown('![図](https://e.com/a.png)')).toContain('<img src="https://e.com/a.png"');
  });

  it('HTMLをエスケープする', () => {
    expect(renderMarkdown('<script>')).toBe('<p>&lt;script&gt;</p>');
  });

  it(':shortcode: 絵文字を置換し、未知のものは残す', () => {
    expect(renderMarkdown('やった :tada: :rocket:')).toContain('🎉');
    expect(renderMarkdown('やった :tada: :rocket:')).toContain('🚀');
    expect(renderMarkdown(':not_a_real_emoji_xyz:')).toContain(':not_a_real_emoji_xyz:');
    // コード内のコロンは絵文字化しない(退避済み)。
    expect(renderMarkdown('`:tada:`')).toContain(':tada:');
  });

  it('絵文字は直前が英数字なら置換しない(範囲・スコアの誤爆を防ぐ)', () => {
    expect(renderMarkdown('比 0:100:200')).toContain('0:100:200');
    expect(renderMarkdown('比 0:100:200')).not.toContain('💯');
    expect(renderMarkdown('評価 5:ok:6')).toContain('5:ok:6');
    // 空白・行頭の後では従来どおり置換する。
    expect(renderMarkdown('完了 :100:')).toContain('💯');
  });

  it('コードfenceの情報文字列を data-meta に保存する(編集の往復で保つため)', () => {
    const html = renderMarkdown('```ts title=app.ts lineNumbers\nconst a=1;\n```');
    expect(html).toContain('data-meta="title=app.ts lineNumbers"');
  });

  it('インライン数式 $…$ を data-tex プレースホルダにする', () => {
    const html = renderMarkdown('式は $a^2 + b^2$ です');
    expect(html).toContain('class="math math-inline"');
    expect(html).toContain('data-tex="a^2 + b^2"');
  });

  it('通貨など $ は数式化しない($5 / $5 and $10)', () => {
    expect(renderMarkdown('価格は $5 です')).not.toContain('data-tex');
    expect(renderMarkdown('$5 and $10')).not.toContain('data-tex');
  });

  it('インライン数式の < は data-tex で生TeXに戻す(KaTeX 用)', () => {
    const html = renderMarkdown('$a < b$');
    expect(html).toContain('data-tex="a &lt; b"'); // 属性内は &lt; だが getAttribute で a < b に戻る
  });

  it('ブロック数式 $$…$$ (単一行/複数行)を math-block にする', () => {
    expect(renderMarkdown('$$ E = mc^2 $$')).toContain('class="math math-block"');
    const multi = renderMarkdown('$$\n\\int_0^1 x\\,dx\n$$');
    expect(multi).toContain('class="math math-block"');
    expect(multi).toContain('data-tex="\\int_0^1 x\\,dx"');
  });

  // 退行防止: 「$$」で始まり同一行で閉じない行(入力途中など)が無限ループにならない。
  it('開き行に式がある/閉じない $$ でもハングせず math-block を返す', () => {
    for (const src of ['$$x', '$$ x', '$$E=mc^2', '$$\\frac{1}{2}\n$$', '$$x\n$$']) {
      const html = renderMarkdown(src);
      expect(html).toContain('class="math math-block"');
    }
    // 開き行の式が最初の TeX 行として拾われる
    expect(renderMarkdown('$$E=mc^2\n$$')).toContain('data-tex="E=mc^2"');
  });

  it('```mermaid は図ブロック(.mermaid-block + data-mermaid)にし、ハイライトしない', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```');
    expect(html).toContain('class="mermaid-block"');
    expect(html).toContain('data-mermaid="graph TD');
    expect(html).not.toContain('code-block'); // 通常のコードブロックにはしない
    expect(html).toContain('graph TD'); // 描画前のフォールバックに生ソースが残る
  });

  it('mermaid のソースは属性へHTMLエスケープして入れる(注入防止)', () => {
    const html = renderMarkdown('```mermaid\nA["<b>x</b>"]\n```');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('```qr は QR ブロック(.qr-block + data-qr)にし、ハイライトしない', () => {
    const html = renderMarkdown('```qr\nhttps://example.com/x?a=1\n```');
    expect(html).toContain('class="qr-block"');
    expect(html).toContain('data-qr="https://example.com/x?a=1"');
    expect(html).not.toContain('code-block');
    expect(html).toContain('https://example.com/x?a=1'); // 描画前フォールバックに残る
  });

  it('qr のソースは属性へHTMLエスケープして入れる(注入防止)', () => {
    const html = renderMarkdown('```qr\n"><img src=x onerror=alert(1)>\n```');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
  });

  it('画像 alt のディレクティブ(サイズ/フィルタ)を style にし、altから除く', () => {
    const html = renderMarkdown('![ロゴ w:200 h:120 blur:4px rounded](https://e.com/a.png)');
    expect(html).toContain('width:200px');
    expect(html).toContain('height:120px');
    expect(html).toContain('filter:blur(4px)');
    expect(html).toContain('border-radius');
    expect(html).toContain('alt="ロゴ"'); // ディレクティブ語は alt から除去
  });

  it('画像ディレクティブは不正値を弾く(CSS注入防止)', () => {
    // 不正な値(数値でないフィルタ・不正サイズ)は style 化されず、危険なCSSは生成しない。
    const html = renderMarkdown('![x blur:evil w:abc](https://e.com/a.png)');
    expect(html).not.toContain('filter:');
    expect(html).not.toContain('style=');
  });

  it('水平線', () => {
    expect(renderMarkdown('***')).toBe('<hr />');
  });

  it('コードスパンの中は他の記法に巻き込まれない', () => {
    expect(renderMarkdown('`[x](y)`')).toContain('<code>[x](y)</code>');
    expect(renderMarkdown('`**a**`')).toContain('<code>**a**</code>');
  });

  it('画像/リンクの属性は引用符をエスケープ(XSS防止)', () => {
    expect(renderMarkdown('![a"x](https://e.com/a.png)')).toContain('alt="a&quot;x"');
    expect(renderMarkdown('![z](https://e.com/a.png)')).toContain('decoding="async"');
  });

  it('複数リンク・強調隣接でも属性が壊れない(target=_blank 回帰防止)', () => {
    const two = renderMarkdown('[A](https://a.com) と [B](https://b.com)');
    expect(two).toContain('href="https://a.com"');
    expect(two).toContain('href="https://b.com"');
    expect(two).not.toContain('<em>');
    expect((two.match(/target="_blank"/g) ?? []).length).toBe(2);
    const mix = renderMarkdown('[公式](https://e.com) を _参照_');
    expect(mix).toContain('href="https://e.com"');
    expect(mix).toContain('<em>参照</em>');
    expect(mix).not.toContain('target="<em>');
  });

  it('リンクラベル内の強調は効く', () => {
    expect(renderMarkdown('[**太字**](https://e.com)')).toContain('><strong>太字</strong></a>');
  });

  it('入力に紛れた番兵(U+E000)で undefined が混入しない', () => {
    expect(renderMarkdown('a0b')).not.toContain('undefined');
  });
});

describe('renderMarkdownMapped / topLevelBlockStarts', () => {
  it('steps から data-step / data-key を付ける', () => {
    const src = [
      { text: '# A', offset: 0 },
      { text: '', offset: 4 },
      { text: 'B', offset: 5 },
    ];
    const html = renderMarkdownMapped(src, [
      { step: 1, key: true },
      { step: 2, key: false },
    ]);
    expect(html).toContain('data-step="1"');
    expect(html).toContain('data-key="1"');
    expect(html).toContain('data-step="2"');
    expect((html.match(/data-key/g) ?? []).length).toBe(1);
  });

  it('トップレベルブロック数を数える(フェンス内の # は無視)', () => {
    const lines = '# H\n\npara\n\n```\n# not a heading\n```\n\nlast'.split('\n');
    expect(topLevelBlockStarts(lines).length).toBe(4);
  });
});
