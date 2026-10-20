import { el } from '../ui/dom.ts';

/** On-the-spot color picker (E-5, D-3). Resolves with [primary, secondary]. */
export class ColorPicker {
  readonly el: HTMLDivElement;
  private readonly primary: HTMLInputElement;
  private readonly secondary: HTMLInputElement;
  private resolve: ((colors: [string, string]) => void) | null = null;

  constructor(ui: HTMLElement) {
    this.primary = el('input', { type: 'color', id: 'color-primary' });
    this.secondary = el('input', { type: 'color', id: 'color-secondary' });
    const ok = el('button', {
      type: 'submit',
      class: 'menu-button primary',
      text: 'Use these colors',
    });
    const form = el(
      'form',
      { class: 'menu-form' },
      el('p', { class: 'note', 'data-testid': 'picker-note' }),
      el('label', { for: 'color-primary', text: 'Primary color' }),
      this.primary,
      el('label', { for: 'color-secondary', text: 'Secondary color' }),
      this.secondary,
      ok,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.el.hidden = true;
      this.resolve?.([this.primary.value, this.secondary.value]);
      this.resolve = null;
    });
    this.el = el(
      'div',
      { class: 'overlay color-picker', role: 'dialog', 'aria-label': 'Pick brand colors' },
      el('h2', { text: 'Pick brand colors' }),
      form,
    );
    this.el.hidden = true;
    ui.append(this.el);
  }

  open(prefill: readonly [string, string], note: string): Promise<[string, string]> {
    this.primary.value = prefill[0];
    this.secondary.value = prefill[1];
    this.el.querySelector('.note')!.textContent = note;
    this.el.hidden = false;
    this.primary.focus();
    return new Promise((resolve) => (this.resolve = resolve));
  }
}
