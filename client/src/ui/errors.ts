import type { ApiErrorCode } from '@lr/shared/api';
import { el } from './dom.ts';

/** Player-facing text. Private and internal targets share the generic unreachable text (E-2). */
export const ERROR_TEXT: Partial<Record<ApiErrorCode, string>> = {
  invalid_url: 'That does not look like a public website address. Check it and try again.',
  unreachable: 'The site could not be reached.',
  blocked_domain: 'This site cannot be used. Its owner asked us to block it.',
  rate_limited: 'Too many sites scanned from your network in the last hour. Try again later.',
};

export interface ErrorActions {
  retry?: () => void;
  manual?: () => void;
  back: () => void;
}

/** Ingestion error screen (E-1, E-2, E-4). */
export class ErrorView {
  readonly el: HTMLDivElement;
  private readonly text: HTMLParagraphElement;
  private readonly actions: HTMLDivElement;

  constructor(ui: HTMLElement) {
    this.text = el('p', { class: 'error-text', 'data-testid': 'error-text' });
    this.actions = el('div', { class: 'menu-row' });
    this.el = el(
      'div',
      { class: 'overlay error', role: 'alertdialog', 'aria-label': 'Problem' },
      el('h2', { text: 'Problem' }),
      this.text,
      this.actions,
    );
    this.el.hidden = true;
    ui.append(this.el);
  }

  show(code: ApiErrorCode, actions: ErrorActions) {
    this.text.textContent = ERROR_TEXT[code] ?? 'Something went wrong.';
    const buttons: [string, (() => void) | undefined][] = [
      ['Retry', actions.retry],
      ['Upload faces manually', actions.manual],
      ['Main menu', actions.back],
    ];
    this.actions.replaceChildren(
      ...buttons
        .filter(([, fn]) => fn)
        .map(([label, fn]) => {
          const b = el('button', { type: 'button', class: 'menu-button', text: label });
          b.addEventListener('click', () => {
            this.hide();
            fn!();
          });
          return b;
        }),
    );
    this.el.hidden = false;
    this.actions.querySelector('button')?.focus();
  }

  hide() {
    this.el.hidden = true;
  }
}
