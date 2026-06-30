// :shortcode: 形式の絵文字を Unicode へ置換する(依存ゼロのデータのみ)。
// よく使う約120語を収録。未知のショートコードはそのまま残す(誤置換を避ける)。
// コードや数式の中身は呼び出し側で退避済みなので、ここでは素朴に置換してよい。

const EMOJI: Record<string, string> = {
  smile: '😄', smiley: '😃', grin: '😁', laughing: '😆', joy: '😂', rofl: '🤣',
  wink: '😉', blush: '😊', heart_eyes: '😍', thinking: '🤔', neutral_face: '😐',
  smirk: '😏', confused: '😕', cry: '😢', sob: '😭', angry: '😠', rage: '😡',
  scream: '😱', sweat_smile: '😅', sleeping: '😴', sunglasses: '😎', nerd: '🤓',
  zany: '🤪', star_struck: '🤩', hugs: '🤗', shush: '🤫', raised_eyebrow: '🤨',
  thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎', ok_hand: '👌',
  clap: '👏', wave: '👋', pray: '🙏', muscle: '💪', point_right: '👉',
  point_left: '👈', point_up: '☝️', point_down: '👇', raised_hands: '🙌',
  handshake: '🤝', fist: '✊', v: '✌️', writing_hand: '✍️', eyes: '👀',
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚',
  blue_heart: '💙', purple_heart: '💜', black_heart: '🖤', broken_heart: '💔',
  sparkling_heart: '💖', fire: '🔥', sparkles: '✨', star: '⭐', star2: '🌟',
  zap: '⚡', boom: '💥', collision: '💥', dizzy: '💫', tada: '🎉', party: '🥳',
  confetti_ball: '🎊', balloon: '🎈', gift: '🎁', trophy: '🏆', medal: '🏅',
  rocket: '🚀', airplane: '✈️', car: '🚗', bulb: '💡', battery: '🔋',
  computer: '💻', desktop: '🖥️', keyboard: '⌨️', iphone: '📱', camera: '📷',
  tv: '📺', phone: '☎️', email: '📧', envelope: '✉️', package: '📦',
  memo: '📝', pencil: '✏️', book: '📖', books: '📚', bookmark: '🔖',
  clipboard: '📋', calendar: '📅', chart: '📊', chart_up: '📈', chart_down: '📉',
  moneybag: '💰', dollar: '💵', credit_card: '💳', key: '🔑', lock: '🔒',
  unlock: '🔓', mag: '🔍', link: '🔗', paperclip: '📎', scissors: '✂️',
  gear: '⚙️', wrench: '🔧', hammer: '🔨', tools: '🛠️', nut_and_bolt: '🔩',
  bug: '🐛', warning: '⚠️', no_entry: '⛔', stop: '🛑', heavy_check_mark: '✔️',
  white_check_mark: '✅', x: '❌', heavy_multiplication_x: '✖️', question: '❓',
  exclamation: '❗', bangbang: '‼️', recycle: '♻️', infinity: '♾️',
  hourglass: '⌛', watch: '⌚', alarm_clock: '⏰', clock: '🕐', bell: '🔔',
  loudspeaker: '📢', mega: '📣', speech_balloon: '💬', thought_balloon: '💭',
  zzz: '💤', '100': '💯', ok: '🆗', new: '🆕', up: '🆙', cool: '🆒', free: '🆓',
  sun: '☀️', cloud: '☁️', rain: '🌧️', snowflake: '❄️', umbrella: '☂️',
  rainbow: '🌈', ocean: '🌊', earth_asia: '🌏', moon: '🌙', coffee: '☕',
  beer: '🍺', pizza: '🍕', apple: '🍎', cake: '🍰', seedling: '🌱',
  herb: '🌿', four_leaf_clover: '🍀', maple_leaf: '🍁', cherry_blossom: '🌸',
  rose: '🌹', dog: '🐶', cat: '🐱', penguin: '🐧', whale: '🐳', dragon: '🐉',
  unicorn: '🦄', butterfly: '🦋', robot: '🤖', alien: '👽', ghost: '👻',
  skull: '💀', poop: '💩', crown: '👑', gem: '💎', dart: '🎯', game: '🎮',
  art: '🎨', musical_note: '🎵', notes: '🎶', microphone: '🎤', headphones: '🎧',
  flag: '🚩', checkered_flag: '🏁', construction: '🚧', anchor: '⚓',
  compass: '🧭', map: '🗺️', round_pushpin: '📍', pushpin: '📌',
};

// 文字列中の :shortcode: を絵文字へ。アンダースコア・英数・+・- を許容。
// 直前が英数字のときは置換しない(比 0:100:200 や 5:ok:6 のような範囲・スコアを絵文字化しない)。
// 絵文字ショートコードは通常、行頭か空白・記号の後に書かれるため、この前置文字の条件で誤爆を防ぐ。
const SHORTCODE_RE = /(^|[^0-9A-Za-z])(:[a-z0-9_+-]+:)/gi;

export function emojify(text: string): string {
  if (text.indexOf(':') === -1) return text;
  return text.replace(SHORTCODE_RE, (m, pre: string, code: string) => {
    const name = code.slice(1, -1).toLowerCase();
    const glyph = EMOJI[name];
    return glyph ? pre + glyph : m;
  });
}

// テスト/UI 補完用に収録数を公開。
export const EMOJI_COUNT = Object.keys(EMOJI).length;
