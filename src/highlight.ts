// 依存ゼロ・DOM非依存のシンタックスハイライタ。コードブロックの中身を
// <span class="hl-…"> のトークンに色分けする。純粋な string → string なので
// コア(markdown.ts)から呼べてユニットテストでき、書き出し(html2canvas)にもそのまま乗る。
//
// 方針: 言語ごとの文法(コメント記法・文字列・キーワード集合)を設定で表し、
// 多くの C 系言語は汎用トークナイザで処理する。html/css/json/diff など構造が
// 大きく異なるものは専用トークナイザを用意する。未知の言語は汎用+広めの
// キーワード和集合で扱い、最低でも文字列/数値/コメントは色分けされるようにする。

const AMP = /&/g;
const LT = /</g;
const GT = />/g;

function esc(s: string): string {
  return s.replace(AMP, '&amp;').replace(LT, '&lt;').replace(GT, '&gt;');
}

function span(type: string, text: string): string {
  return `<span class="hl-${type}">${esc(text)}</span>`;
}

// 改行をまたぐトークン(ブロックコメント・複数行文字列)を行ごとの span に割る。
// これで出力中の \n は必ず span の外に来るので、後段(markdown.ts)で行ごとに安全に分割でき、
// 行ハイライト(行単位のラップ)を入れてもトークン span が壊れない。
function spanMulti(type: string, text: string): string {
  return text
    .split('\n')
    .map((line) => (line ? span(type, line) : ''))
    .join('\n');
}

const set = (s: string): Set<string> => new Set(s.trim().split(/\s+/));

interface Grammar {
  hashComment?: boolean; // # 行コメント
  slashComment?: boolean; // // 行コメント
  dashComment?: boolean; // -- 行コメント(SQL/Lua)
  blockComment?: boolean; // /* */ ブロックコメント
  tripleString?: boolean; // """ ''' (Python)
  backtickString?: boolean; // テンプレートリテラル
  caseInsensitive?: boolean; // SQL 等、キーワードを大小無視で判定
  keywords: Set<string>;
  builtins?: Set<string>;
  types?: Set<string>;
}

// ── 言語別キーワード ──
const JS_KW = set(`
  abstract as async await break case catch class const continue debugger declare default delete do
  else enum export extends finally for from function get if implements import in infer instanceof
  interface is keyof let namespace new of override package private protected public readonly return
  satisfies set static super switch this throw try type typeof var void while with yield
`);
const JS_LIT = set('true false null undefined NaN Infinity this super');
const JS_TYPES = set('string number boolean any unknown never void object bigint symbol');
const JS_BUILTIN = set(`
  console window document Math JSON Object Array String Number Boolean Promise Map Set WeakMap WeakSet
  Symbol RegExp Date Error TypeError RangeError Function Proxy Reflect BigInt globalThis require module
  exports process Buffer setTimeout setInterval clearTimeout clearInterval fetch localStorage
`);

const PY_KW = set(`
  and as assert async await break class continue def del elif else except finally for from global if
  import in is lambda nonlocal not or pass raise return try while with yield match case
`);
const PY_LIT = set('True False None self cls __name__');
const PY_BUILTIN = set(`
  print len range int str float list dict set tuple bool open enumerate zip map filter sum min max abs
  sorted reversed type isinstance super input format repr id hash dir getattr setattr hasattr
`);

const BASH_KW = set(`
  if then else elif fi for while until do done case esac function in select return local export
  readonly declare unset shift source eval exec trap set
`);
const BASH_BUILTIN = set('echo cd ls cat grep sed awk pwd mkdir rm cp mv touch chmod curl wget git npm node printf read test');

const SQL_KW = set(`
  select from where insert update delete create table drop alter add column join inner left right outer
  full cross on group by order having limit offset as and or not null is in like between distinct values
  into set primary key foreign references index view union all case when then else end asc desc count
  sum avg min max exists begin commit rollback transaction with returning constraint default unique check
`);
const SQL_TYPES = set('int integer bigint smallint serial varchar char text boolean bool date timestamp time numeric decimal float double real json jsonb uuid bytea');

const GO_KW = set(`
  break case chan const continue default defer else fallthrough for func go goto if import interface map
  package range return select struct switch type var
`);
const GO_LIT = set('true false nil iota');
const GO_TYPES = set('bool string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 byte rune float32 float64 complex64 complex128 error any');

