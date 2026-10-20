import { el, readMeta } from './dom.ts';

/**
 * Footer links (SEC-5, AGPL section 13): About, takedown and blocklist request, Source code.
 * The contact address arrives as a plain address in a meta tag; the scheme is added here only.
 */
export function createFooter(onAbout: () => void): HTMLElement {
  const about = el('button', { type: 'button', class: 'link-button', text: 'About' });
  about.addEventListener('click', onAbout);
  return el('footer', { class: 'footer' }, about, ...footerLinks());
}

export function footerLinks(): HTMLElement[] {
  const email = readMeta('contact-email');
  const source = readMeta('source-url');
  return [
    el('a', {
      href: `mailto:${email}`,
      'data-testid': 'takedown-link',
      text: 'Takedown or blocklist request',
    }),
    el('a', {
      href: source,
      rel: 'noopener',
      target: '_blank',
      'data-testid': 'source-link',
      text: 'Source code',
    }),
  ];
}
