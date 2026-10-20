import type { ScoreRow } from '@lr/shared/api';
import type { Difficulty } from '@lr/shared/difficulty';
import { normalizeInitials } from '@lr/shared/initials';
import { ApiError, getLeaderboard, submitScore } from '../api/client.ts';
import { formatTime } from '../game/timer.ts';
import { el } from './dom.ts';

export const TOP_N = 10;

/** LB-3: a run qualifies when the board has fewer than 10 rows or it beats the 10th time. */
export function qualifies(rows: readonly ScoreRow[], timeMs: number): boolean {
  return rows.length < TOP_N || timeMs < rows[TOP_N - 1]!.timeMs;
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Network error';
}

/** Post-game Top 10 (LB-2, LB-3, E-11). One instance per finished run. */
export class LeaderboardView {
  private readonly slot: HTMLElement;
  private readonly difficulty: Difficulty;
  private readonly timeMs: number;
  /** Created once per finished run and reused on every retry, so a run is stored once. */
  private readonly submissionId: string;
  private live = true;

  constructor(slot: HTMLElement, difficulty: Difficulty, timeMs: number, submissionId: string) {
    this.slot = slot;
    this.difficulty = difficulty;
    this.timeMs = timeMs;
    this.submissionId = submissionId;
  }

  /** The post-game screen moved on: answers that arrive later change nothing. */
  cancel() {
    this.live = false;
  }

  async start() {
    this.slot.replaceChildren(el('p', { class: 'note', text: 'Loading the Top 10...' }));
    let rows: ScoreRow[];
    try {
      rows = (await getLeaderboard(this.difficulty)).rows;
    } catch (err) {
      if (!this.live) return;
      return this.problem(`Could not load the Top 10: ${errorText(err)}`, () => void this.start());
    }
    if (!this.live) return;
    if (qualifies(rows, this.timeMs)) this.askInitials();
    else this.board(rows, null, 'Not fast enough for the Top 10 this time.');
  }

  private problem(text: string, retry: () => void) {
    const btn = el('button', { type: 'button', class: 'menu-button', text: 'Retry' });
    btn.addEventListener('click', retry);
    this.slot.replaceChildren(
      el('p', { class: 'error-text', role: 'alert', 'data-testid': 'leaderboard-error', text }),
      btn,
    );
    btn.focus();
  }

  private askInitials(error = '') {
    const input = el('input', {
      type: 'text',
      id: 'initials',
      maxlength: '3',
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      required: '',
    });
    const form = el(
      'form',
      { class: 'menu-form initials-form', 'aria-label': 'Top 10 entry' },
      el('p', { text: 'You made the Top 10. Enter 3 initials.' }),
      el('label', { for: 'initials', text: 'Initials' }),
      input,
      el('p', { class: 'error-text', role: 'alert', text: error }),
      el('button', { type: 'submit', class: 'menu-button primary', text: 'Save' }),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const initials = normalizeInitials(input.value.trim());
      if (!initials) return this.askInitials('Use exactly 3 letters, A to Z.');
      void this.submit(initials);
    });
    this.slot.replaceChildren(form);
    input.focus();
  }

  private async submit(initials: string) {
    this.slot.replaceChildren(el('p', { class: 'note', text: 'Saving...' }));
    try {
      const res = await submitScore(this.difficulty, {
        submissionId: this.submissionId,
        initials,
        timeMs: this.timeMs,
      });
      if (this.live) this.board(res.rows, res.rowId, '');
    } catch (err) {
      if (!this.live) return;
      this.problem(
        `Your time ${formatTime(this.timeMs)} was not saved: ${errorText(err)}`,
        () => void this.submit(initials),
      );
    }
  }

  private board(rows: readonly ScoreRow[], highlight: number | null, note: string) {
    const list = el(
      'ol',
      { class: 'board', 'aria-label': 'Top 10', 'data-testid': 'board' },
      ...rows.map((r) => {
        const li = el(
          'li',
          {},
          el('span', { class: 'initials', text: r.initials }),
          el('span', { class: 'time', text: formatTime(r.timeMs) }),
        );
        if (r.id === highlight) li.className = 'mine';
        return li;
      }),
    );
    this.slot.replaceChildren(
      ...(note ? [el('p', { class: 'note', text: note })] : []),
      el('h3', { text: `Top 10 (${this.difficulty})` }),
      list,
    );
  }
}
