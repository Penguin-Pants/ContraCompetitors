export const NARROW_MESSAGE = 'Make the window wider to play';

/** Shows the E-12 message. The game freezes while it is visible (same freeze as pause). */
export class NarrowGuard {
  readonly el: HTMLDivElement;
  private shown = false;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'narrow-guard';
    this.el.setAttribute('role', 'alert');
    this.el.textContent = NARROW_MESSAGE;
    this.el.hidden = true;
    container.append(this.el);
  }

  update(narrow: boolean) {
    this.shown = narrow;
    this.el.hidden = !narrow;
  }

  get active(): boolean {
    return this.shown;
  }
}
