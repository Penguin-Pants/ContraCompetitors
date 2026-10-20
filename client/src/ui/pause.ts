export interface PauseItem {
  label: string;
  action: () => void;
}

/** Pause menu on L3 (PAU-1, PAU-3). Keyboard: Tab or W/S to move, Enter to choose, Esc resumes. */
export class PauseMenu {
  readonly el: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];

  constructor(ui: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'overlay pause';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Paused');
    this.el.hidden = true;
    const title = document.createElement('h2');
    title.textContent = 'Paused';
    this.list = document.createElement('div');
    this.list.className = 'menu-list';
    this.el.append(title, this.list);
    this.el.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyW' && e.code !== 'KeyS') return;
      const i = this.buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = (i + (e.code === 'KeyS' ? 1 : -1) + this.buttons.length) % this.buttons.length;
      this.buttons[next]?.focus();
    });
    ui.append(this.el);
  }

  setItems(items: readonly PauseItem[]) {
    this.list.replaceChildren();
    this.buttons = items.map((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-button';
      b.textContent = item.label;
      b.addEventListener('click', item.action);
      this.list.append(b);
      return b;
    });
  }

  /** Replaces the label of the item at `index` (Sound toggle). */
  setLabel(index: number, label: string) {
    const b = this.buttons[index];
    if (b) b.textContent = label;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show() {
    this.el.hidden = false;
    this.buttons[0]?.focus();
  }

  hide() {
    this.el.hidden = true;
    if (this.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  dispose() {
    this.el.remove();
  }
}
