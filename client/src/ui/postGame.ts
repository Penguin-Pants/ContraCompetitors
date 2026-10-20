import { formatTime } from '../game/timer.ts';
import { el } from './dom.ts';

/** Post-game screen (LB-5): final time, a leaderboard slot, Play again and Main menu. */
export class PostGame {
  readonly el: HTMLDivElement;
  /** Filled by the leaderboard view (Phase 9). */
  readonly slot: HTMLDivElement;
  private readonly time: HTMLParagraphElement;

  constructor(ui: HTMLElement, onPlayAgain: () => void, onMainMenu: () => void) {
    const again = el('button', {
      type: 'button',
      class: 'menu-button primary',
      text: 'Play again',
    });
    const menu = el('button', { type: 'button', class: 'menu-button', text: 'Main menu' });
    again.addEventListener('click', onPlayAgain);
    menu.addEventListener('click', onMainMenu);
    this.time = el('p', { class: 'final-time', 'data-testid': 'final-time' });
    this.slot = el('div', { class: 'leaderboard-slot' });
    this.el = el(
      'div',
      { class: 'overlay post-game', role: 'dialog', 'aria-label': 'Run complete' },
      el('h2', { text: 'Shipment delivered' }),
      this.time,
      this.slot,
      el('div', { class: 'menu-row' }, again, menu),
    );
    this.el.hidden = true;
    ui.append(this.el);
  }

  show(timeMs: number) {
    this.time.textContent = formatTime(timeMs);
    this.el.hidden = false;
    this.el.querySelector<HTMLButtonElement>('.menu-button')?.focus();
  }

  hide() {
    this.el.hidden = true;
    this.slot.replaceChildren();
  }
}
