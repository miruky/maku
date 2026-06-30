import { describe, it, expect } from 'vitest';
import { highlightCode, hasGrammar } from './highlight';

// タグを剥がし実体参照を戻して、ハイライト結果から元コードを復元する。
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

describe('highlightCode', () => {
  it('未知/プレーン言語はエスケープのみでspanを付けない', () => {
    expect(highlightCode('a < b & c', '')).toBe('a &lt; b &amp; c');
    expect(highlightCode('plain text', 'text')).toBe('plain text');
    expect(highlightCode('x = 1', 'plaintext')).toBe('x = 1');
  });

  it('どの言語でもタグを剥がせば元コードが完全に復元できる(編集の双方向性)', () => {
    const samples: Array<[string, string]> = [
      ['typescript', 'const x: number = 1; // c\nfunction f(a) { return a < 2 && a > 0; }'],
      ['python', 'def f(x):\n    # コメント\n    return x ** 2 if x else None'],
      ['bash', 'echo "hi" # note\nfor f in *.ts; do cat "$f"; done'],
      ['sql', "SELECT * FROM t WHERE a < 10 AND b = 'x'; -- c"],
      ['json', '{"a": 1, "b": [true, null], "c": "x<y"}'],
      ['html', '<div class="a">x &amp; y</div><!-- c -->'],
      ['css', '.a > .b { color: #fff; width: 50%; } /* c */'],
      ['go', 'func main() {\n\tx := 1 // c\n\tfmt.Println(x)\n}'],
      ['rust', 'fn main() { let mut x = 1; /* c */ println!("{}", x); }'],
      ['diff', '@@ -1 +1 @@\n-old line\n+new line'],
      ['unknownlang', 'foo(bar) = 1 < 2 // x'],
    ];
    for (const [lang, code] of samples) {
      expect(plain(highlightCode(code, lang)), `${lang} round-trip`).toBe(code);
    }
  });

  it('HTMLメタ文字を必ずエスケープする(コードからのHTML注入を防ぐ)', () => {
    const out = highlightCode('const s = "<script>alert(1)</script>";', 'js');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('JS/TS: キーワード・文字列・数値・コメントを色分けする', () => {
    const out = highlightCode('const n = 42; // hi', 'ts');
    expect(out).toContain('<span class="hl-keyword">const</span>');
    expect(out).toContain('<span class="hl-number">42</span>');
    expect(out).toContain('<span class="hl-comment">// hi</span>');
    const str = highlightCode('let s = "hello";', 'js');
    expect(str).toContain('<span class="hl-string">"hello"</span>');
  });

  it('JS: 関数呼び出しの識別子を function として色分けする', () => {
    const out = highlightCode('doThing(1)', 'js');
    expect(out).toContain('<span class="hl-function">doThing</span>');
  });

  it('Python: # コメントと def キーワード、真偽値リテラル', () => {
    const out = highlightCode('def f():\n    return True  # ok', 'py');
    expect(out).toContain('<span class="hl-keyword">def</span>');
    expect(out).toContain('<span class="hl-literal">True</span>');
    expect(out).toContain('<span class="hl-comment"># ok</span>');
  });

  it('JSON: キーは property、値文字列は string', () => {
    const out = highlightCode('{"key": "val"}', 'json');
    expect(out).toContain('<span class="hl-property">"key"</span>');
    expect(out).toContain('<span class="hl-string">"val"</span>');
  });

  it('diff: 追加行/削除行/ハンク見出しを色分け', () => {
    const out = highlightCode('@@ -1 +1 @@\n+added\n-removed', 'diff');
    expect(out).toContain('<span class="hl-meta">@@ -1 +1 @@</span>');
    expect(out).toContain('<span class="hl-inserted">+added</span>');
    expect(out).toContain('<span class="hl-deleted">-removed</span>');
  });

  it('複数行のコメント/文字列でも改行を保持する(行番号と整合)', () => {
    const out = highlightCode('/* line1\nline2 */\nx', 'js');
    expect(plain(out)).toBe('/* line1\nline2 */\nx');
    expect((out.match(/\n/g) ?? []).length).toBe(2); // 改行は2つ保持
  });

  it('言語エイリアスを解決する', () => {
    expect(hasGrammar('js')).toBe(true);
    expect(hasGrammar('py')).toBe(true);
    expect(hasGrammar('sh')).toBe(true);
    expect(hasGrammar('rs')).toBe(true);
    expect(hasGrammar('totally-made-up')).toBe(false);
  });
});
