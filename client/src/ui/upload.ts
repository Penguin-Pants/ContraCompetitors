import type { FaceDto } from '@lr/shared/api';
import { ApiError, uploadFaces } from '../api/client.ts';
import { el } from './dom.ts';

export const UPLOAD_MAX_FILES = 10;

/**
 * Upload prompt (ING-7, E-10, D-3): shown when fewer than 5 faces were found and always after a
 * partial ingestion. Uploads add to the site faces (I-2). Skip keeps what is there; zero faces
 * gives placeholder heads (E-8).
 */
export class UploadView {
  readonly el: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly input: HTMLInputElement;
  private readonly next: HTMLButtonElement;
  private done: (() => void) | null = null;
  private onFaces: ((faces: FaceDto[]) => Promise<void>) | null = null;
  private added = 0;

  constructor(ui: HTMLElement) {
    this.status = el('p', { class: 'note', 'data-testid': 'upload-status' });
    this.input = el('input', {
      type: 'file',
      id: 'face-files',
      multiple: '',
      accept: 'image/jpeg,image/png,image/webp,image/gif',
    });
    this.next = el('button', { type: 'button', class: 'menu-button primary', text: 'Skip' });
    this.input.addEventListener('change', () => void this.send());
    this.next.addEventListener('click', () => {
      this.el.hidden = true;
      this.done?.();
    });
    this.el = el(
      'div',
      { class: 'overlay upload', role: 'dialog', 'aria-label': 'Add faces' },
      el('h2', { text: 'Add faces' }),
      el('p', {
        class: 'intro',
        'data-testid': 'upload-intro',
      }),
      el('label', { for: 'face-files', class: 'menu-button', text: 'Choose photos (up to 10)' }),
      this.input,
      this.status,
      this.next,
    );
    this.el.hidden = true;
    ui.append(this.el);
  }

  /** Resolves when the player continues or skips. `onFaces` adds uploaded faces to the store. */
  ask(
    found: number,
    partial: boolean,
    onFaces: (faces: FaceDto[]) => Promise<void>,
  ): Promise<void> {
    this.onFaces = onFaces;
    this.added = 0;
    this.status.textContent = '';
    this.next.textContent = 'Skip';
    this.el.querySelector('.intro')!.textContent = partial
      ? `The scan stopped at the time limit with ${found} face${found === 1 ? '' : 's'}. Upload team photos, or skip.`
      : `Found ${found} face${found === 1 ? '' : 's'}. Upload team photos to add more, or skip and play with ${found ? 'repeated faces' : 'placeholder heads'}.`;
    this.el.hidden = false;
    // The file input is visually hidden behind its label but keeps keyboard focus (Enter opens it).
    this.input.focus();
    return new Promise((resolve) => (this.done = resolve));
  }

  private async send() {
    const files = [...(this.input.files ?? [])].slice(0, UPLOAD_MAX_FILES);
    this.input.value = '';
    if (!files.length) return;
    this.status.textContent = 'Uploading...';
    // No Skip or new upload until this one is in the face store.
    this.setBusy(true);
    try {
      const res = await uploadFaces(files);
      await this.onFaces?.(res.faces);
      this.added += res.faces.length;
      this.status.textContent = `Added ${this.added} face${this.added === 1 ? '' : 's'}.`;
      this.next.textContent = 'Continue';
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'internal';
      this.status.textContent =
        code === 'upload_rejected' || code === 'bad_request'
          ? 'Those files could not be used. Use JPEG, PNG, WebP or GIF photos up to 5 MB.'
          : code === 'rate_limited'
            ? 'Too many uploads from your network in the last hour. Try again later.'
            : code === 'busy'
              ? 'The server is busy. Try again in a minute.'
              : 'Upload failed. Try again.';
    } finally {
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean) {
    this.next.disabled = busy;
    this.input.disabled = busy;
  }
}
