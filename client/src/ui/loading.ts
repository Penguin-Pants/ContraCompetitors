import { el } from './dom.ts';

/** Ingestion progress (up to 30 s). */
export class LoadingView {
  readonly el: HTMLDivElement;
  private readonly label: HTMLParagraphElement;
  private readonly bar: HTMLDivElement;
  private timer = 0;

  constructor(ui: HTMLElement) {
    this.label = el('p', { class: 'loading-label' });
    this.bar = el('div', { class: 'loading-fill' });
    this.el = el(
      'div',
      { class: 'overlay loading', role: 'status', 'aria-live': 'polite', 'aria-label': 'Loading' },
      el('h2', { text: 'Scanning the site' }),
      this.label,
      el('div', { class: 'loading-bar' }, this.bar),
      el('p', {
        class: 'note',
        text: 'Looking for brand colors and team photos. This takes up to 30 seconds.',
      }),
    );
    this.el.hidden = true;
    ui.append(this.el);
  }

  show(domain: string, budgetMs = 30_000) {
    const t0 = performance.now();
    this.label.textContent = domain;
    this.el.hidden = false;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / budgetMs);
      this.bar.style.width = `${Math.round(p * 100)}%`;
      this.timer = requestAnimationFrame(tick);
    };
    tick();
  }

  hide() {
    cancelAnimationFrame(this.timer);
    this.el.hidden = true;
  }
}