const RUST_KW = set(`
  as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod
  move mut pub ref return self Self static struct super trait type unsafe use where while
`);
const RUST_LIT = set('true false None Some Ok Err');
const RUST_TYPES = set('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box');

const JAVA_KW = set(`
  abstract assert break case catch class const continue default do else enum extends final finally for
  goto if implements import instanceof interface native new package private protected public return
  static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed
`);
const JAVA_LIT = set('true false null this super');
const JAVA_TYPES = set('int long short byte char boolean float double void String Integer Long Boolean Object List Map Set');

const C_KW = set(`
  auto break case char const continue default do double else enum extern float for goto if inline int
  long register restrict return short signed sizeof static struct switch typedef union unsigned void
  volatile while class namespace template typename public private protected virtual override final new
  delete using friend operator constexpr nullptr this true false bool
`);
const C_TYPES = set('int char float double void long short unsigned signed bool size_t int8_t int16_t int32_t int64_t uint8_t uint32_t uint64_t string vector map');

const GENERIC_KW = set(`
  if else for while do switch case break continue return function func def class struct enum interface
  import export from as const let var public private protected static new delete try catch finally throw
  this self super null nil none true false and or not in is void async await yield
`);

const GRAMMARS: Record<string, Grammar> = {
  javascript: { slashComment: true, blockComment: true, backtickString: true, keywords: JS_KW, builtins: JS_BUILTIN, types: JS_TYPES, ...{} },
  typescript: { slashComment: true, blockComment: true, backtickString: true, keywords: JS_KW, builtins: JS_BUILTIN, types: JS_TYPES },
  python: { hashComment: true, tripleString: true, keywords: PY_KW, builtins: PY_BUILTIN, types: set('') },
  bash: { hashComment: true, keywords: BASH_KW, builtins: BASH_BUILTIN, types: set('') },
  sql: { dashComment: true, blockComment: true, caseInsensitive: true, keywords: SQL_KW, types: SQL_TYPES },
  go: { slashComment: true, blockComment: true, backtickString: true, keywords: GO_KW, types: GO_TYPES },
  rust: { slashComment: true, blockComment: true, keywords: RUST_KW, types: RUST_TYPES },
  java: { slashComment: true, blockComment: true, keywords: JAVA_KW, types: JAVA_TYPES },
  c: { slashComment: true, blockComment: true, keywords: C_KW, types: C_TYPES },
  generic: { slashComment: true, blockComment: true, hashComment: true, keywords: GENERIC_KW, types: set('') },
};

// JS/Python の真偽値などのリテラル語をまとめて hl-literal にする補助集合。
const LITERALS: Record<string, Set<string>> = {
  javascript: JS_LIT,
  typescript: JS_LIT,
  python: PY_LIT,
  go: GO_LIT,
  rust: RUST_LIT,
  java: JAVA_LIT,
};

// 言語名(フェンス情報)の別名を正規化する。
const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', python3: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  postgres: 'sql', postgresql: 'sql', mysql: 'sql', sqlite: 'sql',
  golang: 'go',
  rs: 'rust',
  'c++': 'cpp', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp', cxx: 'cpp', 'objective-c': 'c',
  cs: 'csharp', 'c#': 'csharp',
  kt: 'kotlin', kts: 'kotlin',
  yml: 'yaml',
  htm: 'html', xml: 'html', svg: 'html', vue: 'html',
  scss: 'css', less: 'css', sass: 'css',
  shellsession: 'bash',
};

// 専用文法を持たない C 系言語は javascript 文法に寄せて最低限のキーワード/コメントを得る。
const CLIKE_FALLBACK: Record<string, string> = {
  cpp: 'c', csharp: 'java', kotlin: 'java', swift: 'java', scala: 'java',
  php: 'javascript', dart: 'javascript', groovy: 'java', ruby: 'python', perl: 'python',
  lua: 'generic', r: 'generic', toml: 'generic',
};

function resolveLang(lang: string): string {
  const l = lang.toLowerCase().trim();
  return ALIASES[l] ?? l;
}

const NUMBER_RE = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?\d*|\.\d[\d_]*)(?:[eE][+-]?\d+)?[a-zA-Z]*)/;
const IDENT_RE = /^[A-Za-z_$][\w$]*/;
const OP_RE = /^[+\-*/%=<>!&|^~?:@.]+/;
const PUNCT_RE = /^[{}()[\];,]/;

