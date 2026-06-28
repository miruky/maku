// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDeck } from './deck';
import { Presenter } from './present';

function setup(md: string) {
  const stage = document.createElement('div');
  const els = {
    stage,
    progress: document.createElement('div'),
    counter: document.createElement('div'),
    notes: document.createElement('div'),
  };
  const p = new Presenter(els);
  p.setDeck(parseDeck(md), false);
  const visible = (): number =>
    Array.from(stage.querySelectorAll('[data-step]')).filter((e) => !e.classList.contains('frag-hidden'))
      .length;
  const steps = (): number => stage.querySelectorAll('[data-step]').length;
  return { p, stage, visible, steps };
}

describe('Presenter 段階表示', () => {
  it('sequential: 最初は1つ、next で増え、末尾の next は次スライドへ', () => {
    const { p, visible } = setup('<!-- incremental -->\n# A\n\nB\n\nC\n\n---\n\n# slide2');
    expect(visible()).toBe(1);
    p.next();
    expect(visible()).toBe(2);
    p.next();
    expect(visible()).toBe(3);
    expect(p.index).toBe(0);
    p.next();
    expect(p.index).toBe(1);
  });

  it('key-first: キー(見出し)が入場時に見える', () => {
    const { stage } = setup('<!-- reveal: key-first -->\n# 要点\n\n本文1\n\n本文2');
    const key = stage.querySelector('[data-key]');
    expect(key).not.toBeNull();
    expect(key!.classList.contains('frag-hidden')).toBe(false);
  });

  it('step:2 のみでも入場時に表示される(空白にしない)', () => {
    const { visible } = setup('<!-- incremental -->\n<!-- step: 2 -->\nA\n\n<!-- step: 3 -->\nB');
    expect(visible()).toBe(1);
  });

  it('段組レイアウトでもセルが順次表示される', () => {
    const { p, visible, steps } = setup('<!-- layout: grid -->\n<!-- incremental -->\nA\n===\nB\n===\nC');
    expect(steps()).toBe(3);
    expect(visible()).toBe(1);
    p.next();
    expect(visible()).toBe(2);
  });

  it('reveal なしは next で次スライドへ', () => {
    const { p } = setup('# A\n\nB\n\n---\n\n# slide2');
    expect(p.index).toBe(0);
    p.next();
    expect(p.index).toBe(1);
  });

  it('編集中(authoring)は段階を刻まず next で直接次スライドへ', () => {
    // 回帰防止: 編集中は全ブロックが見えているのに、next が見えないステップを空送りしていた。
    const { p, visible } = setup('<!-- incremental -->\n# A\n\nB\n\nC\n\n---\n\n# slide2');
    p.setAuthoring(true);
    expect(visible()).toBe(3); // 編集中は全部見えている
    p.next();
    expect(p.index).toBe(1); // 段階を踏まずにスライドが進む
  });

  it('authoring を抜けると step が先頭へ戻る(置き去りで途中状態から始まらない)', () => {
    // 回帰防止: 編集中に進めた step が残り、発表へ戻ったスライドが全表示で始まっていた。
    const { p, visible } = setup('<!-- incremental -->\n# A\n\nB\n\nC');
    p.next();
    p.next();
    expect(visible()).toBe(3); // step を最後まで進めた
    p.setAuthoring(true);
    p.setAuthoring(false); // 発表へ復帰 → step は先頭へ
    expect(visible()).toBe(1);
  });

  it('resetSteps で現在スライドが先頭ステップへ戻る(発表開始時)', () => {
    // 回帰防止: 閲覧中に → で進めた状態のまま発表を始めると途中表示で開いていた。
    const { p, visible } = setup('<!-- incremental -->\n# A\n\nB\n\nC');
    p.next();
    p.next();
    expect(visible()).toBe(3);
    p.resetSteps();
    expect(visible()).toBe(1);
  });
});
