import { DIFFICULTIES, type Difficulty } from '@lr/shared/difficulty';
import { FACE_STYLE_SETTINGS, type FaceStyleSetting } from '../faces/quality.ts';
import { el } from './dom.ts';

export interface MenuChoice {
  url: string;
  difficulty: Difficulty;
  faceStyle: FaceStyleSetting;
}

const LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  auto: 'Auto',
  smooth: 'Smooth',
  pixelated: 'Pixelated',
};

function radioGroup(name: string, legend: string, values: readonly string[], checked: string) {
  return el(
    'fieldset',
    { class: 'radio-group' },
    el('legend', { text: legend }),
    ...values.map((v) => {
      const input = el('input', { type: 'radio', name, value: v, id: `${name}-${v}` });
      input.checked = v === checked;
      return el('label', { for: `${name}-${v}` }, input, LABELS[v] ?? v);
    }),
  );
}

/** Adds https:// when the user leaves out the scheme. The server validates the URL. */
export function normalizeUrl(raw: string): string {
  const v = raw.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
}

/** Main menu on L3 (ING-1, ING-2). Face style is not persisted; it shows Auto on every visit (D-4). */
export class MainMenu {
  readonly el: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private readonly url: HTMLInputElement;

  constructor(ui: HTMLElement, footer: HTMLElement, onStart: (choice: MenuChoice) => void) {
    this.url = el('input', {
      type: 'text',
      name: 'url',
      id: 'site-url',
      required: '',
      inputmode: 'url',
      autocomplete: 'url',
      placeholder: 'example.com',
    });
    const start = el('button', { type: 'submit', class: 'menu-button primary', text: 'Start' });
    this.form = el(
      'form',
      { class: 'menu-form', 'aria-label': 'New run' },
      el('label', { for: 'site-url', text: 'Company website' }),
      this.url,
      radioGroup('difficulty', 'Difficulty', DIFFICULTIES, 'medium'),
      radioGroup('faceStyle', 'Face style', FACE_STYLE_SETTINGS, 'auto'),
      start,
    );
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(this.form);
      onStart({
        url: normalizeUrl(String(data.get('url') ?? '')),
        difficulty: data.get('difficulty') as Difficulty,
        faceStyle: data.get('faceStyle') as FaceStyleSetting,
      });
    });
    this.el = el(
      'div',
      { class: 'overlay main-menu' },
      el('h1', { text: 'Logistics Run' }),
      el('p', { class: 'tagline', text: 'Deliver the shipment. Beat the clock. Meet the team.' }),
      this.form,
      footer,
    );
    ui.append(this.el);
  }

  show() {
    this.el.hidden = false;
    this.url.focus();
  }

  hide() {
    this.el.hidden = true;
  }
}