// 汎用トークナイザ。code の各位置で、コメント→文字列→数値→識別子→演算子→記号 の順に試す。
function tokenizeGeneric(code: string, g: Grammar, litSet?: Set<string>): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;

    // コメント
    if (g.blockComment && (m = /^\/\*[\s\S]*?\*\//.exec(rest))) { out += spanMulti('comment', m[0]); i += m[0].length; continue; }
    if (g.slashComment && (m = /^\/\/[^\n]*/.exec(rest))) { out += span('comment', m[0]); i += m[0].length; continue; }
    if (g.hashComment && (m = /^#[^\n]*/.exec(rest))) { out += span('comment', m[0]); i += m[0].length; continue; }
    if (g.dashComment && (m = /^--[^\n]*/.exec(rest))) { out += span('comment', m[0]); i += m[0].length; continue; }

    // 文字列
    if (g.tripleString && (m = /^"""[\s\S]*?"""|^'''[\s\S]*?'''/.exec(rest))) { out += spanMulti('string', m[0]); i += m[0].length; continue; }
    if ((m = /^"(?:\\.|[^"\\\n])*"|^'(?:\\.|[^'\\\n])*'/.exec(rest))) { out += span('string', m[0]); i += m[0].length; continue; }
    if (g.backtickString && (m = /^`(?:\\.|[^`\\])*`/.exec(rest))) { out += spanMulti('string', m[0]); i += m[0].length; continue; }

    // 数値
    if ((m = NUMBER_RE.exec(rest)) && m[0].length) { out += span('number', m[0]); i += m[0].length; continue; }

    // 識別子(キーワード/型/組込/リテラル/関数呼び出し/プレーン)
    if ((m = IDENT_RE.exec(rest))) {
      const word = m[0];
      const probe = g.caseInsensitive ? word.toLowerCase() : word;
      let type = '';
      if (litSet?.has(word)) type = 'literal';
      else if (g.keywords.has(probe)) type = 'keyword';
      else if (g.types?.has(word)) type = 'type';
      else if (g.builtins?.has(word)) type = 'builtin';
      else if (/^\s*\(/.test(rest.slice(word.length))) type = 'function';
      out += type ? span(type, word) : esc(word);
      i += word.length;
      continue;
    }

    // 演算子・記号
    if ((m = OP_RE.exec(rest))) { out += span('operator', m[0]); i += m[0].length; continue; }
    if ((m = PUNCT_RE.exec(rest))) { out += span('punctuation', m[0]); i += m[0].length; continue; }

    // 空白・その他は1文字ずつ素通し(エスケープのみ)
    out += esc(code[i]!);
    i += 1;
  }
  return out;
}

// JSON: 文字列キー(直後が :)を property、値文字列を string、数値/真偽/null を色分け。
function tokenizeJson(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^"(?:\\.|[^"\\])*"/.exec(rest))) {
      const isKey = /^\s*:/.test(rest.slice(m[0].length));
      out += span(isKey ? 'property' : 'string', m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)) && m[0].length) { out += span('number', m[0]); i += m[0].length; continue; }
    if ((m = /^(?:true|false|null)\b/.exec(rest))) { out += span('literal', m[0]); i += m[0].length; continue; }
    out += esc(code[i]!);
    i += 1;
  }
  return out;
}

// HTML/XML: コメント・タグ名・属性名・属性値・テキストを色分け。
function tokenizeHtml(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^<!--[\s\S]*?-->/.exec(rest))) { out += span('comment', m[0]); i += m[0].length; continue; }
    // タグ: <tag ...> または </tag>。内部の属性も処理する。
    if ((m = /^<\/?[a-zA-Z][\w:-]*/.exec(rest))) {
      const slash = m[0].startsWith('</') ? '&lt;/' : '&lt;';
      const name = m[0].replace(/^<\/?/, '');
      out += `<span class="hl-punctuation">${slash}</span><span class="hl-tag">${esc(name)}</span>`;
      i += m[0].length;
      // タグの中身(属性)を > まで処理
      while (i < n && code[i] !== '>') {
        const r2 = code.slice(i);
        let a: RegExpExecArray | null;
        if ((a = /^[a-zA-Z_:][\w:.-]*/.exec(r2))) { out += span('attr', a[0]); i += a[0].length; continue; }
        if ((a = /^"(?:[^"]*)"|^'(?:[^']*)'/.exec(r2))) { out += span('string', a[0]); i += a[0].length; continue; }
        if (code[i] === '/') { out += '<span class="hl-punctuation">/</span>'; i += 1; continue; }
        out += esc(code[i]!);
        i += 1;
      }
      continue;
    }
    if (code[i] === '>') { out += '<span class="hl-punctuation">&gt;</span>'; i += 1; continue; }
    out += esc(code[i]!);
    i += 1;
  }
  return out;
}

// CSS/SCSS/LESS: コメント・セレクタ・プロパティ・値・文字列・数値を色分け。
function tokenizeCss(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  let inBlock = false; // { } の内側はプロパティ/値
  while (i < n) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\/\*[\s\S]*?\*\//.exec(rest))) { out += span('comment', m[0]); i += m[0].length; continue; }
    if ((m = /^\/\/[^\n]*/.exec(rest))) { out += span('comment', m[0]); i += m[0].length; continue; }
    if ((m = /^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])*'/.exec(rest))) { out += span('string', m[0]); i += m[0].length; continue; }
    if (code[i] === '{') { inBlock = true; out += '<span class="hl-punctuation">{</span>'; i += 1; continue; }
    if (code[i] === '}') { inBlock = false; out += '<span class="hl-punctuation">}</span>'; i += 1; continue; }
    if ((m = /^#[0-9a-fA-F]{3,8}\b/.exec(rest))) { out += span('number', m[0]); i += m[0].length; continue; }
    if ((m = /^-?(?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|vh|vw|s|ms|deg|fr|pt|ex|ch|vmin|vmax)?\b/.exec(rest)) && m[0].length) { out += span('number', m[0]); i += m[0].length; continue; }
    if (!inBlock && (m = /^[.#]?[a-zA-Z_*:[][\w-]*(?:\([^)]*\))?/.exec(rest))) { out += span('tag', m[0]); i += m[0].length; continue; }
    if (inBlock && (m = /^[a-zA-Z-]+(?=\s*:)/.exec(rest))) { out += span('property', m[0]); i += m[0].length; continue; }
    if ((m = /^@[a-zA-Z-]+/.exec(rest))) { out += span('keyword', m[0]); i += m[0].length; continue; }
    if ((m = /^[a-zA-Z][\w-]*/.exec(rest))) { out += span('builtin', m[0]); i += m[0].length; continue; }
    out += esc(code[i]!);
    i += 1;
  }
  return out;
}

// diff/patch: 行頭の + / - / @@ / 見出し で色分け。
function tokenizeDiff(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      if (/^\+/.test(line) && !/^\+\+\+/.test(line)) return span('inserted', line);
      if (/^-/.test(line) && !/^---/.test(line)) return span('deleted', line);
      if (/^@@/.test(line)) return span('meta', line);
      if (/^(diff |index |\+\+\+|---) /.test(line) || /^(\+\+\+|---)/.test(line)) return span('comment', line);
      return esc(line);
    })
    .join('\n');
}

// コードブロック1つ分をハイライトしたHTMLを返す。lang が空/不明でも文字列/数値/コメントは色付く。
// 戻り値は <code> の中に入れる安全なHTML(トークンは span、それ以外はエスケープ済み)。
export function highlightCode(code: string, lang: string): string {
  const l = resolveLang(lang || '');
  if (!l || l === 'text' || l === 'plain' || l === 'plaintext' || l === 'markdown' || l === 'md') {
    return esc(code);
  }
  if (l === 'json' || l === 'json5') return tokenizeJson(code);
  if (l === 'html') return tokenizeHtml(code);
  if (l === 'css') return tokenizeCss(code);
  if (l === 'diff' || l === 'patch') return tokenizeDiff(code);

  const grammarKey = GRAMMARS[l] ? l : (CLIKE_FALLBACK[l] ?? 'generic');
  const grammar = GRAMMARS[grammarKey] ?? GRAMMARS.generic!;
  return tokenizeGeneric(code, grammar, LITERALS[l] ?? LITERALS[grammarKey]);
}

// このハイライタが固有の文法を持つ言語か(未知言語の判定・テスト用)。
export function hasGrammar(lang: string): boolean {
  const l = resolveLang(lang || '');
  return (
    l === 'json' || l === 'json5' || l === 'html' || l === 'css' || l === 'diff' || l === 'patch' ||
    !!GRAMMARS[l] || !!CLIKE_FALLBACK[l]
  );
}
