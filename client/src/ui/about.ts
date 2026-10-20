import { el } from './dom.ts';
import { footerLinks } from './footer.ts';

/** About view (DOM overlay on L3). */
export class AboutView {
  readonly el: HTMLDivElement;

  constructor(ui: HTMLElement) {
    const close = el('button', { type: 'button', class: 'menu-button', text: 'Close' });
    close.addEventListener('click', () => this.hide());
    this.el = el(
      'div',
      { class: 'overlay about', role: 'dialog', 'aria-label': 'About' },
      el('h2', { text: 'About Logistics Run' }),
      el('p', {
        text:
          'Logistics Run is a retro run-and-gun game. Enter a company website and the game themes itself ' +
          'with the brand colors and the employee faces it finds on that site. Reach the Receiving Zone ' +
          'as fast as you can.',
      }),
      el('p', {
        text:
          'Faces are found by face detection and cropped to the face only. There is no face recognition ' +
          'and no names are stored. Faces from a site stay in server memory for less than 24 hours and ' +
          'are then deleted. Uploaded faces are never stored.',
      }),
      el('p', {
        text:
          'To remove faces from a site or to block a domain, send a takedown or blocklist request. ' +
          'A blocked domain is rejected at once and its cached faces are deleted within one minute.',
      }),
      el('p', { class: 'links' }, ...footerLinks()),
      close,
    );
    this.el.hidden = true;
    this.el.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.hide();
    });
    ui.append(this.el);
  }

  show() {
    this.el.hidden = false;
    this.el.querySelector('button')?.focus();
  }

  hide() {
    this.el.hidden = true;
  }
}
