import { formatTime } from '../game/timer.ts';

/** In-run HUD on L3. */
export class Hud {
  readonly el: HTMLDivElement;
  private readonly timeEl: HTMLSpanElement;
  private readonly livesEl: HTMLSpanElement;
  private readonly weaponEl: HTMLSpanElement;
  private shownTime = '';
  private shownLives = -1;
  private shownWeapon = '';

  constructor(ui: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.timeEl = document.createElement('span');
    this.timeEl.className = 'hud-time';
    this.timeEl.dataset.testid = 'timer';
    this.livesEl = document.createElement('span');
    this.livesEl.className = 'hud-lives';
    this.livesEl.dataset.testid = 'lives';
    this.weaponEl = document.createElement('span');
    this.weaponEl.className = 'hud-weapon';
    this.weaponEl.dataset.testid = 'weapon';
    this.el.append(this.timeEl, this.livesEl, this.weaponEl);
    ui.append(this.el);
  }

  setTime(ms: number) {
    const text = formatTime(ms);
    if (text !== this.shownTime) {
      this.shownTime = text;
      this.timeEl.textContent = text;
    }
  }

  setLives(count: number) {
    if (count === this.shownLives) return;
    this.shownLives = count;
    this.livesEl.textContent = '\u25A0'.repeat(Math.max(0, count));
    this.livesEl.setAttribute('aria-label', `${count} lives`);
  }

  setWeapon(name: string) {
    if (name === this.shownWeapon) return;
    this.shownWeapon = name;
    this.weaponEl.textContent = name;
  }

  dispose() {
    this.el.remove();
  }
}
