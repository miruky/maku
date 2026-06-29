// 内容がスライドの枠からはみ出すとき、本文(.slide-body)を等比縮小して収める(縮小のみ・拡大しない)。
// すべて cqh/cqw 基準で組まれているので「はみ出し比」は表示サイズに依存せず一定 → 一度計算すれば
// どの表示サイズ・書き出し寸法でも有効。段階表示で隠れたブロックも opacity:0 で場所を取るため、
// 計測は現在の表示ステップに左右されない(発表中にスケールが揺れない)。
//
// DOM の実レイアウトを測るためブラウザ専用。レイアウトを持たない環境(jsdom 等)では
// clientHeight/scrollHeight が 0 になり、ガードにより何もしない(安全)。
export function fitSlideBody(slide: HTMLElement): void {
  const body = slide.querySelector<HTMLElement>('.slide-body');
  if (!body) return;
  // まず素のサイズで測るため、前回のスケールを解除する。
  body.style.transform = '';
  body.style.transformOrigin = '';
  const cs = getComputedStyle(slide);
  const padX = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
  const padY = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0');
  const availW = slide.clientWidth - padX;
  const availH = slide.clientHeight - padY;
  if (availW <= 0 || availH <= 0) return;
  const needW = body.scrollWidth;
  const needH = body.scrollHeight;
  if (needW <= 0 || needH <= 0) return;
  const scale = Math.min(1, availW / needW, availH / needH);
  // ごく僅かなはみ出しは無視(端数で常時スケールしてにじませない)。
  if (scale < 0.995) {
    body.style.transformOrigin = 'top center';
    body.style.transform = `scale(${scale.toFixed(4)})`;
  }
}

// スケールを解除する(直接編集に戻るときなど、素のサイズで扱いたい場合)。
export function clearFit(slide: HTMLElement): void {
  const body = slide.querySelector<HTMLElement>('.slide-body');
  if (!body) return;
  body.style.transform = '';
  body.style.transformOrigin = '';
}
