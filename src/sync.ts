// 発表者コンソール(別ウィンドウ)と本体ウィンドウの同期。同一オリジンの BroadcastChannel を使う
// ので、サーバ無し・100%ブラウザ内という maku の方針を崩さない。メッセージ種別を本体↔コンソールで
// 重ならないように分け、互いのブロードキャストがループしないようにしている(本体は state/deck を
// 発し、コンソールは cmd/hello を発する)。古い環境で BroadcastChannel が無ければ null を返す。
export const SYNC_CHANNEL = 'maku-present';

export type SyncMsg =
  | { t: 'state'; index: number; step: number; total: number } // 本体→コンソール: 現在位置・ステップ
  | { t: 'deck'; md: string; theme: string } // 本体→コンソール: 本文とテーマ(チャンネルを真実とする)
  | { t: 'cmd'; cmd: 'next' | 'prev' | 'first' | 'last' | 'goto'; index?: number } // コンソール→本体: 操作
  | { t: 'hello' }; // コンソール→本体: 起動したので現在状態をください

export function openSync(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(SYNC_CHANNEL);
  } catch {
    return null;
  }
}
