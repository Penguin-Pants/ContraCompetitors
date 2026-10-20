export type Action = 'left' | 'right' | 'jump' | 'drop' | 'fire' | 'pause';

const CODE_TO_ACTION: Record<string, Action> = {
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'jump',
  KeyS: 'drop',
  Space: 'fire',
  Escape: 'pause',
};

/** Physical key position (KeyboardEvent.code) to action. Arrow keys and all other keys map to nothing. */
export function actionForCode(code: string): Action | null {
  return CODE_TO_ACTION[code] ?? null;
}

/** Actions that start the run timer (Q-4). */
export const GAMEPLAY_ACTIONS: ReadonlySet<Action> = new Set([
  'left',
  'right',
  'jump',
  'drop',
  'fire',
]);

export class Input {
  private readonly held = new Set<Action>();
  private readonly pressQueue: Action[] = [];
  private readonly listeners = new Set<(action: Action) => void>();
  /** When false, game keys are not captured (for example while a text field has focus). */
  enabled = true;

  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => this.onKeyDown(e);
    const up = (e: KeyboardEvent) => this.onKeyUp(e);
    const blur = () => this.clear();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }

  onKeyDown(e: Pick<KeyboardEvent, 'code' | 'repeat' | 'preventDefault'>) {
    if (!this.enabled) return;
    const action = actionForCode(e.code);
    if (!action) return;
    if (action === 'fire') e.preventDefault();
    if (e.repeat) return;
    this.held.add(action);
    this.pressQueue.push(action);
    for (const listener of this.listeners) listener(action);
  }

  onKeyUp(e: Pick<KeyboardEvent, 'code'>) {
    const action = actionForCode(e.code);
    if (action) this.held.delete(action);
  }

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  /** Returns and clears the actions pressed since the last call. */
  takePresses(): Action[] {
    return this.pressQueue.splice(0);
  }

  onPress(listener: (action: Action) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear() {
    this.held.clear();
    this.pressQueue.length = 0;
  }
}
