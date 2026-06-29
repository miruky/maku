// 発表中の手書き注釈(ペン)とレーザーポインタ。deck-root を覆う透明キャンバスに描く。
// スライド本体・書き出し・直接編集には一切触れない純粋な上載りレイヤ(発表支援専用)。
// ストロークは 0–1 正規化座標で持ち、リサイズ(全画面切替など)で再描画して位置を保つ。

type Mode = 'off' | 'pen' | 'laser';
type Pt = { x: number; y: number };

const INK = '#ef4444'; // どのテーマでも視認しやすい赤

export class Annotator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mode: Mode = 'off';
  private strokes: Pt[][] = []; // 確定したペンの線(正規化座標)
  private cur: Pt[] | null = null; // 描画中の線
  private laser: Pt | null = null;
  private laserTimer = 0;
  private cssW = 0;
  private cssH = 0;

  constructor(private readonly host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'annot-canvas';
    this.canvas.hidden = true;
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(host);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
  }

  get active(): boolean {
    return this.mode !== 'off';
  }

  // 同じモードを指定したら off に戻す(キーでのトグル用)。
  toggle(m: 'pen' | 'laser'): void {
    this.setMode(this.mode === m ? 'off' : m);
  }

  setMode(m: Mode): void {
    this.mode = m;
    this.canvas.hidden = m === 'off';
    this.canvas.style.pointerEvents = m === 'off' ? 'none' : 'auto';
    this.canvas.style.cursor = m === 'off' ? '' : 'crosshair';
    if (m !== 'laser') this.laser = null;
    if (m === 'off') {
      this.cur = null;
    }
    this.redraw();
  }

  // ペンの線だけ消す(レーザーは一時的なので対象外)。
  clearInk(): void {
    this.strokes = [];
    this.cur = null;
    this.redraw();
  }

  // すべて消してモードも解除(スライド移動時などに呼ぶ)。
  reset(): void {
    this.strokes = [];
    this.cur = null;
    this.laser = null;
    this.setMode('off');
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.cssW = this.host.clientWidth;
    this.cssH = this.host.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssH * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 以降は CSS px で描ける
    this.redraw();
  }

  private norm(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.width ? (e.clientX - r.left) / r.width : 0, y: r.height ? (e.clientY - r.top) / r.height : 0 };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.mode === 'off') return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    if (this.mode === 'pen') {
      this.cur = [this.norm(e)];
    } else {
      this.showLaser(this.norm(e));
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (this.mode === 'pen') {
      if (!this.cur) return;
      this.cur.push(this.norm(e));
      this.redraw();
    } else if (this.mode === 'laser') {
      this.showLaser(this.norm(e));
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (this.mode === 'pen' && this.cur) {
      if (this.cur.length > 1) this.strokes.push(this.cur);
      this.cur = null;
      this.redraw();
    }
    if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  };

  // レーザー点を出し、動きが止まったら少し後に消す(本物のレーザーらしく)。
  private showLaser(p: Pt): void {
    this.laser = p;
    this.redraw();
    if (this.laserTimer) window.clearTimeout(this.laserTimer);
    this.laserTimer = window.setTimeout(() => {
      this.laser = null;
      this.redraw();
    }, 900);
  }

  private stroke(pts: Pt[]): void {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x * this.cssW, pts[0]!.y * this.cssH);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x * this.cssW, pts[i]!.y * this.cssH);
    ctx.stroke();
  }

  private redraw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    for (const s of this.strokes) this.stroke(s);
    if (this.cur) this.stroke(this.cur);
    if (this.laser) {
      const x = this.laser.x * this.cssW;
      const y = this.laser.y * this.cssH;
      ctx.save();
      ctx.fillStyle = INK;
      ctx.shadowColor = INK;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
