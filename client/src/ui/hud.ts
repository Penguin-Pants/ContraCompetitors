import { formatTime } from '../game/timer.ts';

/** In-run HUD on L3. */
export class Hud {
  readonly el: HTMLDivElement;
  private readonly timeEl: HTMLSpanElement;
  private shownTime = '';

  constructor(ui: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.timeEl = document.createElement('span');
    this.timeEl.className = 'hud-time';
    this.timeEl.dataset.testid = 'timer';
    this.el.append(this.timeEl);
    ui.append(this.el);
  }

  setTime(ms: number) {
    const text = formatTime(ms);
    if (text !== this.shownTime) {
      this.shownTime = text;
      this.timeEl.textContent = text;
    }
  }

  dispose() {
    this.el.remove();
  }
}
